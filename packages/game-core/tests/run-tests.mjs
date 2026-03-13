import assert from 'node:assert/strict';

import { CIRCLES_TO_WIN } from '../dist/constants.js';
import { ClickRaceGame } from '../dist/game.js';

const initial = ClickRaceGame.setup?.({});

assert.deepEqual(initial, {
  circles: [],
  scoreByPlayer: { '0': 0, '1': 0 },
  status: 'waiting',
  winner: null,
});

const G = {
  circles: [],
  scoreByPlayer: { '0': CIRCLES_TO_WIN - 1, '1': 0 },
  status: 'active',
  winner: null,
};

const move = ClickRaceGame.moves?.placeCircle;

assert.equal(typeof move, 'function');
move({ G, ctx: { turn: 6 }, playerID: '0' }, 0.5, 0.5);

assert.equal(G.scoreByPlayer['0'], CIRCLES_TO_WIN);
assert.equal(G.status, 'gameover');
assert.equal(G.winner, '0');
assert.equal(G.circles.length, 1);

console.log('game-core tests passed');

