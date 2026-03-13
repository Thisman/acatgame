import type { RoomSession } from '@acatgame/game-core';

interface PresenceEntry {
  lastSeenAt: number;
}

interface RoomRegistryEntry {
  closed: boolean;
  forfeitWinner: string | null;
  gameStarted: boolean;
  sessions: Map<string, RoomSession>;
  presence: Map<string, PresenceEntry>;
  readyByPlayer: Map<string, boolean>;
}

export class RoomRegistry {
  private readonly rooms = new Map<string, RoomRegistryEntry>();

  constructor(private readonly offlineGraceMs: number) {}

  ensureRoom(matchID: string): RoomRegistryEntry {
    let entry = this.rooms.get(matchID);

    if (!entry) {
      entry = {
        closed: false,
        forfeitWinner: null,
        gameStarted: false,
        sessions: new Map(),
        presence: new Map(),
        readyByPlayer: new Map(),
      };
      this.rooms.set(matchID, entry);
    }

    return entry;
  }

  storeSession(session: RoomSession): void {
    const room = this.ensureRoom(session.matchID);
    room.closed = false;
    room.sessions.set(session.playerID, session);
    room.presence.set(session.playerID, { lastSeenAt: Date.now() });
    room.readyByPlayer.set(session.playerID, false);
  }

  getSession(matchID: string, playerID: string): RoomSession | undefined {
    return this.rooms.get(matchID)?.sessions.get(playerID);
  }

  validateSession(matchID: string, playerID: string, credentials: string): boolean {
    const session = this.getSession(matchID, playerID);
    return !!session && session.credentials === credentials;
  }

  touch(matchID: string, playerID: string): void {
    const room = this.ensureRoom(matchID);
    room.presence.set(playerID, { lastSeenAt: Date.now() });
  }

  removePlayer(matchID: string, playerID: string): void {
    const room = this.ensureRoom(matchID);
    room.sessions.delete(playerID);
    room.presence.delete(playerID);
    room.readyByPlayer.delete(playerID);
  }

  isConnected(matchID: string, playerID: string): boolean {
    const lastSeen = this.rooms.get(matchID)?.presence.get(playerID)?.lastSeenAt;
    return typeof lastSeen === 'number' && Date.now() - lastSeen <= this.offlineGraceMs;
  }

  markClosed(matchID: string): void {
    this.ensureRoom(matchID).closed = true;
  }

  isClosed(matchID: string): boolean {
    return this.rooms.get(matchID)?.closed ?? false;
  }

  markForfeit(matchID: string, winner: string): void {
    this.ensureRoom(matchID).forfeitWinner = winner;
  }

  getForfeitWinner(matchID: string): string | null {
    return this.rooms.get(matchID)?.forfeitWinner ?? null;
  }

  setReady(matchID: string, playerID: string, ready: boolean): void {
    const room = this.ensureRoom(matchID);
    room.readyByPlayer.set(playerID, ready);
  }

  isReady(matchID: string, playerID: string): boolean {
    return this.rooms.get(matchID)?.readyByPlayer.get(playerID) ?? false;
  }

  resetReady(matchID: string): void {
    const room = this.ensureRoom(matchID);
    for (const playerID of room.readyByPlayer.keys()) {
      room.readyByPlayer.set(playerID, false);
    }
  }

  setGameStarted(matchID: string, started: boolean): void {
    const room = this.ensureRoom(matchID);
    room.gameStarted = started;
  }

  hasGameStarted(matchID: string): boolean {
    return this.rooms.get(matchID)?.gameStarted ?? false;
  }
}
