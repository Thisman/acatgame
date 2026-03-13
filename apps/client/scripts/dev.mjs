import { createServer } from 'vite';

import { applyWindowsViteWorkaround, clientViteConfig } from './shared.mjs';

applyWindowsViteWorkaround();

const server = await createServer(clientViteConfig);
await server.listen();
server.printUrls();
