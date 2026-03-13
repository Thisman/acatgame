import assert from 'node:assert/strict';
import test from 'node:test';

import { RoomRegistry } from '../src/room-registry.js';

test('RoomRegistry stores and validates issued sessions', () => {
  const registry = new RoomRegistry(10_000);

  registry.storeSession({
    matchID: 'match-1',
    playerID: '0',
    credentials: 'secret',
    seat: 0,
  });

  assert.equal(registry.validateSession('match-1', '0', 'secret'), true);
  assert.equal(registry.validateSession('match-1', '0', 'nope'), false);
});

test('RoomRegistry marks players offline after the grace period', async () => {
  const originalNow = Date.now;
  let now = new Date('2026-03-13T10:00:00Z').valueOf();
  Date.now = () => now;

  try {
    const registry = new RoomRegistry(5_000);
    registry.storeSession({
      matchID: 'match-1',
      playerID: '0',
      credentials: 'secret',
      seat: 0,
    });

    assert.equal(registry.isConnected('match-1', '0'), true);

    now += 6_000;

    assert.equal(registry.isConnected('match-1', '0'), false);
  } finally {
    Date.now = originalNow;
  }
});
