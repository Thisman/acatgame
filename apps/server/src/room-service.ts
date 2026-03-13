import {
  CLICK_RACE_GAME_NAME,
  CLICK_RACE_NUM_PLAYERS,
  ROOM_SEAT_LABELS,
  type ClickRaceState,
  type LeaveRoomRequest,
  type PresencePingRequest,
  type RoomSession,
  type RoomSnapshot,
  type SeatState,
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
  };
};

type StorageRecord = {
  state?: StoredMatchState;
};

const defaultScores = (): Record<string, number> => ({
  '0': 0,
  '1': 0,
});

export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
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

  async joinRoom(matchID: string): Promise<RoomSession> {
    if (this.registry.isClosed(matchID)) {
      throw new HttpError(410, 'Room is closed.');
    }

    await this.assertMatchExists(matchID);

    const { playerCredentials } = await this.wrapLobbyError(() =>
      this.lobbyClient.joinMatch(CLICK_RACE_GAME_NAME, matchID, {
        playerID: '1',
        playerName: ROOM_SEAT_LABELS[1],
      }),
    );

    const session: RoomSession = {
      matchID,
      playerID: '1',
      credentials: playerCredentials,
      seat: 1,
    };

    this.registry.storeSession(session);
    await this.tryActivateStoredState(matchID);
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

    if (snapshot.status === 'waiting' && request.playerID === '0') {
      this.registry.markClosed(matchID);
      return;
    }

    if (snapshot.status !== 'gameover') {
      this.registry.markForfeit(matchID, request.playerID === '0' ? '1' : '0');
    }
  }

  async markPresence(matchID: string, request: PresencePingRequest): Promise<RoomSnapshot> {
    this.assertAuthorized(matchID, request.playerID, request.credentials);
    this.registry.touch(matchID, request.playerID);
    return this.getRoomSnapshot(matchID);
  }

  async getRoomSnapshot(matchID: string): Promise<RoomSnapshot> {
    if (this.registry.isClosed(matchID)) {
      throw new HttpError(410, 'Room is closed.');
    }

    const metadata = await this.getMetadata(matchID);
    const storedState = await this.getStoredMatchState(matchID);
    const circles = storedState?.G?.circles ?? [];
    const scores = storedState?.G?.scoreByPlayer ?? defaultScores();
    const forfeitWinner = this.registry.getForfeitWinner(matchID);
    const winner = forfeitWinner ?? storedState?.G?.winner ?? null;
    const seats = this.buildSeatStates(matchID, metadata);
    const allOccupied = seats.every((seat) => seat.occupied);
    const allConnected = seats.every((seat) => !seat.occupied || seat.connected);

    return {
      matchID,
      status: winner ? 'gameover' : allOccupied && allConnected ? 'active' : 'waiting',
      seats,
      currentPlayer: storedState?.ctx?.currentPlayer ?? null,
      winner,
      circles,
      scores,
    };
  }

  private async assertMatchExists(matchID: string): Promise<void> {
    try {
      await this.lobbyClient.getMatch(CLICK_RACE_GAME_NAME, matchID);
    } catch {
      throw new HttpError(404, 'Room not found.');
    }
  }

  private async getMetadata(matchID: string): Promise<MatchMetadata> {
    try {
      return (await this.lobbyClient.getMatch(CLICK_RACE_GAME_NAME, matchID)) as MatchMetadata;
    } catch {
      throw new HttpError(404, 'Room not found.');
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
      throw new HttpError(401, 'Invalid room session.');
    }
  }

  private async tryActivateStoredState(matchID: string): Promise<void> {
    const storage = this.db as {
      fetch?: (id: string, options: Record<string, boolean>) => Promise<StorageRecord>;
      setState?: (id: string, state: StoredMatchState, deltalog?: unknown) => Promise<void>;
    };
    const record = await storage.fetch?.(matchID, { state: true, metadata: true });

    if (!record?.state?.G || !storage.setState) {
      return;
    }

    if (record.state.G.status !== 'waiting') {
      return;
    }

    const nextState: StoredMatchState = {
      ...record.state,
      G: {
        ...record.state.G,
        status: 'active',
      },
    };

    await storage.setState(matchID, nextState);
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
          throw new HttpError(statusCode, details);
        }
      }

      throw error;
    }
  }
}
