import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CAT_MATCH_BOARD_SIZE,
  CAT_MATCH_MAX_ROUNDS,
  READY_CARD_SELECTION_LIMIT,
} from '../src/constants.js';
import { ClickRaceGame, createGameplayState } from '../src/game.js';
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
) => void;

test('createGameplayState creates a round with 5 cards in hand and 10 in deck', () => {
  const state = createGameplayState(
    {
      '0': selection,
      '1': selection,
    },
    orderedShuffle,
  );

  assert.equal(state.board.length, CAT_MATCH_BOARD_SIZE * CAT_MATCH_BOARD_SIZE);
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

test('winning a round clears the board and starts the next round with the other starter', () => {
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
  assert.equal(state.currentRound, 2);
  assert.equal(state.board.every((cell) => cell === null), true);
  assert.equal(nextPlayer, '1');
  assert.deepEqual(state.players['0'].hand, [0, 1, 2, 3, 4]);
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
  state.players['1'].hand = [9, null, null, null, null];
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
  assert.equal(state.currentRound, 2);
  assert.equal(nextPlayer, '1');
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
  state.players['1'].hand = [4, null, null, null, null];
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
