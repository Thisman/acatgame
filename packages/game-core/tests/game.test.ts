import assert from 'node:assert/strict';
import test from 'node:test';

import { CIRCLES_TO_WIN } from '../src/constants.js';
import { ClickRaceGame } from '../src/game.js';

test('ClickRaceGame creates the expected initial state', () => {
  const initial = ClickRaceGame.setup?.({} as never);

  assert.deepEqual(initial, {
    circles: [],
    scoreByPlayer: { '0': 0, '1': 0 },
    status: 'waiting',
    winner: null,
  });
});

test('ClickRaceGame marks a winner on the seventh circle', () => {
  const G = {
    circles: [],
    scoreByPlayer: { '0': CIRCLES_TO_WIN - 1, '1': 0 },
    status: 'active' as const,
    winner: null,
  };

  const move = ClickRaceGame.moves?.placeCircle;

  assert.equal(typeof move, 'function');
  (move as (context: { G: typeof G; ctx: { turn: number }; playerID: string }, x: number, y: number) => void)(
    { G, ctx: { turn: 6 }, playerID: '0' },
    0.5,
    0.5,
  );

  assert.equal(G.scoreByPlayer['0'], CIRCLES_TO_WIN);
  assert.equal(G.status, 'gameover');
  assert.equal(G.winner, '0');
  assert.equal(G.circles.length, 1);
});
