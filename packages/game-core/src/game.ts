import type { Game, MoveFn } from 'boardgame.io';

import {
  CAT_MATCH_BOARD_SIZE,
  CAT_MATCH_HAND_SIZE,
  CAT_MATCH_MAX_ROUNDS,
  CAT_MATCH_ROUNDS_TO_WIN,
  CAT_MATCH_WIN_LENGTH,
  CLICK_RACE_NUM_PLAYERS,
  READY_CARD_SELECTION_LIMIT,
} from './constants.js';
import type {
  BoardCell,
  ClickRaceClientState,
  ClickRaceState,
  LocalPlayerState,
  MatchResult,
  PrivatePlayerState,
  PublicPlayerSummary,
  RoundResult,
} from './types.js';

type SelectedCardsByPlayer = Record<string, number[]>;

const PLAYER_IDS = ['0', '1'] as const;
const INVALID_MOVE = 'INVALID_MOVE' as const;

const createInitialScore = (): Record<string, number> => ({
  '0': 0,
  '1': 0,
});

const createEmptyBoard = () =>
  Array.from({ length: CAT_MATCH_BOARD_SIZE * CAT_MATCH_BOARD_SIZE }, () => null as BoardCell | null);

const cloneRoundResult = (result: RoundResult | null): RoundResult | null =>
  result
    ? {
        round: result.round,
        winner: result.winner,
        draw: result.draw,
      }
    : null;

const cloneMatchResult = (result: MatchResult | null): MatchResult | null =>
  result
    ? {
        winner: result.winner,
        draw: result.draw,
      }
    : null;

const fisherYatesShuffle = <T>(values: T[]) => {
  const next = [...values];

  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }

  return next;
};

const shuffleCards = (
  values: number[],
  random?: {
    Shuffle?: <T>(items: T[]) => T[];
  },
) => (random?.Shuffle ? random.Shuffle([...values]) : fisherYatesShuffle(values));

export const getRoundStarter = (round: number) => (round % 2 === 1 ? '0' : '1');

const getOtherPlayer = (playerID: string) => (playerID === '0' ? '1' : '0');

const createPrivatePlayerState = (
  selectedCardIDs: number[],
  random?: {
    Shuffle?: <T>(items: T[]) => T[];
  },
): PrivatePlayerState => {
  const normalizedSelection = selectedCardIDs.slice(0, READY_CARD_SELECTION_LIMIT);
  const shuffled = shuffleCards(normalizedSelection, random);
  const hand = Array.from({ length: CAT_MATCH_HAND_SIZE }, (_value, index) => shuffled[index] ?? null);

  return {
    selectedCardIDs: [...normalizedSelection],
    hand,
    deck: shuffled.slice(CAT_MATCH_HAND_SIZE),
    placedCount: 0,
  };
};

const createPlayerSummaries = (players: Record<string, PrivatePlayerState>): Record<string, PublicPlayerSummary> =>
  PLAYER_IDS.reduce<Record<string, PublicPlayerSummary>>((acc, playerID) => {
    const player = players[playerID];
    acc[playerID] = {
      handCount: player.hand.filter((cardID) => cardID !== null).length,
      deckCount: player.deck.length,
      placedCount: player.placedCount,
    };
    return acc;
  }, {});

const isValidSelectionSet = (selectedCardIDs: number[]) => selectedCardIDs.length === READY_CARD_SELECTION_LIMIT;

export const createGameplayState = (
  selectedCardIDsByPlayer: SelectedCardsByPlayer = {},
  random?: {
    Shuffle?: <T>(items: T[]) => T[];
  },
): ClickRaceState => {
  const players = PLAYER_IDS.reduce<Record<string, PrivatePlayerState>>((acc, playerID) => {
    const selectedCardIDs = selectedCardIDsByPlayer[playerID] ?? [];
    acc[playerID] = createPrivatePlayerState(
      isValidSelectionSet(selectedCardIDs) ? selectedCardIDs : [],
      random,
    );
    return acc;
  }, {});

  return {
    board: createEmptyBoard(),
    currentRound: 1,
    roundWinsByPlayer: createInitialScore(),
    drawRounds: 0,
    roundResult: null,
    matchResult: null,
    winner: null,
    players,
    playerSummaries: createPlayerSummaries(players),
  };
};

const buildClientState = (G: ClickRaceState, playerID?: string | null): ClickRaceClientState => {
  const localPlayerState = playerID ? G.players[playerID] : null;
  const localPlayer: LocalPlayerState | null = localPlayerState
    ? {
        hand: [...localPlayerState.hand],
        deckCount: localPlayerState.deck.length,
        selectedCardIDs: [...localPlayerState.selectedCardIDs],
      }
    : null;

  return {
    board: [...G.board],
    currentRound: G.currentRound,
    roundWinsByPlayer: { ...G.roundWinsByPlayer },
    drawRounds: G.drawRounds,
    roundResult: cloneRoundResult(G.roundResult),
    matchResult: cloneMatchResult(G.matchResult),
    winner: G.winner,
    playerSummaries: {
      '0': { ...G.playerSummaries['0'] },
      '1': { ...G.playerSummaries['1'] },
    },
    localPlayer,
  };
};

const refreshPlayerSummaries = (G: ClickRaceState) => {
  G.playerSummaries = createPlayerSummaries(G.players);
};

const hasCardsRemaining = (player: PrivatePlayerState) =>
  player.deck.length > 0 || player.hand.some((cardID) => cardID !== null);

const isRoundDraw = (G: ClickRaceState) => PLAYER_IDS.every((playerID) => !hasCardsRemaining(G.players[playerID]));

const hasWinningLine = (board: Array<BoardCell | null>, x: number, y: number, playerID: string) => {
  const directions = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
  ] as const;

  for (const [dx, dy] of directions) {
    let chain = 1;

    for (const direction of [-1, 1] as const) {
      let cursorX = x + dx * direction;
      let cursorY = y + dy * direction;

      while (
        cursorX >= 0 &&
        cursorX < CAT_MATCH_BOARD_SIZE &&
        cursorY >= 0 &&
        cursorY < CAT_MATCH_BOARD_SIZE
      ) {
        const cell = board[cursorY * CAT_MATCH_BOARD_SIZE + cursorX];

        if (!cell || cell.playerID !== playerID) {
          break;
        }

        chain += 1;
        cursorX += dx * direction;
        cursorY += dy * direction;
      }
    }

    if (chain >= CAT_MATCH_WIN_LENGTH) {
      return true;
    }
  }

  return false;
};

const resolveMatchResult = (G: ClickRaceState, completedRound: number): MatchResult | null => {
  for (const playerID of PLAYER_IDS) {
    if ((G.roundWinsByPlayer[playerID] ?? 0) >= CAT_MATCH_ROUNDS_TO_WIN) {
      return {
        winner: playerID,
        draw: false,
      };
    }
  }

  if (completedRound < CAT_MATCH_MAX_ROUNDS) {
    return null;
  }

  const leftWins = G.roundWinsByPlayer['0'] ?? 0;
  const rightWins = G.roundWinsByPlayer['1'] ?? 0;

  if (leftWins === rightWins) {
    return {
      winner: null,
      draw: true,
    };
  }

  return {
    winner: leftWins > rightWins ? '0' : '1',
    draw: false,
  };
};

export const createNextRoundState = (
  state: ClickRaceState,
  random?: {
    Shuffle?: <T>(items: T[]) => T[];
  },
): ClickRaceState => {
  const nextRound = state.currentRound + 1;
  const players = PLAYER_IDS.reduce<Record<string, PrivatePlayerState>>((acc, playerID) => {
    acc[playerID] = createPrivatePlayerState(state.players[playerID].selectedCardIDs, random);
    return acc;
  }, {});

  return {
    ...state,
    board: createEmptyBoard(),
    currentRound: nextRound,
    roundResult: null,
    players,
    playerSummaries: createPlayerSummaries(players),
  };
};

const placeCatMove: MoveFn<ClickRaceState> = ({ G, ctx, events, random, playerID }, cellX: number, cellY: number, handIndex: number) => {
  if (!playerID || G.matchResult) {
    return INVALID_MOVE;
  }

  if (ctx.currentPlayer !== playerID) {
    return INVALID_MOVE;
  }

  if (
    !Number.isInteger(cellX) ||
    !Number.isInteger(cellY) ||
    cellX < 0 ||
    cellX >= CAT_MATCH_BOARD_SIZE ||
    cellY < 0 ||
    cellY >= CAT_MATCH_BOARD_SIZE
  ) {
    return INVALID_MOVE;
  }

  if (!Number.isInteger(handIndex) || handIndex < 0 || handIndex >= CAT_MATCH_HAND_SIZE) {
    return INVALID_MOVE;
  }

  const boardIndex = cellY * CAT_MATCH_BOARD_SIZE + cellX;

  if (G.board[boardIndex]) {
    return INVALID_MOVE;
  }

  const playerState = G.players[playerID];
  const cardID = playerState.hand[handIndex];

  if (cardID === null || cardID === undefined) {
    return INVALID_MOVE;
  }

  G.board[boardIndex] = {
    playerID,
    cardID,
    move: ctx.turn,
  };

  playerState.hand[handIndex] = playerState.deck.shift() ?? null;
  playerState.placedCount += 1;
  refreshPlayerSummaries(G);

  const roundWon = hasWinningLine(G.board, cellX, cellY, playerID);
  const roundDraw = !roundWon && isRoundDraw(G);

  if (!roundWon && !roundDraw) {
    events.endTurn({ next: getOtherPlayer(playerID) });
    return;
  }

  const completedRound = G.currentRound;

  if (roundWon) {
    G.roundWinsByPlayer[playerID] = (G.roundWinsByPlayer[playerID] ?? 0) + 1;
    G.roundResult = {
      round: completedRound,
      winner: playerID,
      draw: false,
    };
  } else {
    G.drawRounds += 1;
    G.roundResult = {
      round: completedRound,
      winner: null,
      draw: true,
    };
  }

  const matchResult = resolveMatchResult(G, completedRound);

  if (matchResult) {
    G.matchResult = matchResult;
    G.winner = matchResult.winner;
    return;
  }

  return;
};

export const ClickRaceGame: Game<ClickRaceState> = {
  name: 'click-race',
  minPlayers: CLICK_RACE_NUM_PLAYERS,
  maxPlayers: CLICK_RACE_NUM_PLAYERS,
  setup: ({ random }) => createGameplayState({}, random),
  events: {
    endTurn: true,
  },
  moves: {
    placeCat: {
      move: placeCatMove as MoveFn<ClickRaceState>,
      client: false,
    },
  },
  endIf: ({ G }) => (G.matchResult ? cloneMatchResult(G.matchResult) : undefined),
  playerView: ({ G, playerID }) => buildClientState(G, playerID),
};
