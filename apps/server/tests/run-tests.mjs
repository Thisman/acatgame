import assert from 'node:assert/strict';

import { READY_CARD_SELECTION_LIMIT, createGameplayState } from '@acatgame/game-core';

import { RoomRegistry } from '../dist/room-registry.js';
import { HttpError, RoomService } from '../dist/room-service.js';

const registry = new RoomRegistry(10_000);

registry.storeSession({
  matchID: 'match-1',
  playerID: '0',
  credentials: 'secret',
  seat: 0,
});

assert.equal(registry.validateSession('match-1', '0', 'secret'), true);
assert.equal(registry.validateSession('match-1', '0', 'nope'), false);
assert.equal(registry.isReady('match-1', '0'), false);
assert.deepEqual(registry.getSelectedCardIDs('match-1', '0'), []);

registry.setReady('match-1', '0', true);
assert.equal(registry.isReady('match-1', '0'), true);

registry.setSelectedCardIDs('match-1', '0', [1, 3, 5]);
assert.deepEqual(registry.getSelectedCardIDs('match-1', '0'), [1, 3, 5]);

registry.resetReady('match-1');
assert.equal(registry.isReady('match-1', '0'), false);

registry.setGameStarted('match-1', true);
assert.equal(registry.hasGameStarted('match-1'), true);

const originalNow = Date.now;
let now = new Date('2026-03-13T10:00:00Z').valueOf();
Date.now = () => now;

try {
  const offlineRegistry = new RoomRegistry(5_000);
  offlineRegistry.storeSession({
    matchID: 'match-2',
    playerID: '0',
    credentials: 'secret',
    seat: 0,
  });

  assert.equal(offlineRegistry.isConnected('match-2', '0'), true);

  now += 6_000;

  assert.equal(offlineRegistry.isConnected('match-2', '0'), false);
} finally {
  Date.now = originalNow;
}

const serviceRegistry = new RoomRegistry(10_000);
serviceRegistry.storeSession({
  matchID: 'match-3',
  playerID: '0',
  credentials: 'secret-0',
  seat: 0,
});
serviceRegistry.storeSession({
  matchID: 'match-3',
  playerID: '1',
  credentials: 'secret-1',
  seat: 1,
});

const roomService = new RoomService('http://localhost:8000', serviceRegistry, {
  fetch: async () => ({
    state: {
      G: createGameplayState(),
      ctx: {
        currentPlayer: '0',
      },
    },
  }),
});

roomService.lobbyClient = {
  getMatch: async () => ({
    players: [
      { id: 0, name: 'Player 1' },
      { id: 1, name: 'Player 2' },
    ],
  }),
};

const initialSnapshot = await roomService.getRoomSnapshot('match-3');
assert.deepEqual(initialSnapshot.selectedCardIDsByPlayer, {
  '0': [],
  '1': [],
});
assert.equal(initialSnapshot.board.length, 49);
assert.equal(initialSnapshot.matchResult, null);

await roomService.updateSelection('match-3', {
  playerID: '0',
  credentials: 'secret-0',
  selectedCardIDs: [0, 2, 4],
});

const updatedSnapshot = await roomService.getRoomSnapshot('match-3');
assert.deepEqual(updatedSnapshot.selectedCardIDsByPlayer['0'], [0, 2, 4]);

await assert.rejects(
  () =>
    roomService.updateSelection('match-3', {
      playerID: '0',
      credentials: 'secret-0',
      selectedCardIDs: [1, 1],
    }),
  (error) => error instanceof HttpError && error.code === 'ready_selection_invalid',
);

await assert.rejects(
  () =>
    roomService.setReady('match-3', {
      playerID: '0',
      credentials: 'secret-0',
      ready: true,
    }),
  (error) => error instanceof HttpError && error.code === 'ready_selection_required',
);

const fullSelection = Array.from({ length: READY_CARD_SELECTION_LIMIT }, (_value, index) => index);
await roomService.updateSelection('match-3', {
  playerID: '0',
  credentials: 'secret-0',
  selectedCardIDs: fullSelection,
});

const readySnapshot = await roomService.setReady('match-3', {
  playerID: '0',
  credentials: 'secret-0',
  ready: true,
});
assert.equal(readySnapshot.readyByPlayer['0'], true);
assert.deepEqual(readySnapshot.selectedCardIDsByPlayer['0'], fullSelection);

const unreadySnapshot = await roomService.setReady('match-3', {
  playerID: '0',
  credentials: 'secret-0',
  ready: false,
});
assert.equal(unreadySnapshot.readyByPlayer['0'], false);
assert.deepEqual(unreadySnapshot.selectedCardIDsByPlayer['0'], fullSelection);

const gameRegistry = new RoomRegistry(10_000);
gameRegistry.storeSession({
  matchID: 'match-4',
  playerID: '0',
  credentials: 'secret-0',
  seat: 0,
});
gameRegistry.storeSession({
  matchID: 'match-4',
  playerID: '1',
  credentials: 'secret-1',
  seat: 1,
});
gameRegistry.setGameStarted('match-4', true);

const gameState = createGameplayState(
  {
    '0': fullSelection,
    '1': fullSelection,
  },
  {
    Shuffle(items) {
      return [...items];
    },
  },
);
gameState.roundResult = { round: 1, winner: '0', draw: false };
gameState.currentRound = 2;

const gameRoomService = new RoomService('http://localhost:8000', gameRegistry, {
  fetch: async () => ({
    state: {
      G: gameState,
      ctx: {
        currentPlayer: '1',
      },
    },
  }),
});

gameRoomService.lobbyClient = roomService.lobbyClient;

const activeSnapshot = await gameRoomService.getRoomSnapshot('match-4');
assert.equal(activeSnapshot.phase, 'game');
assert.equal(activeSnapshot.round, 2);
assert.deepEqual(activeSnapshot.roundResult, { round: 1, winner: '0', draw: false });
assert.equal(activeSnapshot.matchResult, null);

gameState.matchResult = { winner: null, draw: true };
const finalSnapshot = await gameRoomService.getRoomSnapshot('match-4');
assert.equal(finalSnapshot.phase, 'gameover');
assert.deepEqual(finalSnapshot.matchResult, { winner: null, draw: true });

console.log('server tests passed');
