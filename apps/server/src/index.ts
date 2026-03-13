import type { IncomingMessage } from 'node:http';

import { CLICK_RACE_GAME_NAME, ClickRaceGame, ERROR_CODES } from '@acatgame/game-core';

import { FlatFile, Origins, Server } from './boardgame-compat.js';
import { RoomRegistry } from './room-registry.js';
import { HttpError, RoomService } from './room-service.js';

const PORT = Number(process.env.PORT ?? 8000);
const BASE_URL = process.env.PUBLIC_SERVER_URL ?? `http://localhost:${PORT}`;
const OFFLINE_GRACE_MS = Number(process.env.OFFLINE_GRACE_MS ?? 12000);

const db = new FlatFile({
  dir: '.data/boardgame',
  logging: false,
});

const registry = new RoomRegistry(OFFLINE_GRACE_MS);
const roomService = new RoomService(BASE_URL, registry, db);

const server = Server({
  games: [ClickRaceGame],
  db,
  origins: [
    Origins.LOCALHOST_IN_DEVELOPMENT,
    process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
  ],
});

const readBody = async <T>(ctx: any): Promise<T> => {
  const requestBody = (ctx.request as { body?: unknown } | undefined)?.body;

  if (requestBody && typeof requestBody === 'object') {
    return requestBody as T;
  }

  const req = ctx.req as IncomingMessage;
  let raw = '';

  for await (const chunk of req) {
    raw += chunk.toString();
  }

  if (!raw) {
    return {} as T;
  }

  return JSON.parse(raw) as T;
};

const respond = async (
  ctx: any,
  action: () => Promise<unknown>,
) => {
  try {
    ctx.body = await action();
  } catch (error) {
    if (error instanceof HttpError) {
      ctx.status = error.statusCode;
      ctx.body = { errorCode: error.code, error: error.message };
      return;
    }

    ctx.status = 500;
    ctx.body = { errorCode: ERROR_CODES.INTERNAL_SERVER_ERROR, error: 'Internal server error.' };
  }
};

server.router.get('/api/health', async (ctx) => {
  ctx.body = { ok: true, game: CLICK_RACE_GAME_NAME };
});

server.router.post('/api/rooms', async (ctx) => {
  await respond(ctx, () => roomService.createRoom());
});

server.router.get('/api/rooms/available', async (ctx) => {
  await respond(ctx, () => roomService.listAvailableRooms());
});

server.router.get('/api/rooms/:matchID', async (ctx) => {
  await respond(ctx, () => roomService.getRoomSnapshot(ctx.params.matchID));
});

server.router.post('/api/rooms/:matchID/join', async (ctx) => {
  await respond(ctx, () => roomService.joinRoom(ctx.params.matchID));
});

server.router.post('/api/rooms/:matchID/leave', async (ctx) => {
  await respond(ctx, async () => {
    await roomService.leaveRoom(ctx.params.matchID, await readBody(ctx));
    return { ok: true };
  });
});

server.router.post('/api/rooms/:matchID/presence', async (ctx) => {
  await respond(ctx, async () => roomService.markPresence(ctx.params.matchID, await readBody(ctx)));
});

server.router.post('/api/rooms/:matchID/ready', async (ctx) => {
  await respond(ctx, async () => roomService.setReady(ctx.params.matchID, await readBody(ctx)));
});

server.router.post('/api/rooms/:matchID/selection', async (ctx) => {
  await respond(ctx, async () => roomService.updateSelection(ctx.params.matchID, await readBody(ctx)));
});

server.run({
  port: PORT,
  callback: () => {
    console.log(`boardgame.io server running on ${PORT}`);
  },
});
