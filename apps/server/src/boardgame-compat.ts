import { createRequire } from 'node:module';

import type { LobbyClient as LobbyClientType, LobbyClientError as LobbyClientErrorType } from 'boardgame.io/client';
import type { FlatFile as FlatFileType, Origins as OriginsType, Server as ServerType } from 'boardgame.io/server';

const require = createRequire(import.meta.url);

const serverModule = require('boardgame.io/server') as {
  FlatFile: typeof FlatFileType;
  Origins: typeof OriginsType;
  Server: typeof ServerType;
};

const clientModule = require('boardgame.io/client') as {
  LobbyClient: typeof LobbyClientType;
  LobbyClientError: typeof LobbyClientErrorType;
};

export const FlatFile = serverModule.FlatFile as typeof FlatFileType;
export const Origins = serverModule.Origins as typeof OriginsType;
export const Server = serverModule.Server as typeof ServerType;
export const LobbyClient = clientModule.LobbyClient as typeof LobbyClientType;
export const LobbyClientError = clientModule.LobbyClientError as typeof LobbyClientErrorType;
