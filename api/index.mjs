import pg from 'pg';
import { createApp } from './app.mjs';

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
db.on('error', (e) => console.error('pool', e.message));
const handler = {
  fetch: createApp({ db, setupCode: process.env.SETUP_CODE, origins: (process.env.ORIGINS || '').split(',').filter(Boolean) }),
};
export default handler;
