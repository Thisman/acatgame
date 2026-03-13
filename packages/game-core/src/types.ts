export type RoomStatus = 'waiting' | 'active' | 'gameover';

export interface CircleMark {
  id: string;
  playerID: string;
  xRatio: number;
  yRatio: number;
  turn: number;
}

export interface ClickRaceState {
  circles: CircleMark[];
  scoreByPlayer: Record<string, number>;
  status: RoomStatus;
  winner: string | null;
}

export interface SeatState {
  playerID: string;
  occupied: boolean;
  connected: boolean;
  label: string;
}

export interface RoomSession {
  matchID: string;
  playerID: string;
  credentials: string;
  seat: number;
}

export interface RoomSnapshot {
  matchID: string;
  status: RoomStatus;
  seats: SeatState[];
  currentPlayer: string | null;
  winner: string | null;
  circles: CircleMark[];
  scores: Record<string, number>;
}

export interface PresencePingRequest {
  playerID: string;
  credentials: string;
}

export interface LeaveRoomRequest extends PresencePingRequest {}

