import 'reflect-metadata';

import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApp } from './app.bootstrap.js';

const app = await createApp();
await app.init();

export default app.getHttpAdapter().getInstance() as (req: IncomingMessage, res: ServerResponse) => void;
