import { build } from 'vite';

import { applyWindowsViteWorkaround, clientViteConfig } from './shared.mjs';

applyWindowsViteWorkaround();
await build(clientViteConfig);

