import assert from 'node:assert/strict';

import { RoomRegistry } from '../dist/room-registry.js';

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

registry.setReady('match-1', '0', true);
assert.equal(registry.isReady('match-1', '0'), true);

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

console.log('server tests passed');
