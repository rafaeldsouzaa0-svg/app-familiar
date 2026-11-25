import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { toICS } from './ics.mjs';

const kdf = promisify(scrypt);
const sha = (s) => createHash('sha256').update(s).digest('hex');
const COLORS = ['#2f6f5e', '#c4532d', '#3f5fa8', '#8a4a86', '#8f6410', '#4d6b2c'];
const REP = ['none', 'daily', 'weekly', 'monthly', 'yearly'];
const bad = (message, status = 400) => Object.assign(new Error(message), { status });
const isUuid = (v) => typeof v === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v);

const text = (max, req) => (v) => {
  if (v == null || v === '') { if (req) throw bad('Preencha o nome.'); return null; }
  if (typeof v !== 'string' || v.length > max) throw bad('Texto inválido.');
  if (req && !v.trim()) throw bad('Preencha o nome.');
  return v.trim();
};
const oneOf = (list) => (v) => { if (!list.includes(v)) throw bad('Opção inválida.'); return v; };
const bool = (v) => { if (typeof v !== 'boolean') throw bad('Valor inválido.'); return v; };
const when = (req) => (v) => {
  if (v == null || v === '') { if (req) throw bad('Informe a data.'); return null; }
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}(T([01]\d|2[0-3]):[0-5]\d)?$/.test(v)) throw bad('Data inválida.');
  const t = new Date(v.slice(0, 10) + 'T00:00Z');
  if (isNaN(t) || t.toISOString().slice(0, 10) !== v.slice(0, 10)) throw bad('Data inválida.');
  return v;
};
const uuid = (v) => { if (v == null || v === '') return null; if (!isUuid(v)) throw bad('Pessoa inválida.'); return v; };
const remind = (v) => { if (v == null) return null; if (!Number.isInteger(v) || v < 0 || v > 40320) throw bad('Lembrete inválido.'); return v; };

// Column names used in SQL come only from this list, never from the request.
const TABLES = {
  events: { member_id: uuid, title: text(200, true), starts: when(true), ends: when(false), all_day: bool, place: text(200), notes: text(2000), repeat: oneOf(REP), remind_min: remind },
  shopping: { title: text(120, true), qty: text(40), category: text(40, true), done: bool },
  tasks: { member_id: uuid, title: text(200, true), due: when(false), repeat: oneOf(REP), done: bool },
};

async function hashPass(p) {
  const s = randomBytes(16);
  return s.toString('hex') + ':' + (await kdf(p, s, 32)).toString('hex');
}
async function checkPass(p, stored) {
  const [s, h] = stored.split(':');
  return timingSafeEqual(await kdf(p, Buffer.from(s, 'hex'), 32), Buffer.from(h, 'hex'));
}
const DUMMY = await hashPass('x');

export function createApp({ db, setupCode, origins }) {
  const q = async (sql, p = []) => (await db.query(sql, p)).rows;

  async function limit(key, max) {
    const [r] = await q(`insert into familia.attempts as a(key,n,reset_at) values($1,1,now()+interval '15 minutes')
      on conflict(key) do update set
        n=case when a.reset_at<now() then 1 else a.n+1 end,
        reset_at=case when a.reset_at<now() then now()+interval '15 minutes' else a.reset_at end
      returning n`, [key]);
    if (r.n > max) throw bad('Muitas tentativas. Aguarde 15 minutos.', 429);
  }
  async function session(memberId) {
    const token = randomBytes(32).toString('base64url');
    await q('delete from familia.sessions where expires_at<now()');
    await q(`insert into familia.sessions(token_hash,member_id,expires_at) values($1,$2,now()+interval '180 days')`, [sha(token), memberId]);
    return { token };
  }
  function person(b) {
    const name = text(60, true)(b.name);
    const email = String(b.email || '').trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 200) throw bad('E-mail inválido.');
    if (typeof b.password !== 'string' || b.password.length < 8 || b.password.length > 200) throw bad('A senha precisa ter de 8 a 200 caracteres.');
    return { name, email, password: b.password };
  }
  async function emailFree(email) {
    if ((await q('select 1 from familia.members where email=$1', [email])).length) throw bad('Este e-mail já está cadastrado.', 409);
  }
  async function newMember(familyId, p) {
    const [{ n }] = await q('select count(*)::int n from familia.members where family_id=$1', [familyId]);
    if (n >= 12) throw bad('A família já tem 12 pessoas.');
    try {
      const [m] = await q('insert into familia.members(family_id,name,email,pass,color) values($1,$2,$3,$4,$5) returning id',
        [familyId, p.name, p.email, await hashPass(p.password), COLORS[n % COLORS.length]]);
      return m.id;
    } catch (e) {
      if (e.code === '23505') throw bad('Este e-mail já está cadastrado.', 409);
      throw e;
    }
  }
  async function auth(req) {
    const t = (req.headers.get('authorization') || '').replace(/^Bearer /, '');
    const [m] = t ? await q('select m.id,m.family_id from familia.sessions s join familia.members m on m.id=s.member_id where s.token_hash=$1 and s.expires_at>now()', [sha(t)]) : [];
    if (!m) throw bad('Entre novamente.', 401);
    return { ...m, hash: sha(t) };
  }

  async function publicRoute(action, body) {
    if (action === 'login') {
      const email = String(body.email || '').trim().toLowerCase().slice(0, 200);
      await limit('login:' + sha(email), 10);
      const [m] = await q('select id,pass from familia.members where email=$1', [email]);
      const ok = await checkPass(String(body.password || '').slice(0, 200), m ? m.pass : DUMMY);
      if (!m || !ok) throw bad('E-mail ou senha incorretos.', 401);
      return session(m.id);
    }
    if (action === 'setup') {
      await limit('setup', 10);
      const same = timingSafeEqual(Buffer.from(sha(String(body.code || ''))), Buffer.from(sha(setupCode || '')));
      if (!setupCode || !same) throw bad('Código de instalação incorreto.', 403);
      const p = person(body);
      const fam = text(60, true)(body.family);
      await emailFree(p.email);
      const [f] = await q('insert into familia.families(name,invite,ics_token) values($1,$2,$3) returning id',
        [fam, randomBytes(8).toString('hex'), randomBytes(24).toString('hex')]);
      return session(await newMember(f.id, p));
    }
    if (action === 'join') {
      await limit('join', 30);
      const p = person(body);
      const [f] = await q('select id from familia.families where invite=$1', [String(body.invite || '').trim()]);
      if (!f) throw bad('Convite inválido.', 403);
      return session(await newMember(f.id, p));
    }
    return null;
  }

  async function route(req) {
    const path = new URL(req.url).pathname.replace(/^\/api(?=\/)/, '').split('/').filter(Boolean);
    const [a, b] = path;
    const M = req.method;
    let body = {};
    if (M === 'POST' || M === 'PATCH') {
      const raw = await req.text();
      if (raw.length > 20000) throw bad('Dados grandes demais.', 413);
      try { body = raw ? JSON.parse(raw) : {}; } catch { throw bad('JSON inválido.'); }
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw bad('JSON inválido.');
    }
    if (a === 'ics' && M === 'GET') {
      const [f] = await q('select id,name from familia.families where ics_token=$1', [String(b || '').replace(/\.ics$/, '')]);
      if (!f) throw bad('Não encontrado.', 404);
      const ev = await q('select e.*, m.name who from familia.events e left join familia.members m on m.id=e.member_id where e.family_id=$1', [f.id]);
      return new Response(toICS(f.name, ev), { headers: { 'content-type': 'text/calendar; charset=utf-8', 'cache-control': 'no-store' } });
    }
    if (a === 'auth' && M === 'POST') {
      const r = await publicRoute(b, body);
      if (r) return r;
    }
    const me = await auth(req);
    const fam = me.family_id;
    if (a === 'auth' && b === 'logout' && M === 'POST') {
      await q('delete from familia.sessions where token_hash=$1', [me.hash]);
      return { ok: true };
    }
    if (a === 'state' && M === 'GET') {
      const [family] = await q('select name,invite,ics_token from familia.families where id=$1', [fam]);
      const members = await q('select id,name,color from familia.members where family_id=$1 order by created_at', [fam]);
      const out = { me: me.id, family, members };
      for (const t of Object.keys(TABLES)) {
        out[t] = await q(`select id,${Object.keys(TABLES[t]).join(',')} from familia.${t} where family_id=$1 order by created_at`, [fam]);
      }
      return out;
    }
    if (a === 'rotate' && M === 'POST') {
      await q('update familia.families set invite=$2, ics_token=$3 where id=$1', [fam, randomBytes(8).toString('hex'), randomBytes(24).toString('hex')]);
      return { ok: true };
    }
    if (a && Object.hasOwn(TABLES, a)) {
      const spec = TABLES[a];
      if (M === 'DELETE' && a === 'shopping' && b === 'done') {
        await q('delete from familia.shopping where family_id=$1 and done', [fam]);
        return { ok: true };
      }
      if (b !== undefined && !isUuid(b)) throw bad('Não encontrado.', 404);
      const cols = Object.keys(spec).filter((k) => Object.hasOwn(body, k));
      const creating = M === 'POST' && !b;
      if (creating) for (const k of a === 'events' ? ['title', 'starts'] : ['title']) if (!cols.includes(k)) throw bad('Faltam dados.');
      const vals = cols.map((k) => spec[k](body[k]));
      const who = vals[cols.indexOf('member_id')];
      if (who && !(await q('select 1 from familia.members where id=$1 and family_id=$2', [who, fam])).length) throw bad('Pessoa inválida.');
      const out = `id,${Object.keys(spec).join(',')}`;
      if (creating) {
        const marks = cols.map((_, i) => '$' + (i + 2)).join(',');
        return (await q(`insert into familia.${a}(family_id,${cols.join(',')}) values($1,${marks}) returning ${out}`, [fam, ...vals]))[0];
      }
      let rows;
      if (M === 'PATCH' && b && cols.length) {
        rows = await q(`update familia.${a} set ${cols.map((k, i) => `${k}=$${i + 3}`).join(',')} where id=$1 and family_id=$2 returning ${out}`, [b, fam, ...vals]);
      } else if (M === 'DELETE' && b) {
        rows = await q(`delete from familia.${a} where id=$1 and family_id=$2 returning id`, [b, fam]);
      }
      if (rows) {
        if (!rows.length) throw bad('Este item já foi apagado.', 404);
        return rows[0];
      }
    }
    throw bad('Não encontrado.', 404);
  }

  return async (req) => {
    const o = req.headers.get('origin');
    const h = { vary: 'Origin', 'cache-control': 'no-store' };
    if (o && origins.includes(o)) Object.assign(h, {
      'access-control-allow-origin': o, 'access-control-allow-headers': 'authorization,content-type',
      'access-control-allow-methods': 'GET,POST,PATCH,DELETE', 'access-control-max-age': '3600',
    });
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    try {
      const r = await route(req);
      return r instanceof Response ? r : Response.json(r, { headers: h });
    } catch (e) {
      if (!e.status) console.error(e);
      return Response.json({ error: e.status ? e.message : 'Erro no servidor.' }, { status: e.status || 500, headers: h });
    }
  };
}
