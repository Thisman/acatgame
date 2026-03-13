import {
  type AvailableRoomSummary,
  CAT_MATCH_BOARD_SIZE,
  CLICK_RACE_GAME_NAME,
  CLICK_RACE_NUM_PLAYERS,
  ERROR_CODES,
  READY_CARD_POOL_SIZE,
  READY_CARD_SELECTION_LIMIT,
  ROOM_SEAT_LABELS,
  type ClickRaceState,
  type ErrorCode,
  type LeaveRoomRequest,
  type MatchResult,
  type PresencePingRequest,
  type ReadyRoomRequest,
  type RoomPhase,
  type RoomSession,
  type RoomSnapshot,
  type RoundResult,
  type SeatState,
  type UpdateSelectionRequest,
  createGameplayState,
  createNextRoundState,
  getVisibleCellEffectsForPlayer,
  getRoundStarter,
} from '@acatgame/game-core';
import type { LobbyClient as LobbyClientType } from 'boardgame.io/client';

import { LobbyClient, LobbyClientError } from './boardgame-compat.js';
import type { RoomRegistry } from './room-registry.js';

type MatchMetadata = {
  players: Array<{
    id: number;
    name?: string;
  }>;
};

type StoredMatchState = {
  G?: ClickRaceState;
  ctx?: {
    currentPlayer?: string;
    gameover?: MatchResult;
  };
  _stateID?: number;
  _undo?: unknown[];
  _redo?: unknown[];
  plugins?: Record<string, unknown>;
};

type StorageRecord = {
  state?: StoredMatchState;
  initialState?: StoredMatchState;
};

type RoomAvailability =
  | {
      status: 'available';
      metadata: MatchMetadata;
      seat: number;
    }
  | {
      status: 'closed' | 'not_found' | 'unavailable';
    };

export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export class RoomService {
  private readonly lobbyClient: LobbyClientType;

  constructor(
    baseUrl: string,
    private readonly registry: RoomRegistry,
    private readonly db: unknown,
  ) {
    this.lobbyClient = new LobbyClient({ server: baseUrl });
  }

  async createRoom(): Promise<RoomSession> {
    const { matchID } = await this.wrapLobbyError(() =>
      this.lobbyClient.createMatch(CLICK_RACE_GAME_NAME, {
        numPlayers: CLICK_RACE_NUM_PLAYERS,
      }),
    );

    const { playerCredentials } = await this.wrapLobbyError(() =>
      this.lobbyClient.joinMatch(CLICK_RACE_GAME_NAME, matchID, {
        playerID: '0',
        playerName: ROOM_SEAT_LABELS[0],
      }),
    );

    const session: RoomSession = {
      matchID,
      playerID: '0',
      credentials: playerCredentials,
      seat: 0,
    };

    this.registry.storeSession(session);
    return session;
  }

  async listAvailableRooms(): Promise<AvailableRoomSummary[]> {
    const availableRooms: AvailableRoomSummary[] = [];

    for (const matchID of this.registry.listMatchIDs()) {
      const availability = await this.getRoomAvailability(matchID);

      if (availability.status === 'available') {
        availableRooms.push({ matchID });
      }
    }

    return availableRooms;
  }

  async joinRoom(matchID: string): Promise<RoomSession> {
    const availability = await this.getRoomAvailability(matchID);

    if (availability.status === 'closed') {
      throw new HttpError(410, ERROR_CODES.ROOM_CLOSED, 'Room is closed.');
    }

    if (availability.status === 'not_found') {
      throw new HttpError(404, ERROR_CODES.ROOM_NOT_FOUND, 'Room not found.');
    }

    if (availability.status === 'unavailable') {
      throw new HttpError(409, ERROR_CODES.ROOM_UNAVAILABLE, 'Room is unavailable.');
    }

    if (availability.status !== 'available') {
      throw new HttpError(500, ERROR_CODES.INTERNAL_SERVER_ERROR, 'Internal server error.');
    }

    const { seat } = availability;

    const { playerCredentials } = await this.wrapLobbyError(() =>
      this.lobbyClient.joinMatch(CLICK_RACE_GAME_NAME, matchID, {
        playerID: String(seat),
        playerName: ROOM_SEAT_LABELS[seat],
      }),
    );

    const session: RoomSession = {
      matchID,
      playerID: String(seat),
      credentials: playerCredentials,
      seat,
    };

    this.registry.storeSession(session);
    return session;
  }

  async leaveRoom(matchID: string, request: LeaveRoomRequest): Promise<void> {
    this.assertAuthorized(matchID, request.playerID, request.credentials);

    const snapshot = await this.getRoomSnapshot(matchID);

    await this.wrapLobbyError(() =>
      this.lobbyClient.leaveMatch(CLICK_RACE_GAME_NAME, matchID, {
        playerID: request.playerID,
        credentials: request.credentials,
      }),
    );

    this.registry.removePlayer(matchID, request.playerID);

    if (snapshot.phase !== 'game' && snapshot.phase !== 'gameover') {
      this.registry.resetReady(matchID);
      this.registry.setGameStarted(matchID, false);

      const remainingPlayers = snapshot.seats.filter((seat) => seat.occupied && seat.playerID !== request.playerID);
      if (remainingPlayers.length === 0) {
        this.registry.markClosed(matchID);
      }
      return;
    }

    if (snapshot.phase === 'game') {
      this.registry.markForfeit(matchID, request.playerID === '0' ? '1' : '0');
    }
  }

  async markPresence(matchID: string, request: PresencePingRequest): Promise<RoomSnapshot> {
    this.assertAuthorized(matchID, request.playerID, request.credentials);
    this.registry.touch(matchID, request.playerID);
    return this.getRoomSnapshot(matchID, request.playerID);
  }

  async setReady(matchID: string, request: ReadyRoomRequest): Promise<RoomSnapshot> {
    this.assertAuthorized(matchID, request.playerID, request.credentials);

    const snapshot = await this.getRoomSnapshot(matchID, request.playerID);

    if (snapshot.phase === 'waiting') {
      throw new HttpError(409, ERROR_CODES.ROOM_WAITING_FOR_PLAYERS, 'Room is still waiting for players.');
    }

    if (snapshot.phase === 'game' || snapshot.phase === 'gameover') {
      throw new HttpError(409, ERROR_CODES.READY_CHANGE_FORBIDDEN, 'Ready state cannot be changed now.');
    }

    const selectedCardIDs = this.registry.getSelectedCardIDs(matchID, request.playerID);

    if (request.ready && selectedCardIDs.length !== READY_CARD_SELECTION_LIMIT) {
      throw new HttpError(
        409,
        ERROR_CODES.READY_SELECTION_REQUIRED,
        `Select exactly ${READY_CARD_SELECTION_LIMIT} cards before marking ready.`,
      );
    }

    this.registry.setReady(matchID, request.playerID, request.ready);

    const nextSnapshot = await this.getRoomSnapshot(matchID, request.playerID);
    const occupiedPlayerIDs = nextSnapshot.seats.filter((seat) => seat.occupied).map((seat) => seat.playerID);
    const everyoneReady =
      occupiedPlayerIDs.length === nextSnapshot.requiredPlayers &&
      occupiedPlayerIDs.every((playerID) => nextSnapshot.readyByPlayer[playerID]);

    if (everyoneReady) {
      if (snapshot.phase === 'roundover') {
        await this.advanceToNextRound(matchID);
      } else if (!this.registry.hasGameStarted(matchID)) {
        await this.resetGameplayState(matchID);
      }

      this.registry.setGameStarted(matchID, true);
      this.registry.resetReady(matchID);
    }

    return this.getRoomSnapshot(matchID, request.playerID);
  }

  async updateSelection(matchID: string, request: UpdateSelectionRequest): Promise<RoomSnapshot> {
    this.assertAuthorized(matchID, request.playerID, request.credentials);

    const snapshot = await this.getRoomSnapshot(matchID, request.playerID);

    if (snapshot.phase === 'waiting') {
      throw new HttpError(409, ERROR_CODES.ROOM_WAITING_FOR_PLAYERS, 'Room is still waiting for players.');
    }

    if (snapshot.phase === 'game' || snapshot.phase === 'gameover' || snapshot.phase === 'roundover') {
      throw new HttpError(409, ERROR_CODES.READY_CHANGE_FORBIDDEN, 'Selection cannot be changed now.');
    }

    if (snapshot.readyByPlayer[request.playerID]) {
      throw new HttpError(409, ERROR_CODES.READY_CHANGE_FORBIDDEN, 'Selection cannot be changed while ready.');
    }

    const selectedCardIDs = this.validateSelection(request.selectedCardIDs);
    this.registry.setSelectedCardIDs(matchID, request.playerID, selectedCardIDs);

    return this.getRoomSnapshot(matchID, request.playerID);
  }

  async getRoomSnapshot(matchID: string, viewerPlayerID?: string | null): Promise<RoomSnapshot> {
    if (this.registry.isClosed(matchID)) {
      throw new HttpError(410, ERROR_CODES.ROOM_CLOSED, 'Room is closed.');
    }

    const metadata = await this.getMetadata(matchID);
    const storedState = await this.getStoredMatchState(matchID);
    const forfeitWinner = this.registry.getForfeitWinner(matchID);
    const board = storedState?.G?.board ?? [];
    const cellEffects =
      storedState?.G?.cellEffects ??
      Array.from({ length: Math.max(board.length, CAT_MATCH_BOARD_SIZE * CAT_MATCH_BOARD_SIZE) }, () => []);
    const visibleCellEffects = getVisibleCellEffectsForPlayer(board, cellEffects, viewerPlayerID);
    const roundWinsByPlayer = storedState?.G?.roundWinsByPlayer ?? { '0': 0, '1': 0 };
    const drawRounds = storedState?.G?.drawRounds ?? 0;
    const roundResult = storedState?.G?.roundResult ?? null;
    const storedMatchResult = storedState?.G?.matchResult ?? storedState?.ctx?.gameover ?? null;
    const matchResult = forfeitWinner
      ? {
          winner: forfeitWinner,
          draw: false,
        }
      : storedMatchResult;
    const winner = matchResult?.winner ?? null;
    const seats = this.buildSeatStates(matchID, metadata);
    const allOccupied = seats.every((seat) => seat.occupied);
    const allConnected = seats.every((seat) => !seat.occupied || seat.connected);
    let gameStarted = this.registry.hasGameStarted(matchID);

    if (roundResult && !matchResult && gameStarted) {
      this.registry.resetReady(matchID);
      this.registry.setGameStarted(matchID, false);
      gameStarted = false;
    }

    if (!gameStarted && (!allOccupied || !allConnected)) {
      this.registry.resetReady(matchID);
    }

    const phase = this.resolvePhase({
      allOccupied,
      allConnected,
      gameStarted,
      roundResult,
      matchResult,
    });

    return {
      matchID,
      status: phase === 'game' || phase === 'roundover' ? 'active' : phase === 'gameover' ? 'gameover' : 'waiting',
      phase,
      seats,
      currentPlayer: storedState?.ctx?.currentPlayer ?? null,
      winner,
      board,
      cellEffects: visibleCellEffects,
      round: storedState?.G?.currentRound ?? 1,
      roundWinsByPlayer,
      drawRounds,
      roundResult,
      matchResult,
      readyByPlayer: this.buildReadyState(matchID),
      selectedCardIDsByPlayer: this.buildSelectedCardsState(matchID),
      requiredPlayers: CLICK_RACE_NUM_PLAYERS,
    };
  }

  private async getMetadata(matchID: string): Promise<MatchMetadata> {
    try {
      return (await this.lobbyClient.getMatch(CLICK_RACE_GAME_NAME, matchID)) as MatchMetadata;
    } catch {
      throw new HttpError(404, ERROR_CODES.ROOM_NOT_FOUND, 'Room not found.');
    }
  }

  private async getStoredMatchState(matchID: string): Promise<StoredMatchState | undefined> {
    const record = (await (this.db as {
      fetch?: (id: string, options: Record<string, boolean>) => Promise<StorageRecord>;
    }).fetch?.(matchID, {
      metadata: true,
      state: true,
    })) as StorageRecord | undefined;

    return record?.state;
  }

  private buildSeatStates(matchID: string, metadata: MatchMetadata): SeatState[] {
    return ROOM_SEAT_LABELS.map((label, seatIndex) => {
      const playerID = String(seatIndex);
      const player = metadata.players?.find((entry: { id: number; name?: string }) => String(entry.id) === playerID);

      return {
        playerID,
        occupied: !!player?.name,
        connected: !!player?.name && this.registry.isConnected(matchID, playerID),
        label,
      };
    });
  }

  private assertAuthorized(matchID: string, playerID: string, credentials: string): void {
    if (!this.registry.validateSession(matchID, playerID, credentials)) {
      throw new HttpError(401, ERROR_CODES.INVALID_ROOM_SESSION, 'Invalid room session.');
    }
  }

  private async resetGameplayState(matchID: string): Promise<void> {
    const storage = this.db as {
      fetch?: (id: string, options: Record<string, boolean>) => Promise<StorageRecord>;
      setState?: (id: string, state: StoredMatchState, deltalog?: unknown) => Promise<void>;
    };
    const record = await storage.fetch?.(matchID, { state: true, initialState: true, metadata: true });

    if (!record?.initialState || !storage.setState) {
      return;
    }

    const selectedCardIDsByPlayer = this.buildSelectedCardsState(matchID);
    const gameState = createGameplayState(selectedCardIDsByPlayer);
    const initialState = record.initialState;

    await storage.setState(matchID, {
      ...initialState,
      G: gameState,
      ctx: {
        ...initialState.ctx,
        currentPlayer: '0',
        gameover: undefined,
      },
      _stateID: (record.state?._stateID ?? initialState._stateID ?? 0) + 1,
      _undo: [],
      _redo: [],
    });
  }

  private async advanceToNextRound(matchID: string): Promise<void> {
    const storage = this.db as {
      fetch?: (id: string, options: Record<string, boolean>) => Promise<StorageRecord>;
      setState?: (id: string, state: StoredMatchState, deltalog?: unknown) => Promise<void>;
    };
    const record = await storage.fetch?.(matchID, { state: true, metadata: true });

    if (!record?.state?.G || !storage.setState) {
      return;
    }

    const nextState = createNextRoundState(record.state.G);

    await storage.setState(matchID, {
      ...record.state,
      G: nextState,
      ctx: {
        ...record.state.ctx,
        currentPlayer: getRoundStarter(nextState.currentRound),
        gameover: undefined,
      },
      _stateID: (record.state._stateID ?? 0) + 1,
      _undo: [],
      _redo: [],
    });
  }

  private getNextAvailableSeat(metadata: MatchMetadata): number | null {
    for (let seat = 0; seat < CLICK_RACE_NUM_PLAYERS; seat += 1) {
      const player = metadata.players?.find((entry: { id: number; name?: string }) => entry.id === seat);
      if (!player?.name) {
        return seat;
      }
    }

    return null;
  }

  private async getRoomAvailability(matchID: string): Promise<RoomAvailability> {
    if (this.registry.isClosed(matchID)) {
      return { status: 'closed' };
    }

    if (this.registry.hasGameStarted(matchID)) {
      return { status: 'unavailable' };
    }

    let metadata: MatchMetadata;

    try {
      metadata = await this.getMetadata(matchID);
    } catch (error) {
      if (error instanceof HttpError && error.code === ERROR_CODES.ROOM_NOT_FOUND) {
        return { status: 'not_found' };
      }

      throw error;
    }

    const seat = this.getNextAvailableSeat(metadata);

    if (seat === null) {
      return { status: 'unavailable' };
    }

    return {
      status: 'available',
      metadata,
      seat,
    };
  }

  private buildReadyState(matchID: string): Record<string, boolean> {
    return ROOM_SEAT_LABELS.reduce<Record<string, boolean>>((acc, _label, seatIndex) => {
      const playerID = String(seatIndex);
      acc[playerID] = this.registry.isReady(matchID, playerID);
      return acc;
    }, {});
  }

  private buildSelectedCardsState(matchID: string): Record<string, number[]> {
    return ROOM_SEAT_LABELS.reduce<Record<string, number[]>>((acc, _label, seatIndex) => {
      const playerID = String(seatIndex);
      acc[playerID] = this.registry.getSelectedCardIDs(matchID, playerID);
      return acc;
    }, {});
  }

  private validateSelection(selectedCardIDs: number[]): number[] {
    if (!Array.isArray(selectedCardIDs)) {
      throw new HttpError(400, ERROR_CODES.READY_SELECTION_INVALID, 'Card selection must be an array.');
    }

    if (selectedCardIDs.length > READY_CARD_SELECTION_LIMIT) {
      throw new HttpError(
        400,
        ERROR_CODES.READY_SELECTION_INVALID,
        `You can select at most ${READY_CARD_SELECTION_LIMIT} cards.`,
      );
    }

    const uniqueCardIDs = new Set<number>();

    for (const cardID of selectedCardIDs) {
      if (!Number.isInteger(cardID) || cardID < 0 || cardID >= READY_CARD_POOL_SIZE) {
        throw new HttpError(400, ERROR_CODES.READY_SELECTION_INVALID, 'Selected card IDs are out of range.');
      }

      if (uniqueCardIDs.has(cardID)) {
        throw new HttpError(400, ERROR_CODES.READY_SELECTION_INVALID, 'Selected card IDs must be unique.');
      }

      uniqueCardIDs.add(cardID);
    }

    return [...selectedCardIDs];
  }

  private resolvePhase({
    allOccupied,
    allConnected,
    gameStarted,
    roundResult,
    matchResult,
  }: {
    allOccupied: boolean;
    allConnected: boolean;
    gameStarted: boolean;
    roundResult: RoundResult | null;
    matchResult: MatchResult | null;
  }): RoomPhase {
    if (matchResult) {
      return 'gameover';
    }

    if (!allOccupied || !allConnected) {
      return gameStarted ? 'game' : 'waiting';
    }

    if (roundResult) {
      return 'roundover';
    }

    if (gameStarted) {
      return 'game';
    }

    return 'ready';
  }

  private async wrapLobbyError<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (error) {
      if (error instanceof LobbyClientError) {
        const statusCode = Number(error.message.replace('HTTP status ', ''));
        const details =
          typeof error.details === 'string'
            ? error.details
            : typeof error.details?.error === 'string'
              ? error.details.error
              : 'Lobby request failed.';

        if (Number.isFinite(statusCode)) {
          throw new HttpError(statusCode, ERROR_CODES.LOBBY_REQUEST_FAILED, details);
        }
      }

      throw error;
    }
  }
}
