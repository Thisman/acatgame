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
  getHiddenMineMechanic,
  isConvertImmuneCard,
  isPushImmuneCard,
  type ArmedMineEffect,
  type BoardCellEffect,
} from './cards.js';
import type {
  BoardCell,
  ClearCellResolvedEffectEvent,
  ClickRaceClientState,
  ClickRaceState,
  LocalPlayerState,
  MatchResult,
  ResolvedEffectBatch,
  ResolvedEffectStep,
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

const getBoardIndex = (cellX: number, cellY: number) => cellY * CAT_MATCH_BOARD_SIZE + cellX;

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

const cloneBoardCell = (cell: BoardCell): BoardCell => ({
  playerID: cell.playerID,
  cardID: cell.cardID,
  move: cell.move,
});

const cloneResolvedEffectEvent = (event: ClearCellResolvedEffectEvent): ClearCellResolvedEffectEvent => ({
  type: event.type,
  boardIndex: event.boardIndex,
  cell: cloneBoardCell(event.cell),
});

const cloneResolvedEffectStep = (step: ResolvedEffectStep): ResolvedEffectStep => ({
  order: step.order,
  events: step.events.map(cloneResolvedEffectEvent),
});

const cloneResolvedEffectBatch = (batch: ResolvedEffectBatch | null): ResolvedEffectBatch | null =>
  batch
    ? {
        id: batch.id,
        steps: batch.steps.map(cloneResolvedEffectStep),
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

const getNextEffectOrder = (G: ClickRaceState) => {
  const order = G.nextEffectOrder;
  G.nextEffectOrder += 1;
  return order;
};

const clearBoardCell = (
  G: ClickRaceState,
  boardIndex: number,
  events: ClearCellResolvedEffectEvent[],
) => {
  const cell = G.board[boardIndex];

  if (!cell) {
    return;
  }

  events.push({
    type: 'clearCell',
    boardIndex,
    cell: cloneBoardCell(cell),
  });
  G.board[boardIndex] = null;
  G.cellEffects[boardIndex] = G.cellEffects[boardIndex].filter((effect) => effect.type !== 'armedMine');
};

const applyMineEffect = (G: ClickRaceState, effect: ArmedMineEffect): ResolvedEffectStep | null => {
  const effectEvents: ClearCellResolvedEffectEvent[] = [];
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

      clearBoardCell(G, getBoardIndex(targetX, targetY), effectEvents);
    }
  }

  if (effectEvents.length === 0) {
    return null;
  }

  return {
    order: effect.createdOrder,
    events: effectEvents,
  };
};

const advanceCellEffects = (
  G: ClickRaceState,
  placementBoardIndex: number,
): ResolvedEffectBatch | null => {
  const occupancyTriggeredOrders = new Set(
    (G.cellEffects[placementBoardIndex] ?? [])
      .filter((effect): effect is ArmedMineEffect => effect.type === 'armedMine' && effect.visibility === 'proximity')
      .map((effect) => effect.createdOrder),
  );
  const triggeredEffects: Array<{
    boardIndex: number;
    createdOrder: number;
  }> = [];

  G.cellEffects = normalizeCellEffects(G.cellEffects).map((effects, boardIndex): BoardCellEffect[] =>
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
          if (boardIndex === placementBoardIndex && occupancyTriggeredOrders.has(effect.createdOrder)) {
            triggeredEffects.push({
              boardIndex,
              createdOrder: effect.createdOrder,
            });
            nextEffects.push(effect);
            return nextEffects;
          }

          const remainingTurns = effect.remainingTurns - 1;

          if (remainingTurns <= 0) {
            triggeredEffects.push({
              boardIndex,
              createdOrder: effect.createdOrder,
            });
            nextEffects.push({
              ...effect,
              remainingTurns: 0,
            });
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

  const steps: ResolvedEffectStep[] = [];
  const orderedTriggeredEffects = [...triggeredEffects].sort((left, right) => left.createdOrder - right.createdOrder);

  for (const triggeredEffect of orderedTriggeredEffects) {
    const effect = G.cellEffects[triggeredEffect.boardIndex].find(
      (cellEffect): cellEffect is ArmedMineEffect =>
        cellEffect.type === 'armedMine' && cellEffect.createdOrder === triggeredEffect.createdOrder,
    );

    if (!effect) {
      continue;
    }

    G.cellEffects[triggeredEffect.boardIndex] = G.cellEffects[triggeredEffect.boardIndex].filter(
      (cellEffect) => !(cellEffect.type === 'armedMine' && cellEffect.createdOrder === triggeredEffect.createdOrder),
    );

    const step = applyMineEffect(G, effect);

    if (step) {
      steps.push(step);
    }
  }

  G.cellEffects = pruneInactivePlacementLocks(G.board, G.cellEffects);

  if (steps.length === 0) {
    return null;
  }

  const batch: ResolvedEffectBatch = {
    id: G.nextResolvedEffectBatchID,
    steps,
  };
  G.nextResolvedEffectBatchID += 1;
  return batch;
};

const hasPlacementLock = (effects: BoardCellEffect[]) =>
  effects.some((effect) => effect.type === 'placementLock' && effect.remainingTurns > 0);

const isEffectBoundToOccupant = (effect: BoardCellEffect) =>
  effect.type === 'armedMine' && effect.visibility === 'public';

const isPlacementLockSourceActive = (board: Array<BoardCell | null>, effect: BoardCellEffect) => {
  if (effect.type !== 'placementLock') {
    return true;
  }

  const sourceCell = board[effect.sourceBoardIndex];
  return Boolean(
    sourceCell &&
      sourceCell.playerID === effect.sourcePlayerID &&
      sourceCell.cardID === effect.sourceCardID,
  );
};

const pruneInactivePlacementLocks = (
  board: Array<BoardCell | null>,
  cellEffects: Array<BoardCellEffect[]>,
) =>
  cellEffects.map((effects) => effects.filter((effect) => isPlacementLockSourceActive(board, effect)));

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

      boardIndexes.push(getBoardIndex(targetX, targetY));
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
    return Boolean(cell && cell.playerID !== playerID && !isConvertImmuneCard(cell.cardID));
  });

const getOccupiedNeighborBoardIndexes = (
  board: Array<BoardCell | null>,
  cellX: number,
  cellY: number,
  radius: number,
  includeDiagonals: boolean,
) =>
  getNeighborBoardIndexes(cellX, cellY, radius, includeDiagonals).filter((boardIndex) =>
    Boolean(board[boardIndex] && !isPushImmuneCard(board[boardIndex]!.cardID)),
  );

const getEmptyNeighborBoardIndexes = (
  board: Array<BoardCell | null>,
  cellX: number,
  cellY: number,
  radius: number,
  includeDiagonals: boolean,
) =>
  getNeighborBoardIndexes(cellX, cellY, radius, includeDiagonals).filter((boardIndex) => !board[boardIndex]);

const canPlayerSeeBoardIndex = (board: Array<BoardCell | null>, boardIndex: number, playerID?: string | null) => {
  if (!playerID) {
    return false;
  }

  const cellX = boardIndex % CAT_MATCH_BOARD_SIZE;
  const cellY = Math.floor(boardIndex / CAT_MATCH_BOARD_SIZE);

  for (let deltaY = -1; deltaY <= 1; deltaY += 1) {
    for (let deltaX = -1; deltaX <= 1; deltaX += 1) {
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

      if (board[getBoardIndex(targetX, targetY)]?.playerID === playerID) {
        return true;
      }
    }
  }

  return false;
};

const isEffectVisibleToPlayer = (
  board: Array<BoardCell | null>,
  boardIndex: number,
  effect: BoardCellEffect,
  playerID?: string | null,
) => {
  if (effect.type === 'placementLock') {
    return true;
  }

  return effect.visibility === 'public' || canPlayerSeeBoardIndex(board, boardIndex, playerID);
};

export const getVisibleCellEffectsForPlayer = (
  board: Array<BoardCell | null>,
  cellEffects?: Array<BoardCellEffect[]> | null,
  playerID?: string | null,
) => {
  const normalized = normalizeCellEffects(cellEffects);

  for (let boardIndex = 0; boardIndex < normalized.length; boardIndex += 1) {
    normalized[boardIndex] = normalized[boardIndex].filter((effect) =>
      isEffectVisibleToPlayer(board, boardIndex, effect, playerID),
    );
  }

  return normalized;
};

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

            const targetIndex = getBoardIndex(targetX, targetY);

            if (G.board[targetIndex]) {
              continue;
            }

            G.cellEffects[targetIndex] = [
              ...G.cellEffects[targetIndex].filter(
                (effect) =>
                  effect.type !== 'placementLock' ||
                  effect.sourceBoardIndex !== boardIndex ||
                  effect.sourcePlayerID !== playerID ||
                  effect.sourceCardID !== cardID,
              ),
              {
                type: 'placementLock',
                remainingTurns: mechanic.durationTurns,
                sourcePlayerID: playerID,
                sourceCardID: cardID,
                sourceBoardIndex: boardIndex,
                createdOrder: getNextEffectOrder(G),
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
            visibility: 'public',
            createdOrder: getNextEffectOrder(G),
          },
        ];
        break;
      }
      case 'hiddenMine': {
        if (selectedTargetBoardIndex === null) {
          break;
        }

        G.cellEffects[selectedTargetBoardIndex] = [
          ...G.cellEffects[selectedTargetBoardIndex].filter((effect) => effect.type !== 'armedMine'),
          {
            type: 'armedMine',
            remainingTurns: mechanic.delayTurns,
            sourcePlayerID: playerID,
            sourceCardID: cardID,
            sourceBoardIndex: selectedTargetBoardIndex,
            radius: 0,
            includeDiagonals: false,
            clearSelf: true,
            visibility: 'proximity',
            createdOrder: getNextEffectOrder(G),
          },
        ];
        break;
      }
      case 'adjacentConvert': {
        if (selectedTargetBoardIndex === null) {
          break;
        }

        const targetCell = G.board[selectedTargetBoardIndex];

        if (!targetCell || targetCell.playerID === playerID || isConvertImmuneCard(targetCell.cardID)) {
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

        if (!targetCell || isPushImmuneCard(targetCell.cardID)) {
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

        const destinationBoardIndex = getBoardIndex(destinationX, destinationY);

        if (G.board[destinationBoardIndex]) {
          break;
        }

        G.board[destinationBoardIndex] = targetCell;
        G.board[selectedTargetBoardIndex] = null;
        const movingEffects = G.cellEffects[selectedTargetBoardIndex].filter(isEffectBoundToOccupant);
        const stayingEffects = G.cellEffects[selectedTargetBoardIndex].filter((effect) => !isEffectBoundToOccupant(effect));
        G.cellEffects[destinationBoardIndex] = [
          ...G.cellEffects[destinationBoardIndex],
          ...movingEffects.map((effect) => ({
            ...effect,
            sourceBoardIndex: destinationBoardIndex,
          })),
        ];
        G.cellEffects[selectedTargetBoardIndex] = stayingEffects;
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
    resolvedEffectBatch: null,
    nextResolvedEffectBatchID: 1,
    nextEffectOrder: 1,
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
    cellEffects: getVisibleCellEffectsForPlayer(G.board, G.cellEffects, playerID),
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
    resolvedEffectBatch: cloneResolvedEffectBatch(G.resolvedEffectBatch),
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
    resolvedEffectBatch: null,
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

  const boardIndex = getBoardIndex(cellX, cellY);

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
  const hiddenMineMechanic = getHiddenMineMechanic(cardID);
  let selectedTargetBoardIndex: number | null = null;

  if (convertMechanic || pushMechanic || hiddenMineMechanic) {
    const validTargetBoardIndexes = convertMechanic
      ? getAdjacentEnemyBoardIndexes(
          G.board,
          cellX,
          cellY,
          playerID,
          convertMechanic.radius,
          convertMechanic.includeDiagonals,
        )
      : hiddenMineMechanic
        ? getEmptyNeighborBoardIndexes(
            G.board,
            cellX,
            cellY,
            hiddenMineMechanic.radius,
            hiddenMineMechanic.includeDiagonals,
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

    selectedTargetBoardIndex = getBoardIndex(normalizedTargetX, normalizedTargetY);

    if (!validTargetBoardIndexes.includes(selectedTargetBoardIndex)) {
      return INVALID_MOVE;
    }
  }

  G.board[boardIndex] = {
    playerID,
    cardID,
    move: ctx.turn,
  };
  G.resolvedEffectBatch = null;

  playerState.hand[handIndex] = playerState.deck.shift() ?? null;
  playerState.placedCount += 1;
  G.resolvedEffectBatch = advanceCellEffects(G, boardIndex);

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

  G.cellEffects = pruneInactivePlacementLocks(G.board, G.cellEffects);

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
