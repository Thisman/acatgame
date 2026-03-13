import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CAT_MATCH_BOARD_SIZE,
  CAT_MATCH_MAX_ROUNDS,
  READY_CARD_SELECTION_LIMIT,
} from '../src/constants.js';
import { getCardDefinition } from '../src/cards.js';
import {
  ClickRaceGame,
  createGameplayState,
  createNextRoundState,
  getRoundStarter,
  getVisibleCellEffectsForPlayer,
} from '../src/game.js';
import type { ClickRaceState } from '../src/types.js';

const selection = Array.from({ length: READY_CARD_SELECTION_LIMIT }, (_value, index) => index);

const orderedShuffle = {
  Shuffle<T>(items: T[]) {
    return [...items];
  },
};

const placeCat = ClickRaceGame.moves?.placeCat as (
  context: {
    G: ClickRaceState;
    ctx: { currentPlayer: string; turn: number };
    playerID: string;
    events: { endTurn: (arg: { next: string }) => void };
      random: typeof orderedShuffle;
  },
  cellX: number,
  cellY: number,
  handIndex: number,
  targetX?: number,
  targetY?: number,
) => void | 'INVALID_MOVE';

const stripEffectMetadata = (effect: ClickRaceState['cellEffects'][number][number]) => {
  const { createdOrder: _createdOrder, ...rest } = effect;
  return rest;
};

const stripEffectListMetadata = (effects: ClickRaceState['cellEffects'][number]) =>
  effects.map(stripEffectMetadata);

test('createGameplayState creates a round with 5 cards in hand and 10 in deck', () => {
  const state = createGameplayState(
    {
      '0': selection,
      '1': selection,
    },
    orderedShuffle,
  );

  assert.equal(state.board.length, CAT_MATCH_BOARD_SIZE * CAT_MATCH_BOARD_SIZE);
  assert.equal(state.cellEffects.length, CAT_MATCH_BOARD_SIZE * CAT_MATCH_BOARD_SIZE);
  assert.equal(state.currentRound, 1);
  assert.deepEqual(state.players['0'].hand, [0, 1, 2, 3, 4]);
  assert.equal(state.players['0'].deck.length, 10);
  assert.equal(state.players['1'].deck.length, 10);
});

test('placeCat fills a cell and refills the same hand slot', () => {
  const state = createGameplayState(
    {
      '0': selection,
      '1': selection,
    },
    orderedShuffle,
  );
  let nextPlayer = '';

  placeCat(
    {
      G: state,
      ctx: { currentPlayer: '0', turn: 1 },
      playerID: '0',
      events: {
        endTurn(arg) {
          nextPlayer = arg.next;
        },
      },
      random: orderedShuffle,
    },
    2,
    3,
    1,
  );

  assert.deepEqual(state.board[3 * CAT_MATCH_BOARD_SIZE + 2], {
    playerID: '0',
    cardID: 1,
    move: 1,
  });
  assert.equal(state.players['0'].hand[1], 5);
  assert.equal(state.players['0'].deck.length, 9);
  assert.equal(nextPlayer, '1');
});

test('special card metadata is exposed through the catalog', () => {
  const blockerCard = getCardDefinition(0);
  const convertCard = getCardDefinition(3);
  const bombCard = getCardDefinition(5);
  const pushCard = getCardDefinition(8);
  const mineCard = getCardDefinition(12);
  const anchorCard = getCardDefinition(15);
  const fallbackCard = getCardDefinition(99);

  assert.equal(blockerCard.visual.animation, 'blocker');
  assert.equal(blockerCard.mechanics[0]?.type, 'placementLockAura');
  assert.equal(convertCard.visual.animation, 'convert');
  assert.equal(convertCard.mechanics[0]?.type, 'adjacentConvert');
  assert.equal(bombCard.visual.animation, 'bomb');
  assert.equal(bombCard.mechanics[0]?.type, 'delayedExplosion');
  assert.equal(pushCard.visual.animation, 'push');
  assert.equal(pushCard.mechanics[0]?.type, 'adjacentPush');
  assert.equal(mineCard.visual.animation, 'mine');
  assert.equal(mineCard.mechanics[0]?.type, 'hiddenMine');
  assert.equal(anchorCard.visual.animation, 'anchor');
  assert.equal(anchorCard.rules.immuneToPush, true);
  assert.equal(anchorCard.rules.immuneToConvert, true);
  assert.equal(fallbackCard.visual.animation, 'default');
  assert.equal(fallbackCard.mechanics.length, 0);
});

test('a convert cat cannot be placed without an adjacent enemy cat', () => {
  const state = createGameplayState(
    {
      '0': selection,
      '1': selection,
    },
    orderedShuffle,
  );

  const result = placeCat(
    {
      G: state,
      ctx: { currentPlayer: '0', turn: 1 },
      playerID: '0',
      events: { endTurn() {} },
      random: orderedShuffle,
    },
    3,
    3,
    3,
    3,
    2,
  );

  assert.equal(result, 'INVALID_MOVE');
  assert.equal(state.board[24], null);
});

test('a convert cat must target exactly one adjacent enemy cat', () => {
  const state = createGameplayState(
    {
      '0': selection,
      '1': selection,
    },
    orderedShuffle,
  );
  state.board[17] = { playerID: '1', cardID: 9, move: 1 };

  const missingTargetResult = placeCat(
    {
      G: state,
      ctx: { currentPlayer: '0', turn: 2 },
      playerID: '0',
      events: { endTurn() {} },
      random: orderedShuffle,
    },
    3,
    3,
    3,
  );

  assert.equal(missingTargetResult, 'INVALID_MOVE');

  const wrongTargetResult = placeCat(
    {
      G: state,
      ctx: { currentPlayer: '0', turn: 2 },
      playerID: '0',
      events: { endTurn() {} },
      random: orderedShuffle,
    },
    3,
    3,
    3,
    0,
    0,
  );

  assert.equal(wrongTargetResult, 'INVALID_MOVE');
});

test('a convert cat cannot target an anchor cat', () => {
  const state = createGameplayState(
    {
      '0': selection,
      '1': selection,
    },
    orderedShuffle,
  );
  state.board[17] = { playerID: '1', cardID: 15, move: 1 };

  const result = placeCat(
    {
      G: state,
      ctx: { currentPlayer: '0', turn: 2 },
      playerID: '0',
      events: { endTurn() {} },
      random: orderedShuffle,
    },
    3,
    3,
    3,
    3,
    2,
  );

  assert.equal(result, 'INVALID_MOVE');
  assert.deepEqual(state.board[17], {
    playerID: '1',
    cardID: 15,
    move: 1,
  });
});

test('a convert cat flips one adjacent enemy cat to the placed cat team', () => {
  const state = createGameplayState(
    {
      '0': selection,
      '1': selection,
    },
    orderedShuffle,
  );
  state.board[17] = { playerID: '1', cardID: 9, move: 1 };
  let nextPlayer = '';

  placeCat(
    {
      G: state,
      ctx: { currentPlayer: '0', turn: 2 },
      playerID: '0',
      events: {
        endTurn(arg) {
          nextPlayer = arg.next;
        },
      },
      random: orderedShuffle,
    },
    3,
    3,
    3,
    3,
    2,
  );

  assert.deepEqual(state.board[24], {
    playerID: '0',
    cardID: 3,
    move: 2,
  });
  assert.deepEqual(state.board[17], {
    playerID: '0',
    cardID: 9,
    move: 2,
  });
  assert.equal(nextPlayer, '1');
});

test('a converted adjacent cat can complete a winning line', () => {
  const state = createGameplayState(
    {
      '0': selection,
      '1': selection,
    },
    orderedShuffle,
  );
  state.board[0] = { playerID: '0', cardID: 11, move: 1 };
  state.board[1] = { playerID: '0', cardID: 12, move: 2 };
  state.board[2] = { playerID: '1', cardID: 13, move: 3 };

  placeCat(
    {
      G: state,
      ctx: { currentPlayer: '0', turn: 4 },
      playerID: '0',
      events: { endTurn() {} },
      random: orderedShuffle,
    },
    3,
    1,
    3,
    2,
    0,
  );

  assert.deepEqual(state.roundResult, { round: 1, winner: '0', draw: false });
  assert.equal(state.roundWinsByPlayer['0'], 1);
});

test('a push cat cannot be placed without an adjacent orthogonal occupied cell', () => {
  const state = createGameplayState(
    {
      '0': selection,
      '1': selection,
    },
    orderedShuffle,
  );
  state.players['0'].hand = [9, 1, 2, 3, 4];
  state.players['0'].deck = [5, 6, 7, 8, 10];

  const result = placeCat(
    {
      G: state,
      ctx: { currentPlayer: '0', turn: 1 },
      playerID: '0',
      events: { endTurn() {} },
      random: orderedShuffle,
    },
    3,
    3,
    0,
    3,
    2,
  );

  assert.equal(result, 'INVALID_MOVE');
  assert.equal(state.board[24], null);
});

test('a push cat must target one adjacent orthogonal occupied cell', () => {
  const state = createGameplayState(
    {
      '0': selection,
      '1': selection,
    },
    orderedShuffle,
  );
  state.players['0'].hand = [9, 1, 2, 3, 4];
  state.players['0'].deck = [5, 6, 7, 8, 10];
  state.board[17] = { playerID: '1', cardID: 12, move: 1 };

  const missingTargetResult = placeCat(
    {
      G: state,
      ctx: { currentPlayer: '0', turn: 2 },
      playerID: '0',
      events: { endTurn() {} },
      random: orderedShuffle,
    },
    3,
    3,
    0,
  );

  assert.equal(missingTargetResult, 'INVALID_MOVE');

  const diagonalTargetResult = placeCat(
    {
      G: state,
      ctx: { currentPlayer: '0', turn: 2 },
      playerID: '0',
      events: { endTurn() {} },
      random: orderedShuffle,
    },
    3,
    3,
    0,
    2,
    2,
  );

  assert.equal(diagonalTargetResult, 'INVALID_MOVE');
});

test('a push cat cannot target an anchor cat', () => {
  const state = createGameplayState(
    {
      '0': selection,
      '1': selection,
    },
    orderedShuffle,
  );
  state.players['0'].hand = [8, 1, 2, 3, 4];
  state.players['0'].deck = [5, 6, 7, 9, 10];
  state.board[17] = { playerID: '1', cardID: 15, move: 1 };

  const result = placeCat(
    {
      G: state,
      ctx: { currentPlayer: '0', turn: 2 },
      playerID: '0',
      events: { endTurn() {} },
      random: orderedShuffle,
    },
    3,
    3,
    0,
    3,
    2,
  );

  assert.equal(result, 'INVALID_MOVE');
  assert.deepEqual(state.board[17], {
    playerID: '1',
    cardID: 15,
    move: 1,
  });
});

test('a push cat shifts an adjacent occupied orthogonal cell outward by one cell', () => {
  const state = createGameplayState(
    {
      '0': selection,
      '1': selection,
    },
    orderedShuffle,
  );
  state.players['0'].hand = [9, 1, 2, 3, 4];
  state.players['0'].deck = [5, 6, 7, 8, 10];
  state.board[17] = { playerID: '1', cardID: 12, move: 1 };
  let nextPlayer = '';

  placeCat(
    {
      G: state,
      ctx: { currentPlayer: '0', turn: 2 },
      playerID: '0',
      events: {
        endTurn(arg) {
          nextPlayer = arg.next;
        },
      },
      random: orderedShuffle,
    },
    3,
    3,
    0,
    3,
    2,
  );

  assert.deepEqual(state.board[24], {
    playerID: '0',
    cardID: 9,
    move: 2,
  });
  assert.equal(state.board[17], null);
  assert.deepEqual(state.board[10], {
    playerID: '1',
    cardID: 12,
    move: 1,
  });
  assert.equal(nextPlayer, '1');
});

test('a push cat still ends the turn if the chosen target cannot move', () => {
  const state = createGameplayState(
    {
      '0': selection,
      '1': selection,
    },
    orderedShuffle,
  );
  state.players['0'].hand = [9, 1, 2, 3, 4];
  state.players['0'].deck = [5, 6, 7, 8, 10];
  state.board[3] = { playerID: '1', cardID: 12, move: 1 };
  let nextPlayer = '';

  placeCat(
    {
      G: state,
      ctx: { currentPlayer: '0', turn: 2 },
      playerID: '0',
      events: {
        endTurn(arg) {
          nextPlayer = arg.next;
        },
      },
      random: orderedShuffle,
    },
    3,
    1,
    0,
    3,
    0,
  );

  assert.deepEqual(state.board[10], {
    playerID: '0',
    cardID: 9,
    move: 2,
  });
  assert.deepEqual(state.board[3], {
    playerID: '1',
    cardID: 12,
    move: 1,
  });
  assert.equal(nextPlayer, '1');
});

test('a shifted friendly cat can complete a winning line', () => {
  const state = createGameplayState(
    {
      '0': selection,
      '1': selection,
    },
    orderedShuffle,
  );
  state.players['0'].hand = [9, 1, 2, 3, 4];
  state.players['0'].deck = [5, 6, 7, 8, 10];
  state.board[0] = { playerID: '0', cardID: 12, move: 1 };
  state.board[1] = { playerID: '0', cardID: 13, move: 2 };
  state.board[3] = { playerID: '0', cardID: 14, move: 3 };

  placeCat(
    {
      G: state,
      ctx: { currentPlayer: '0', turn: 4 },
      playerID: '0',
      events: { endTurn() {} },
      random: orderedShuffle,
    },
    2,
    1,
    0,
    3,
    0,
  );

  assert.deepEqual(state.roundResult, { round: 1, winner: '0', draw: false });
  assert.equal(state.roundWinsByPlayer['0'], 1);
});

test('placing a blocker card locks all adjacent empty cells for two turns', () => {
  const state = createGameplayState(
    {
      '0': selection,
      '1': selection,
    },
    orderedShuffle,
  );
  state.board[17] = { playerID: '1', cardID: 9, move: 1 };

  placeCat(
    {
      G: state,
      ctx: { currentPlayer: '0', turn: 2 },
      playerID: '0',
      events: { endTurn() {} },
      random: orderedShuffle,
    },
    3,
    3,
    0,
  );

  for (const index of [16, 18, 23, 25, 30, 31, 32]) {
    assert.deepEqual(stripEffectListMetadata(state.cellEffects[index]), [
      {
        type: 'placementLock',
        remainingTurns: 2,
        sourcePlayerID: '0',
        sourceCardID: 0,
        sourceBoardIndex: 24,
      },
    ]);
  }

  assert.equal(state.cellEffects[17].length, 0);
});

test('a blocked cell rejects placement until the second following turn finishes', () => {
  const state = createGameplayState(
    {
      '0': selection,
      '1': selection,
    },
    orderedShuffle,
  );

  placeCat(
    {
      G: state,
      ctx: { currentPlayer: '0', turn: 1 },
      playerID: '0',
      events: { endTurn() {} },
      random: orderedShuffle,
    },
    3,
    3,
    0,
  );

  const invalidAttempt = placeCat(
    {
      G: state,
      ctx: { currentPlayer: '1', turn: 2 },
      playerID: '1',
      events: { endTurn() {} },
      random: orderedShuffle,
    },
    2,
    2,
    0,
  );

  assert.equal(invalidAttempt, 'INVALID_MOVE');
  assert.equal(state.cellEffects[16][0]?.remainingTurns, 2);

  placeCat(
    {
      G: state,
      ctx: { currentPlayer: '1', turn: 2 },
      playerID: '1',
      events: { endTurn() {} },
      random: orderedShuffle,
    },
    0,
    0,
    3,
  );

  assert.equal(state.cellEffects[16][0]?.remainingTurns, 1);

  const stillBlockedAttempt = placeCat(
    {
      G: state,
      ctx: { currentPlayer: '0', turn: 3 },
      playerID: '0',
      events: { endTurn() {} },
      random: orderedShuffle,
    },
    2,
    2,
    1,
  );

  assert.equal(stillBlockedAttempt, 'INVALID_MOVE');
  assert.equal(state.cellEffects[16][0]?.remainingTurns, 1);

  placeCat(
    {
      G: state,
      ctx: { currentPlayer: '0', turn: 3 },
      playerID: '0',
      events: { endTurn() {} },
      random: orderedShuffle,
    },
    6,
    6,
    1,
  );

  assert.equal(state.cellEffects[16].length, 0);

  placeCat(
    {
      G: state,
      ctx: { currentPlayer: '1', turn: 4 },
      playerID: '1',
      events: { endTurn() {} },
      random: orderedShuffle,
    },
    2,
    2,
    1,
  );

  assert.equal(state.board[16]?.playerID, '1');
});

test('overlapping blocker auras keep separate timers on the same cell', () => {
  const state = createGameplayState(
    {
      '0': selection,
      '1': selection,
    },
    orderedShuffle,
  );

  placeCat(
    {
      G: state,
      ctx: { currentPlayer: '0', turn: 1 },
      playerID: '0',
      events: { endTurn() {} },
      random: orderedShuffle,
    },
    2,
    2,
    0,
  );

  placeCat(
    {
      G: state,
      ctx: { currentPlayer: '1', turn: 2 },
      playerID: '1',
      events: { endTurn() {} },
      random: orderedShuffle,
    },
    4,
    4,
    0,
  );

  assert.deepEqual(stripEffectListMetadata(state.cellEffects[24]), [
    {
      type: 'placementLock',
      remainingTurns: 1,
      sourcePlayerID: '0',
      sourceCardID: 0,
      sourceBoardIndex: 16,
    },
    {
      type: 'placementLock',
      remainingTurns: 2,
      sourcePlayerID: '1',
      sourceCardID: 0,
      sourceBoardIndex: 32,
    },
  ]);
});

test('destroying one blocker removes only its locks and preserves the other timer', () => {
  const state = createGameplayState(
    {
      '0': selection,
      '1': selection,
    },
    orderedShuffle,
  );

  placeCat(
    {
      G: state,
      ctx: { currentPlayer: '0', turn: 1 },
      playerID: '0',
      events: { endTurn() {} },
      random: orderedShuffle,
    },
    4,
    4,
    0,
  );

  placeCat(
    {
      G: state,
      ctx: { currentPlayer: '1', turn: 2 },
      playerID: '1',
      events: { endTurn() {} },
      random: orderedShuffle,
    },
    2,
    2,
    0,
  );

  state.board[32] = null;

  placeCat(
    {
      G: state,
      ctx: { currentPlayer: '0', turn: 3 },
      playerID: '0',
      events: { endTurn() {} },
      random: orderedShuffle,
    },
    6,
    6,
    1,
  );

  assert.deepEqual(stripEffectListMetadata(state.cellEffects[24]), [
    {
      type: 'placementLock',
      remainingTurns: 1,
      sourcePlayerID: '1',
      sourceCardID: 0,
      sourceBoardIndex: 16,
    },
  ]);
  assert.equal(state.cellEffects[40].length, 0);
});

test('placing a bomb cat arms it for two turns on its own cell', () => {
  const state = createGameplayState(
    {
      '0': selection,
      '1': selection,
    },
    orderedShuffle,
  );
  state.players['0'].hand = [5, 1, 2, 3, 4];
  state.players['0'].deck = [6, 7, 8, 9, 10];

  placeCat(
    {
      G: state,
      ctx: { currentPlayer: '0', turn: 1 },
      playerID: '0',
      events: { endTurn() {} },
      random: orderedShuffle,
    },
    3,
    3,
    0,
  );

  assert.deepEqual(stripEffectListMetadata(state.cellEffects[24]), [
      {
        type: 'armedMine',
        remainingTurns: 2,
        sourcePlayerID: '0',
        sourceCardID: 5,
        sourceBoardIndex: 24,
        radius: 1,
        includeDiagonals: true,
        clearSelf: true,
        visibility: 'public',
      },
    ]);
});

test('a bomb cat explodes after two following turns and clears the full 3x3 area', () => {
  const state = createGameplayState(
    {
      '0': selection,
      '1': selection,
    },
    orderedShuffle,
  );
  state.players['0'].hand = [5, 1, 2, 3, 4];
  state.players['0'].deck = [6, 7, 8, 9, 10];
  state.players['1'].hand = [0, 10, 11, 12, 13];
  state.players['1'].deck = [14];

  placeCat(
    {
      G: state,
      ctx: { currentPlayer: '0', turn: 1 },
      playerID: '0',
      events: { endTurn() {} },
      random: orderedShuffle,
    },
    3,
    3,
    0,
  );

  state.board[16] = { playerID: '1', cardID: 20, move: 0 };
  state.board[17] = { playerID: '0', cardID: 21, move: 0 };
  state.board[18] = { playerID: '1', cardID: 22, move: 0 };
  state.board[23] = { playerID: '0', cardID: 23, move: 0 };
  state.board[25] = { playerID: '1', cardID: 12, move: 0 };
  state.board[30] = { playerID: '0', cardID: 13, move: 0 };
  state.board[31] = { playerID: '1', cardID: 14, move: 0 };
  state.board[32] = { playerID: '0', cardID: 15, move: 0 };
  state.board[0] = { playerID: '1', cardID: 16, move: 0 };

  placeCat(
    {
      G: state,
      ctx: { currentPlayer: '1', turn: 2 },
      playerID: '1',
      events: { endTurn() {} },
      random: orderedShuffle,
    },
    0,
    1,
    0,
  );

  assert.equal(state.cellEffects[24][0]?.type, 'armedMine');
  assert.equal(state.cellEffects[24][0]?.remainingTurns, 1);

  placeCat(
    {
      G: state,
      ctx: { currentPlayer: '0', turn: 3 },
      playerID: '0',
      events: { endTurn() {} },
      random: orderedShuffle,
    },
    2,
    2,
    1,
  );

  for (const index of [16, 17, 18, 23, 24, 25, 30, 31, 32]) {
    assert.equal(state.board[index], null);
  }

  assert.equal(state.board[0]?.playerID, '1');
  assert.equal(state.cellEffects[24].length, 0);
});

test('a mine cat arms one adjacent empty cell with hidden proximity visibility', () => {
  const state = createGameplayState(
    {
      '0': selection,
      '1': selection,
    },
    orderedShuffle,
  );
  state.players['0'].hand = [12, 1, 2, 3, 4];
  state.players['0'].deck = [5, 6, 7, 8, 9];

  placeCat(
    {
      G: state,
      ctx: { currentPlayer: '0', turn: 1 },
      playerID: '0',
      events: { endTurn() {} },
      random: orderedShuffle,
    },
    3,
    3,
    0,
    2,
    2,
  );

  assert.deepEqual(stripEffectListMetadata(state.cellEffects[16]), [
    {
      type: 'armedMine',
      remainingTurns: 2,
      sourcePlayerID: '0',
      sourceCardID: 12,
      sourceBoardIndex: 16,
      radius: 0,
      includeDiagonals: false,
      clearSelf: true,
      visibility: 'proximity',
    },
  ]);

  const ownerEffects = getVisibleCellEffectsForPlayer(state.board, state.cellEffects, '0');
  const opponentEffects = getVisibleCellEffectsForPlayer(state.board, state.cellEffects, '1');

  assert.equal(ownerEffects[16][0]?.type, 'armedMine');
  assert.equal(opponentEffects[16].length, 0);
});

test('a mine cat stays hidden from the opponent even if their cat is next to the mined cell', () => {
  const state = createGameplayState(
    {
      '0': selection,
      '1': selection,
    },
    orderedShuffle,
  );
  state.players['0'].hand = [12, 1, 2, 3, 4];
  state.players['0'].deck = [5, 6, 7, 8, 9];
  state.board[15] = { playerID: '1', cardID: 8, move: 0 };

  placeCat(
    {
      G: state,
      ctx: { currentPlayer: '0', turn: 1 },
      playerID: '0',
      events: { endTurn() {} },
      random: orderedShuffle,
    },
    3,
    3,
    0,
    2,
    2,
  );

  const opponentEffects = getVisibleCellEffectsForPlayer(state.board, state.cellEffects, '1');
  assert.equal(opponentEffects[16].length, 0);
});

test('a mine cat explodes only the chosen cell and survives itself', () => {
  const state = createGameplayState(
    {
      '0': selection,
      '1': selection,
    },
    orderedShuffle,
  );
  state.players['0'].hand = [12, 1, 2, 3, 4];
  state.players['0'].deck = [5, 6, 7, 8, 9];
  state.players['1'].hand = [0, 9, 10, 11, 13];
  state.players['1'].deck = [14];

  placeCat(
    {
      G: state,
      ctx: { currentPlayer: '0', turn: 1 },
      playerID: '0',
      events: { endTurn() {} },
      random: orderedShuffle,
    },
    3,
    3,
    0,
    2,
    2,
  );

  state.board[16] = { playerID: '1', cardID: 9, move: 0 };
  state.board[24] = { playerID: '0', cardID: 12, move: 1 };
  state.board[0] = { playerID: '1', cardID: 14, move: 0 };

  placeCat(
    {
      G: state,
      ctx: { currentPlayer: '1', turn: 2 },
      playerID: '1',
      events: { endTurn() {} },
      random: orderedShuffle,
    },
    0,
    1,
    0,
  );

  assert.equal(state.cellEffects[16][0]?.type, 'armedMine');
  assert.equal(state.cellEffects[16][0]?.remainingTurns, 1);

  placeCat(
    {
      G: state,
      ctx: { currentPlayer: '0', turn: 3 },
      playerID: '0',
      events: { endTurn() {} },
      random: orderedShuffle,
    },
    6,
    6,
    1,
  );

  assert.equal(state.board[16], null);
  assert.deepEqual(state.board[24], { playerID: '0', cardID: 12, move: 1 });
  assert.equal(state.board[0]?.playerID, '1');
  assert.equal(state.cellEffects[16].length, 0);
});

test('placing a cat onto a mined cell removes that cat immediately and clears the mine timer', () => {
  const state = createGameplayState(
    {
      '0': selection,
      '1': selection,
    },
    orderedShuffle,
  );
  state.players['0'].hand = [12, 1, 2, 3, 4];
  state.players['0'].deck = [5, 6, 7, 8, 9];
  state.players['1'].hand = [0, 9, 10, 11, 13];
  state.players['1'].deck = [14];

  placeCat(
    {
      G: state,
      ctx: { currentPlayer: '0', turn: 1 },
      playerID: '0',
      events: { endTurn() {} },
      random: orderedShuffle,
    },
    3,
    3,
    0,
    2,
    2,
  );

  placeCat(
    {
      G: state,
      ctx: { currentPlayer: '1', turn: 2 },
      playerID: '1',
      events: { endTurn() {} },
      random: orderedShuffle,
    },
    2,
    2,
    0,
  );

  assert.equal(state.board[16], null);
  assert.equal(state.cellEffects[16].length, 0);
  assert.deepEqual(state.board[24], {
    playerID: '0',
    cardID: 12,
    move: 1,
  });
  assert.equal(state.players['1'].hand[0], 14);
});

test('older effects resolve before newer ones and keep their animation order', () => {
  const state = createGameplayState(
    {
      '0': selection,
      '1': selection,
    },
    orderedShuffle,
  );
  state.players['0'].hand = [5, 1, 2, 3, 4];
  state.players['0'].deck = [6, 7, 8, 9, 10];
  state.players['1'].hand = [12, 0, 1, 2, 3];
  state.players['1'].deck = [4, 5, 6, 7, 8];

  placeCat(
    {
      G: state,
      ctx: { currentPlayer: '0', turn: 1 },
      playerID: '0',
      events: { endTurn() {} },
      random: orderedShuffle,
    },
    6,
    6,
    0,
  );

  placeCat(
    {
      G: state,
      ctx: { currentPlayer: '1', turn: 2 },
      playerID: '1',
      events: { endTurn() {} },
      random: orderedShuffle,
    },
    1,
    1,
    0,
    0,
    0,
  );

  state.board[40] = { playerID: '1', cardID: 13, move: 0 };

  placeCat(
    {
      G: state,
      ctx: { currentPlayer: '0', turn: 3 },
      playerID: '0',
      events: { endTurn() {} },
      random: orderedShuffle,
    },
    0,
    0,
    1,
  );

  assert.deepEqual(
    state.resolvedEffectBatch?.steps.map((step) => ({
      order: step.order,
      events: step.events.map((event) => ({
        type: event.type,
        boardIndex: event.boardIndex,
        cell: event.cell,
      })),
    })),
    [
      {
        order: 1,
        events: [
          {
            type: 'clearCell',
            boardIndex: 40,
            cell: { playerID: '1', cardID: 13, move: 0 },
          },
          {
            type: 'clearCell',
            boardIndex: 48,
            cell: { playerID: '0', cardID: 5, move: 1 },
          },
        ],
      },
      {
        order: 2,
        events: [
          {
            type: 'clearCell',
            boardIndex: 0,
            cell: { playerID: '0', cardID: 1, move: 3 },
          },
        ],
      },
    ],
  );
});

test('winning a round stores the result and waits for the next round reset', () => {
  const state = createGameplayState(
    {
      '0': selection,
      '1': selection,
    },
    orderedShuffle,
  );
  state.board[0] = { playerID: '0', cardID: 8, move: 1 };
  state.board[1] = { playerID: '0', cardID: 9, move: 2 };
  state.board[2] = { playerID: '0', cardID: 10, move: 3 };
  let nextPlayer = '';

  placeCat(
    {
      G: state,
      ctx: { currentPlayer: '0', turn: 4 },
      playerID: '0',
      events: {
        endTurn(arg) {
          nextPlayer = arg.next;
        },
      },
      random: orderedShuffle,
    },
    3,
    0,
    0,
  );

  assert.equal(state.roundWinsByPlayer['0'], 1);
  assert.deepEqual(state.roundResult, { round: 1, winner: '0', draw: false });
  assert.equal(state.currentRound, 1);
  assert.deepEqual(state.board[3], { playerID: '0', cardID: 0, move: 4 });
  assert.deepEqual(state.board[0], { playerID: '0', cardID: 8, move: 1 });
  assert.equal(nextPlayer, '');
});

test('vertical and diagonal wins are detected', () => {
  const vertical = createGameplayState(
    {
      '0': selection,
      '1': selection,
    },
    orderedShuffle,
  );
  vertical.board[0] = { playerID: '1', cardID: 0, move: 1 };
  vertical.board[CAT_MATCH_BOARD_SIZE] = { playerID: '1', cardID: 1, move: 2 };
  vertical.board[CAT_MATCH_BOARD_SIZE * 2] = { playerID: '1', cardID: 2, move: 3 };
  vertical.players['1'].hand = [6, 7, 8, 9, 10];
  vertical.players['1'].deck = [11, 12, 13, 14];
  vertical.currentRound = 2;

  placeCat(
    {
      G: vertical,
      ctx: { currentPlayer: '1', turn: 4 },
      playerID: '1',
      events: { endTurn() {} },
      random: orderedShuffle,
    },
    0,
    3,
    0,
  );

  assert.equal(vertical.roundWinsByPlayer['1'], 1);

  const diagonal = createGameplayState(
    {
      '0': selection,
      '1': selection,
    },
    orderedShuffle,
  );
  diagonal.roundWinsByPlayer['0'] = 1;
  diagonal.currentRound = 2;
  diagonal.board[0] = { playerID: '0', cardID: 0, move: 1 };
  diagonal.board[CAT_MATCH_BOARD_SIZE + 1] = { playerID: '0', cardID: 1, move: 2 };
  diagonal.board[CAT_MATCH_BOARD_SIZE * 2 + 2] = { playerID: '0', cardID: 2, move: 3 };

  placeCat(
    {
      G: diagonal,
      ctx: { currentPlayer: '0', turn: 4 },
      playerID: '0',
      events: { endTurn() {} },
      random: orderedShuffle,
    },
    3,
    3,
    0,
  );

  assert.deepEqual(diagonal.matchResult, { winner: '0', draw: false });
});

test('a round is a draw when the last remaining card is placed without a line', () => {
  const state = createGameplayState(
    {
      '0': selection,
      '1': selection,
    },
    orderedShuffle,
  );

  state.players['0'].hand = [null, null, null, null, null];
  state.players['0'].deck = [];
  state.players['0'].placedCount = READY_CARD_SELECTION_LIMIT;
  state.players['1'].hand = [0, null, null, null, null];
  state.players['1'].deck = [];
  state.players['1'].placedCount = READY_CARD_SELECTION_LIMIT - 1;

  let nextPlayer = '';

  placeCat(
    {
      G: state,
      ctx: { currentPlayer: '1', turn: 8 },
      playerID: '1',
      events: {
        endTurn(arg) {
          nextPlayer = arg.next;
        },
      },
      random: orderedShuffle,
    },
    6,
    6,
    0,
  );

  assert.deepEqual(state.roundResult, { round: 1, winner: null, draw: true });
  assert.equal(state.drawRounds, 1);
  assert.equal(state.currentRound, 1);
  assert.equal(nextPlayer, '');
});

test('the third round can end the whole match in a draw', () => {
  const state = createGameplayState(
    {
      '0': selection,
      '1': selection,
    },
    orderedShuffle,
  );

  state.currentRound = CAT_MATCH_MAX_ROUNDS;
  state.roundWinsByPlayer = { '0': 1, '1': 1 };
  state.drawRounds = 1;
  state.players['0'].hand = [null, null, null, null, null];
  state.players['0'].deck = [];
  state.players['0'].placedCount = READY_CARD_SELECTION_LIMIT;
  state.players['1'].hand = [0, null, null, null, null];
  state.players['1'].deck = [];
  state.players['1'].placedCount = READY_CARD_SELECTION_LIMIT - 1;

  placeCat(
    {
      G: state,
      ctx: { currentPlayer: '1', turn: 11 },
      playerID: '1',
      events: { endTurn() {} },
      random: orderedShuffle,
    },
    5,
    6,
    0,
  );

  assert.deepEqual(state.matchResult, { winner: null, draw: true });
});

test('createNextRoundState clears the board and deals fresh hands for the next round', () => {
  const state = createGameplayState(
    {
      '0': selection,
      '1': selection,
    },
    orderedShuffle,
  );

  state.board[0] = { playerID: '0', cardID: 9, move: 1 };
  state.roundWinsByPlayer['0'] = 1;
  state.drawRounds = 1;
  state.roundResult = { round: 1, winner: '0', draw: false };

  const nextState = createNextRoundState(state, orderedShuffle);

  assert.equal(nextState.currentRound, 2);
  assert.equal(nextState.board.every((cell) => cell === null), true);
  assert.equal(nextState.cellEffects.every((effects) => effects.length === 0), true);
  assert.equal(nextState.roundResult, null);
  assert.equal(nextState.roundWinsByPlayer['0'], 1);
  assert.equal(nextState.drawRounds, 1);
  assert.deepEqual(nextState.players['0'].hand, [0, 1, 2, 3, 4]);
  assert.equal(getRoundStarter(nextState.currentRound), '1');
});
