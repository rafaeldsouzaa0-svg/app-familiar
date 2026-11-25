import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { createApp } from '../api/app.mjs';

const db = new PGlite();
await db.exec(await readFile('db/schema.sql', 'utf8'));
const app = createApp({ db, setupCode: 'c', origins: ['https://ok.test'] });
const call = async (m, p, b, t, o) => {
  const r = await app(new Request('http://x' + p, { method: m, body: b ? JSON.stringify(b) : undefined, headers: { ...(t && { authorization: 'Bearer ' + t }), ...(o && { origin: o }) } }));
  const s = await r.text();
  let j; try { j = JSON.parse(s); } catch { j = s; }
  return { s: r.status, j, h: r.headers };
};
const P = (n) => ({ name: n, email: n + '@t.co', password: 'senha-teste' });
let A, B, C, inv, ics;

test('setup, join and login', async () => {
  assert.equal((await call('POST', '/auth/setup', { ...P('a'), code: 'no', family: 'F' })).s, 403);
  A = (await call('POST', '/auth/setup', { ...P('a'), code: 'c', family: 'F' })).j.token;
  C = (await call('POST', '/auth/setup', { ...P('c'), code: 'c', family: 'G' })).j.token;
  ({ invite: inv, ics_token: ics } = (await call('GET', '/state', null, A)).j.family);
  B = (await call('POST', '/auth/join', { ...P('b'), invite: inv })).j.token;
  assert.equal((await call('POST', '/auth/join', { ...P('b'), invite: inv })).s, 409);
  assert.equal((await call('POST', '/auth/login', { email: 'A@t.co', password: 'senha-teste' })).s, 200);
  assert.equal((await call('POST', '/auth/login', { email: 'a@t.co', password: 'x' })).s, 401);
  assert.equal((await call('GET', '/state')).s, 401);
});
test('shared inside the family, isolated outside', async () => {
  const it = (await call('POST', '/shopping', { title: 'Leite', category: 'Frios' }, A)).j;
  assert.equal((await call('GET', '/state', null, B)).j.shopping[0].title, 'Leite');
  assert.equal((await call('GET', '/state', null, C)).j.shopping.length, 0);
  assert.equal((await call('PATCH', '/shopping/' + it.id, { done: true }, C)).s, 404);
  assert.equal((await call('DELETE', '/shopping/' + it.id, null, C)).s, 404);
  const ma = (await call('GET', '/state', null, A)).j.me;
  assert.equal((await call('POST', '/tasks', { title: 'x', member_id: ma }, C)).s, 400);
  assert.equal((await call('PATCH', '/shopping/' + it.id, { done: true }, B)).j.done, true);
  await call('DELETE', '/shopping/done', null, A);
  assert.equal((await call('GET', '/state', null, B)).j.shopping.length, 0);
});
test('validation', async () => {
  for (const b of [{ title: '', starts: '2026-12-01' }, { title: 'x' }, { title: 'x', starts: '2026-02-31' }, { title: 'x', starts: '2026-12-01', repeat: 'zz' }]) {
    assert.equal((await call('POST', '/events', b, A)).s, 400);
  }
  assert.equal((await call('PATCH', '/events/zz', { title: 'x' }, A)).s, 404);
  assert.equal((await call('POST', '/constructor', { title: 'x' }, A)).s, 404);
});
test('ics', async () => {
  await call('POST', '/events', { title: 'Médico; dr, João', starts: '2026-12-31T23:30', repeat: 'monthly', remind_min: 60 }, A);
  await call('POST', '/events', { title: 'Férias', starts: '2026-12-31', all_day: true }, A);
  const s = (await call('GET', `/ics/${ics}.ics`)).j;
  assert.ok(s.includes('SUMMARY:Médico\\; dr\\, João'));
  for (const x of ['DTEND;TZID=America/Sao_Paulo:20270101T003000', 'DTEND;VALUE=DATE:20270101', 'RRULE:FREQ=MONTHLY', 'TRIGGER:-PT60M']) assert.ok(s.includes(x), x);
  await call('POST', '/rotate', {}, A);
  assert.equal((await call('GET', `/ics/${ics}.ics`)).s, 404);
});
test('cors, logout, rate limit', async () => {
  assert.equal((await call('OPTIONS', '/state', null, null, 'https://ok.test')).h.get('access-control-allow-origin'), 'https://ok.test');
  assert.equal((await call('OPTIONS', '/state', null, null, 'https://evil.test')).h.get('access-control-allow-origin'), null);
  await call('POST', '/auth/logout', {}, B);
  assert.equal((await call('GET', '/state', null, B)).s, 401);
  let r;
  for (let i = 0; i < 12; i++) r = await call('POST', '/auth/login', { email: 'z@t.co', password: 'x' });
  assert.equal(r.s, 429);
});
