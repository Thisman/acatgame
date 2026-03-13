import type { RoomSession } from '@acatgame/game-core';

interface PresenceEntry {
  lastSeenAt: number;
}

interface RoomRegistryEntry {
  closed: boolean;
  forfeitWinner: string | null;
  sessions: Map<string, RoomSession>;
  presence: Map<string, PresenceEntry>;
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
        sessions: new Map(),
        presence: new Map(),
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
}

