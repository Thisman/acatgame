import type { BoardCellEffect } from './cards.js';

export type RoomStatus = 'waiting' | 'active' | 'gameover';
export type RoomPhase = 'waiting' | 'ready' | 'game' | 'roundover' | 'gameover';

export interface BoardCell {
  playerID: string;
  cardID: number;
  move: number;
}

export interface RoundResult {
  round: number;
  winner: string | null;
  draw: boolean;
}

export interface MatchResult {
  winner: string | null;
  draw: boolean;
}

export interface PrivatePlayerState {
  selectedCardIDs: number[];
  deck: number[];
  hand: Array<number | null>;
  placedCount: number;
}

export interface PublicPlayerSummary {
  handCount: number;
  deckCount: number;
  placedCount: number;
}

export interface LocalPlayerState {
  hand: Array<number | null>;
  deckCount: number;
  selectedCardIDs: number[];
}

export interface ClickRaceState {
  board: Array<BoardCell | null>;
  cellEffects: Array<BoardCellEffect[]>;
  currentRound: number;
  roundWinsByPlayer: Record<string, number>;
  drawRounds: number;
  roundResult: RoundResult | null;
  matchResult: MatchResult | null;
  winner: string | null;
  players: Record<string, PrivatePlayerState>;
  playerSummaries: Record<string, PublicPlayerSummary>;
}

export interface ClickRaceClientState extends Omit<ClickRaceState, 'players'> {
  localPlayer: LocalPlayerState | null;
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
  phase: RoomPhase;
  seats: SeatState[];
  currentPlayer: string | null;
  winner: string | null;
  board: Array<BoardCell | null>;
  cellEffects: Array<BoardCellEffect[]>;
  round: number;
  roundWinsByPlayer: Record<string, number>;
  drawRounds: number;
  roundResult: RoundResult | null;
  matchResult: MatchResult | null;
  readyByPlayer: Record<string, boolean>;
  selectedCardIDsByPlayer: Record<string, number[]>;
  requiredPlayers: number;
}

export interface PresencePingRequest {
  playerID: string;
  credentials: string;
}

export interface LeaveRoomRequest extends PresencePingRequest {}

export interface ReadyRoomRequest extends PresencePingRequest {
  ready: boolean;
}

export interface UpdateSelectionRequest extends PresencePingRequest {
  selectedCardIDs: number[];
}
