import type { Game, MoveFn } from 'boardgame.io';

import { CIRCLES_TO_WIN, CLICK_RACE_NUM_PLAYERS } from './constants.js';
import type { CircleMark, ClickRaceState } from './types.js';

const createInitialScore = (): Record<string, number> => ({
  '0': 0,
  '1': 0,
});

const clampRatio = (value: number) => Math.min(1, Math.max(0, value));

export const ClickRaceGame: Game<ClickRaceState> = {
  name: 'click-race',
  minPlayers: CLICK_RACE_NUM_PLAYERS,
  maxPlayers: CLICK_RACE_NUM_PLAYERS,
  setup: () => ({
    circles: [],
    scoreByPlayer: createInitialScore(),
    winner: null,
  }),
  turn: {
    maxMoves: 1,
  },
  moves: {
    placeCircle: (({ G, ctx, playerID }, xRatio: number, yRatio: number) => {
      if (!playerID || G.winner) {
        return;
      }

      const circle: CircleMark = {
        id: `${ctx.turn}-${playerID}-${G.circles.length}`,
        playerID,
        xRatio: clampRatio(xRatio),
        yRatio: clampRatio(yRatio),
        turn: ctx.turn,
      };

      G.circles.push(circle);
      G.scoreByPlayer[playerID] = (G.scoreByPlayer[playerID] ?? 0) + 1;

      if (G.scoreByPlayer[playerID] >= CIRCLES_TO_WIN) {
        G.winner = playerID;
      }
    }) as MoveFn<ClickRaceState>,
  },
  endIf: ({ G }) => (G.winner ? { winner: G.winner } : undefined),
  playerView: ({ G }) => G,
};
