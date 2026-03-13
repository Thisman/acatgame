import {
  CLICK_RACE_NUM_PLAYERS,
  ClickRaceGame,
  type ClickRaceClientState,
  type LeaveRoomRequest,
  type PresencePingRequest,
  type ReadyRoomRequest,
  type RoomSession,
  type RoomSnapshot,
  type UpdateSelectionRequest,
} from '@acatgame/game-core';
import { Client } from 'boardgame.io/client';
import { SocketIO } from 'boardgame.io/multiplayer';

import { UiError } from './ui-error.js';

type BoardgameState = {
  G?: ClickRaceClientState;
  ctx?: {
    currentPlayer?: string | null;
    gameover?: RoomSnapshot['matchResult'];
  };
  isActive?: boolean;
  isConnected?: boolean;
};

export interface RoomControllerState {
  session: RoomSession | null;
  snapshot: RoomSnapshot | null;
  gameState: BoardgameState | null;
  error: UiError | null;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
}

export class RoomController {
  private readonly listeners = new Set<() => void>();
  private bgioClient: any = null;
  private bgioStarted = false;
  private session: RoomSession | null = null;
  private snapshot: RoomSnapshot | null = null;
  private gameState: BoardgameState | null = null;
  private error: UiError | null = null;
  private heartbeatTimer: number | null = null;
  private snapshotTimer: number | null = null;

  constructor(private readonly serverUrl: string) {}

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getState(): RoomControllerState {
    return {
      session: this.session,
      snapshot: this.snapshot,
      gameState: this.gameState,
      error: this.error,
    };
  }

  async createRoom() {
    const session = await this.request<RoomSession>('/api/rooms', { method: 'POST' });
    await this.connect(session);
  }

  async joinRoom(matchID: string) {
    const normalized = matchID.trim();

    if (!normalized) {
      const error = new UiError('room_code_required', 'Room code is required.');
      this.error = error;
      this.emit();
      throw error;
    }

    const session = await this.request<RoomSession>(`/api/rooms/${normalized}/join`, {
      method: 'POST',
    });
    await this.connect(session);
  }

  async leaveRoom() {
    if (!this.session) {
      return;
    }

    const body: LeaveRoomRequest = {
      playerID: this.session.playerID,
      credentials: this.session.credentials,
    };

    await this.request(`/api/rooms/${this.session.matchID}/leave`, {
      method: 'POST',
      body,
    });

    this.reset();
  }

  async setReady(ready: boolean) {
    if (!this.session) {
      return;
    }

    const body: ReadyRoomRequest = {
      playerID: this.session.playerID,
      credentials: this.session.credentials,
      ready,
    };

    this.snapshot = await this.request<RoomSnapshot>(`/api/rooms/${this.session.matchID}/ready`, {
      method: 'POST',
      body,
    });
    await this.syncBoardClient();
    this.emit();
  }

  async updateSelection(selectedCardIDs: number[]) {
    if (!this.session) {
      return;
    }

    const body: UpdateSelectionRequest = {
      playerID: this.session.playerID,
      credentials: this.session.credentials,
      selectedCardIDs,
    };

    this.snapshot = await this.request<RoomSnapshot>(`/api/rooms/${this.session.matchID}/selection`, {
      method: 'POST',
      body,
    });
    this.emit();
  }

  async copyRoomCode() {
    const roomCode = this.session?.matchID ?? this.snapshot?.matchID;

    if (!roomCode || !navigator.clipboard) {
      return false;
    }

    await navigator.clipboard.writeText(roomCode);
    return true;
  }

  async refreshSnapshot() {
    if (!this.session) {
      return;
    }

    this.snapshot = await this.request<RoomSnapshot>(`/api/rooms/${this.session.matchID}`);
    await this.syncBoardClient();
    this.emit();
  }

  async placeCat(cellX: number, cellY: number, handIndex: number) {
    this.error = null;

    if (!this.bgioClient) {
      return;
    }

    this.bgioClient.moves.placeCat(cellX, cellY, handIndex);
  }

  reset() {
    this.stopNetworking();
    this.bgioClient?.stop?.();
    this.bgioClient = null;
    this.bgioStarted = false;
    this.session = null;
    this.snapshot = null;
    this.gameState = null;
    this.error = null;
    this.emit();
  }

  private async connect(session: RoomSession) {
    this.stopNetworking();
    this.bgioClient?.stop?.();

    this.session = session;
    this.snapshot = null;
    this.error = null;
    this.gameState = null;
    this.bgioClient = null;
    this.bgioStarted = false;

    await this.refreshSnapshot();
    await this.sendPresence();
    this.startNetworking();
  }

  private startNetworking() {
    this.stopNetworking();

    this.heartbeatTimer = window.setInterval(() => {
      void this.sendPresence();
    }, 4_000);

    this.snapshotTimer = window.setInterval(() => {
      void this.refreshSnapshot();
    }, 2_500);
  }

  private stopNetworking() {
    if (this.heartbeatTimer) {
      window.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.snapshotTimer) {
      window.clearInterval(this.snapshotTimer);
      this.snapshotTimer = null;
    }
  }

  private async sendPresence() {
    if (!this.session) {
      return;
    }

    const body: PresencePingRequest = {
      playerID: this.session.playerID,
      credentials: this.session.credentials,
    };

    this.snapshot = await this.request<RoomSnapshot>(`/api/rooms/${this.session.matchID}/presence`, {
      method: 'POST',
      body,
    });
    await this.syncBoardClient();
    this.emit();
  }

  private async syncBoardClient() {
    if (!this.session || !this.snapshot) {
      return;
    }

    const needsGameClient = this.snapshot.phase === 'game' || this.snapshot.phase === 'gameover';

    if (!needsGameClient) {
      return;
    }

    if (!this.bgioClient) {
      this.bgioClient = Client({
        game: ClickRaceGame,
        numPlayers: CLICK_RACE_NUM_PLAYERS,
        matchID: this.session.matchID,
        playerID: this.session.playerID,
        credentials: this.session.credentials,
        multiplayer: SocketIO({ server: this.serverUrl }),
        debug: false,
      });

      this.bgioClient.subscribe(() => {
        this.gameState = this.bgioClient.getState();
        this.emit();
      });
    }

    if (!this.bgioStarted) {
      this.bgioClient.start();
      this.bgioStarted = true;
      this.gameState = this.bgioClient.getState();
    }
  }

  private async request<T = void>(path: string, init: RequestOptions = {}) {
    const response = await fetch(`${this.serverUrl}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { errorCode?: string; error?: string };
      const error = new UiError(payload.errorCode ?? 'request_failed', payload.error ?? 'Request failed.');
      this.error = error;
      this.emit();
      throw error;
    }

    if (response.status === 204) {
      this.error = null;
      return undefined as T;
    }

    this.error = null;
    return (await response.json()) as T;
  }

  private emit() {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
