import assert from 'node:assert/strict';

import { CAT_MATCH_BOARD_SIZE, READY_CARD_SELECTION_LIMIT } from '../dist/constants.js';
import { ClickRaceGame, createGameplayState } from '../dist/game.js';

const selection = Array.from({ length: READY_CARD_SELECTION_LIMIT }, (_value, index) => index);
const orderedShuffle = {
  Shuffle(items) {
    return [...items];
  },
};

const initial = createGameplayState(
  {
    '0': selection,
    '1': selection,
  },
  orderedShuffle,
);

assert.equal(initial.board.length, CAT_MATCH_BOARD_SIZE * CAT_MATCH_BOARD_SIZE);
assert.deepEqual(initial.players['0'].hand, [0, 1, 2, 3, 4]);
assert.equal(initial.players['0'].deck.length, 10);

const G = createGameplayState(
  {
    '0': selection,
    '1': selection,
  },
  orderedShuffle,
);
const move = ClickRaceGame.moves?.placeCat?.move ?? ClickRaceGame.moves?.placeCat;
let nextPlayer = '';

assert.equal(typeof move, 'function');
move(
  {
    G,
    ctx: { currentPlayer: '0', turn: 1 },
    playerID: '0',
    events: {
      endTurn({ next }) {
        nextPlayer = next;
      },
    },
    random: orderedShuffle,
  },
  2,
  2,
  0,
);

assert.deepEqual(G.board[2 * CAT_MATCH_BOARD_SIZE + 2], {
  playerID: '0',
  cardID: 0,
  move: 1,
});
assert.equal(G.players['0'].hand[0], 5);
assert.equal(nextPlayer, '1');

console.log('game-core tests passed');
