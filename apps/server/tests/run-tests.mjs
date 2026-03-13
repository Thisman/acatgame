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
assert.equal(initialSnapshot.cellEffects.length, 49);
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
gameRegistry.setSelectedCardIDs('match-4', '0', fullSelection);
gameRegistry.setSelectedCardIDs('match-4', '1', fullSelection);
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
gameState.currentRound = 1;

const roundStorage = {
  state: {
    G: gameState,
    ctx: {
      currentPlayer: '1',
    },
    _stateID: 5,
  },
};

const gameRoomService = new RoomService('http://localhost:8000', gameRegistry, {
  fetch: async () => roundStorage,
  setState: async (_matchID, state) => {
    roundStorage.state = state;
  },
});

gameRoomService.lobbyClient = roomService.lobbyClient;

const activeSnapshot = await gameRoomService.getRoomSnapshot('match-4');
assert.equal(activeSnapshot.phase, 'roundover');
assert.equal(activeSnapshot.round, 1);
assert.deepEqual(activeSnapshot.roundResult, { round: 1, winner: '0', draw: false });
assert.equal(activeSnapshot.matchResult, null);
assert.equal(activeSnapshot.readyByPlayer['0'], false);
assert.equal(activeSnapshot.readyByPlayer['1'], false);

const roundReadySnapshot = await gameRoomService.setReady('match-4', {
  playerID: '0',
  credentials: 'secret-0',
  ready: true,
});
assert.equal(roundReadySnapshot.phase, 'roundover');
assert.equal(roundReadySnapshot.readyByPlayer['0'], true);
assert.equal(roundReadySnapshot.readyByPlayer['1'], false);

const resumedSnapshot = await gameRoomService.setReady('match-4', {
  playerID: '1',
  credentials: 'secret-1',
  ready: true,
});
assert.equal(resumedSnapshot.phase, 'game');
assert.equal(resumedSnapshot.round, 2);
assert.equal(resumedSnapshot.board.every((cell) => cell === null), true);
assert.equal(resumedSnapshot.cellEffects.every((effects) => effects.length === 0), true);
assert.equal(resumedSnapshot.readyByPlayer['0'], false);
assert.equal(resumedSnapshot.readyByPlayer['1'], false);

roundStorage.state.G.matchResult = { winner: null, draw: true };
const finalSnapshot = await gameRoomService.getRoomSnapshot('match-4');
assert.equal(finalSnapshot.phase, 'gameover');
assert.deepEqual(finalSnapshot.matchResult, { winner: null, draw: true });

const availabilityRegistry = new RoomRegistry(10_000);
availabilityRegistry.storeSession({
  matchID: 'match-available',
  playerID: '0',
  credentials: 'secret-0',
  seat: 0,
});
availabilityRegistry.storeSession({
  matchID: 'match-full',
  playerID: '0',
  credentials: 'secret-0',
  seat: 0,
});
availabilityRegistry.storeSession({
  matchID: 'match-started',
  playerID: '0',
  credentials: 'secret-0',
  seat: 0,
});
availabilityRegistry.storeSession({
  matchID: 'match-closed',
  playerID: '0',
  credentials: 'secret-0',
  seat: 0,
});
availabilityRegistry.setGameStarted('match-started', true);
availabilityRegistry.markClosed('match-closed');

const availabilityService = new RoomService('http://localhost:8000', availabilityRegistry, {
  fetch: async () => ({}),
});

availabilityService.lobbyClient = {
  getMatch: async (_gameName, matchID) => {
    if (matchID === 'match-available' || matchID === 'match-started' || matchID === 'match-closed') {
      return {
        players: [{ id: 0, name: 'Player 1' }],
      };
    }

    if (matchID === 'match-full') {
      return {
        players: [
          { id: 0, name: 'Player 1' },
          { id: 1, name: 'Player 2' },
        ],
      };
    }

    return {
      players: [],
    };
  },
  joinMatch: async (_gameName, _matchID, { playerID }) => ({
    playerCredentials: `cred-${playerID}`,
  }),
};

const availableRooms = await availabilityService.listAvailableRooms();
assert.deepEqual(availableRooms, [{ matchID: 'match-available' }]);

await assert.rejects(
  () => availabilityService.joinRoom('match-started'),
  (error) => error instanceof HttpError && error.code === 'room_unavailable',
);

await assert.rejects(
  () => availabilityService.joinRoom('match-full'),
  (error) => error instanceof HttpError && error.code === 'room_unavailable',
);

console.log('server tests passed');
