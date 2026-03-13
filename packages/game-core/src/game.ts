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
import {
  getAdjacentConvertMechanic,
  getAdjacentPushMechanic,
  getCardDefinition,
  type ArmedMineEffect,
  type BoardCellEffect,
} from './cards.js';
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

const createEmptyCellEffects = () =>
  Array.from({ length: CAT_MATCH_BOARD_SIZE * CAT_MATCH_BOARD_SIZE }, () => [] as BoardCellEffect[]);

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

const cloneCellEffect = (effect: BoardCellEffect): BoardCellEffect => {
  switch (effect.type) {
    case 'placementLock':
    case 'armedMine':
      return {
        ...effect,
      };
  }
};

const normalizeCellEffects = (cellEffects?: Array<BoardCellEffect[]> | null) => {
  const normalized = createEmptyCellEffects();

  if (!cellEffects) {
    return normalized;
  }

  for (let index = 0; index < normalized.length; index += 1) {
    normalized[index] = (cellEffects[index] ?? []).map(cloneCellEffect);
  }

  return normalized;
};

const resolveMineExplosions = (
  G: ClickRaceState,
  cellEffects: Array<BoardCellEffect[]>,
  explodedMines: ArmedMineEffect[],
) => {
  for (const effect of explodedMines) {
    if (effect.type !== 'armedMine') {
      continue;
    }

    const centerX = effect.sourceBoardIndex % CAT_MATCH_BOARD_SIZE;
    const centerY = Math.floor(effect.sourceBoardIndex / CAT_MATCH_BOARD_SIZE);

    for (let deltaY = -effect.radius; deltaY <= effect.radius; deltaY += 1) {
      for (let deltaX = -effect.radius; deltaX <= effect.radius; deltaX += 1) {
        const isSelf = deltaX === 0 && deltaY === 0;

        if (isSelf && !effect.clearSelf) {
          continue;
        }

        if (!isSelf && !effect.includeDiagonals && Math.abs(deltaX) + Math.abs(deltaY) !== 1) {
          continue;
        }

        const targetX = centerX + deltaX;
        const targetY = centerY + deltaY;

        if (
          targetX < 0 ||
          targetX >= CAT_MATCH_BOARD_SIZE ||
          targetY < 0 ||
          targetY >= CAT_MATCH_BOARD_SIZE
        ) {
          continue;
        }

        const targetIndex = targetY * CAT_MATCH_BOARD_SIZE + targetX;
        G.board[targetIndex] = null;
        cellEffects[targetIndex] = cellEffects[targetIndex].filter((cellEffect) => cellEffect.type !== 'armedMine');
      }
    }
  }
};

const advanceCellEffects = (G: ClickRaceState): Array<BoardCellEffect[]> => {
  const explodedMines: ArmedMineEffect[] = [];
  const nextCellEffects = normalizeCellEffects(G.cellEffects).map((effects): BoardCellEffect[] =>
    effects.reduce<BoardCellEffect[]>((nextEffects, effect) => {
      switch (effect.type) {
        case 'placementLock': {
          const remainingTurns = effect.remainingTurns - 1;

          if (remainingTurns > 0) {
            nextEffects.push({
              ...effect,
              remainingTurns,
            });
          }

          return nextEffects;
        }
        case 'armedMine': {
          const remainingTurns = effect.remainingTurns - 1;

          if (remainingTurns <= 0) {
            explodedMines.push(effect);
            return nextEffects;
          }

          nextEffects.push({
            ...effect,
            remainingTurns,
          });
          return nextEffects;
        }
      }
    }, []),
  );

  resolveMineExplosions(G, nextCellEffects, explodedMines);
  return nextCellEffects;
};

const hasPlacementLock = (effects: BoardCellEffect[]) =>
  effects.some((effect) => effect.type === 'placementLock' && effect.remainingTurns > 0);

const getNeighborBoardIndexes = (
  cellX: number,
  cellY: number,
  radius: number,
  includeDiagonals: boolean,
) => {
  const boardIndexes: number[] = [];

  for (let deltaY = -radius; deltaY <= radius; deltaY += 1) {
    for (let deltaX = -radius; deltaX <= radius; deltaX += 1) {
      if (deltaX === 0 && deltaY === 0) {
        continue;
      }

      if (!includeDiagonals && Math.abs(deltaX) + Math.abs(deltaY) !== 1) {
        continue;
      }

      const targetX = cellX + deltaX;
      const targetY = cellY + deltaY;

      if (
        targetX < 0 ||
        targetX >= CAT_MATCH_BOARD_SIZE ||
        targetY < 0 ||
        targetY >= CAT_MATCH_BOARD_SIZE
      ) {
        continue;
      }

      boardIndexes.push(targetY * CAT_MATCH_BOARD_SIZE + targetX);
    }
  }

  return boardIndexes;
};

const getAdjacentEnemyBoardIndexes = (
  board: Array<BoardCell | null>,
  cellX: number,
  cellY: number,
  playerID: string,
  radius: number,
  includeDiagonals: boolean,
) =>
  getNeighborBoardIndexes(cellX, cellY, radius, includeDiagonals).filter((boardIndex) => {
    const cell = board[boardIndex];
    return Boolean(cell && cell.playerID !== playerID);
  });

const getOccupiedNeighborBoardIndexes = (
  board: Array<BoardCell | null>,
  cellX: number,
  cellY: number,
  radius: number,
  includeDiagonals: boolean,
) =>
  getNeighborBoardIndexes(cellX, cellY, radius, includeDiagonals).filter((boardIndex) =>
    Boolean(board[boardIndex]),
  );

const applyOnPlaceMechanics = (
  G: ClickRaceState,
  boardIndex: number,
  cellX: number,
  cellY: number,
  playerID: string,
  cardID: number,
  move: number,
  selectedTargetBoardIndex: number | null,
): number | null => {
  const cardDefinition = getCardDefinition(cardID);
  let affectedBoardIndex: number | null = null;

  for (const mechanic of cardDefinition.mechanics) {
    if (mechanic.trigger !== 'onPlace') {
      continue;
    }

    switch (mechanic.type) {
      case 'placementLockAura': {
        for (let deltaY = -mechanic.radius; deltaY <= mechanic.radius; deltaY += 1) {
          for (let deltaX = -mechanic.radius; deltaX <= mechanic.radius; deltaX += 1) {
            if (deltaX === 0 && deltaY === 0) {
              continue;
            }

            if (!mechanic.includeDiagonals && Math.abs(deltaX) + Math.abs(deltaY) !== 1) {
              continue;
            }

            const targetX = cellX + deltaX;
            const targetY = cellY + deltaY;

            if (
              targetX < 0 ||
              targetX >= CAT_MATCH_BOARD_SIZE ||
              targetY < 0 ||
              targetY >= CAT_MATCH_BOARD_SIZE
            ) {
              continue;
            }

            const targetIndex = targetY * CAT_MATCH_BOARD_SIZE + targetX;

            if (G.board[targetIndex]) {
              continue;
            }

            G.cellEffects[targetIndex] = [
              ...G.cellEffects[targetIndex].filter((effect) => effect.type !== 'placementLock'),
              {
                type: 'placementLock',
                remainingTurns: mechanic.durationTurns,
                sourcePlayerID: playerID,
                sourceCardID: cardID,
                sourceBoardIndex: boardIndex,
              },
            ];
          }
        }
        break;
      }
      case 'delayedExplosion': {
        G.cellEffects[boardIndex] = [
          ...G.cellEffects[boardIndex].filter((effect) => effect.type !== 'armedMine'),
          {
            type: 'armedMine',
            remainingTurns: mechanic.delayTurns,
            sourcePlayerID: playerID,
            sourceCardID: cardID,
            sourceBoardIndex: boardIndex,
            radius: mechanic.radius,
            includeDiagonals: mechanic.includeDiagonals,
            clearSelf: mechanic.clearSelf,
          },
        ];
        break;
      }
      case 'adjacentConvert': {
        if (selectedTargetBoardIndex === null) {
          break;
        }

        const targetCell = G.board[selectedTargetBoardIndex];

        if (!targetCell || targetCell.playerID === playerID) {
          break;
        }

        G.board[selectedTargetBoardIndex] = {
          ...targetCell,
          playerID,
          move,
        };
        affectedBoardIndex = selectedTargetBoardIndex;
        break;
      }
      case 'adjacentPush': {
        if (selectedTargetBoardIndex === null) {
          break;
        }

        const targetCell = G.board[selectedTargetBoardIndex];

        if (!targetCell) {
          break;
        }

        const sourceX = boardIndex % CAT_MATCH_BOARD_SIZE;
        const sourceY = Math.floor(boardIndex / CAT_MATCH_BOARD_SIZE);
        const targetX = selectedTargetBoardIndex % CAT_MATCH_BOARD_SIZE;
        const targetY = Math.floor(selectedTargetBoardIndex / CAT_MATCH_BOARD_SIZE);
        const directionX = targetX - sourceX;
        const directionY = targetY - sourceY;

        if (Math.abs(directionX) + Math.abs(directionY) !== 1) {
          break;
        }

        const destinationX = targetX + directionX;
        const destinationY = targetY + directionY;

        if (
          destinationX < 0 ||
          destinationX >= CAT_MATCH_BOARD_SIZE ||
          destinationY < 0 ||
          destinationY >= CAT_MATCH_BOARD_SIZE
        ) {
          break;
        }

        const destinationBoardIndex = destinationY * CAT_MATCH_BOARD_SIZE + destinationX;

        if (G.board[destinationBoardIndex]) {
          break;
        }

        G.board[destinationBoardIndex] = targetCell;
        G.board[selectedTargetBoardIndex] = null;
        G.cellEffects[destinationBoardIndex] = [
          ...G.cellEffects[destinationBoardIndex],
          ...G.cellEffects[selectedTargetBoardIndex].map((effect) => ({
            ...effect,
            sourceBoardIndex: destinationBoardIndex,
          })),
        ];
        G.cellEffects[selectedTargetBoardIndex] = [];
        affectedBoardIndex = destinationBoardIndex;
        break;
      }
    }
  }

  return affectedBoardIndex;
};

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
    cellEffects: createEmptyCellEffects(),
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
    cellEffects: normalizeCellEffects(G.cellEffects),
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
    cellEffects: createEmptyCellEffects(),
    currentRound: nextRound,
    roundResult: null,
    players,
    playerSummaries: createPlayerSummaries(players),
  };
};

const placeCatMove: MoveFn<ClickRaceState> = (
  { G, ctx, events, random, playerID },
  cellX: number,
  cellY: number,
  handIndex: number,
  targetX?: number,
  targetY?: number,
) => {
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

  if (hasPlacementLock(G.cellEffects[boardIndex] ?? [])) {
    return INVALID_MOVE;
  }

  const convertMechanic = getAdjacentConvertMechanic(cardID);
  const pushMechanic = getAdjacentPushMechanic(cardID);
  let selectedTargetBoardIndex: number | null = null;

  if (convertMechanic || pushMechanic) {
    const validTargetBoardIndexes = convertMechanic
      ? getAdjacentEnemyBoardIndexes(
          G.board,
          cellX,
          cellY,
          playerID,
          convertMechanic.radius,
          convertMechanic.includeDiagonals,
        )
      : getOccupiedNeighborBoardIndexes(
          G.board,
          cellX,
          cellY,
          pushMechanic!.radius,
          pushMechanic!.includeDiagonals,
        );

    if (validTargetBoardIndexes.length === 0) {
      return INVALID_MOVE;
    }

    const normalizedTargetX = typeof targetX === 'number' ? targetX : Number.NaN;
    const normalizedTargetY = typeof targetY === 'number' ? targetY : Number.NaN;

    if (
      !Number.isInteger(normalizedTargetX) ||
      !Number.isInteger(normalizedTargetY) ||
      normalizedTargetX < 0 ||
      normalizedTargetX >= CAT_MATCH_BOARD_SIZE ||
      normalizedTargetY < 0 ||
      normalizedTargetY >= CAT_MATCH_BOARD_SIZE
    ) {
      return INVALID_MOVE;
    }

    selectedTargetBoardIndex = normalizedTargetY * CAT_MATCH_BOARD_SIZE + normalizedTargetX;

    if (!validTargetBoardIndexes.includes(selectedTargetBoardIndex)) {
      return INVALID_MOVE;
    }
  }

  G.board[boardIndex] = {
    playerID,
    cardID,
    move: ctx.turn,
  };

  playerState.hand[handIndex] = playerState.deck.shift() ?? null;
  playerState.placedCount += 1;
  G.cellEffects = advanceCellEffects(G);

  let affectedBoardIndex: number | null = null;

  if (G.board[boardIndex]?.playerID === playerID && G.board[boardIndex]?.cardID === cardID) {
    affectedBoardIndex = applyOnPlaceMechanics(
      G,
      boardIndex,
      cellX,
      cellY,
      playerID,
      cardID,
      ctx.turn,
      selectedTargetBoardIndex,
    );
  }

  refreshPlayerSummaries(G);

  const affectedCellWon =
    affectedBoardIndex !== null &&
    G.board[affectedBoardIndex]?.playerID === playerID &&
    hasWinningLine(
      G.board,
      affectedBoardIndex % CAT_MATCH_BOARD_SIZE,
      Math.floor(affectedBoardIndex / CAT_MATCH_BOARD_SIZE),
      playerID,
    );
  const roundWon = hasWinningLine(G.board, cellX, cellY, playerID) || affectedCellWon;
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
