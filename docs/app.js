const $ = (s, r = document) => r.querySelector(s);
const app = $('#app'), dlg = $('#dlg');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* storage blocked */ } } };
let token = store.get('token'), S = null, tab = 'hoje', sel, month, busy = 0, entry = new URLSearchParams(location.hash.slice(1)).get('convite') ? 'join' : 'login';

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const at = (s) => new Date(s.slice(0, 10) + 'T12:00');
const plus = (s, n) => { const d = at(s); d.setDate(d.getDate() + n); return iso(d); };
const today = () => iso(new Date());
const fmt = (s, o) => at(s).toLocaleDateString('pt-BR', o);
const nice = (s) => s === today() ? 'Hoje' : s === plus(today(), 1) ? 'Amanhã' : fmt(s, { weekday: 'short', day: 'numeric', month: 'short' });
const REP = { none: 'Não repete', daily: 'Todo dia', weekly: 'Toda semana', monthly: 'Todo mês', yearly: 'Todo ano' };
const CATS = ['Hortifruti', 'Carnes', 'Frios e laticínios', 'Padaria', 'Mercearia', 'Bebidas', 'Limpeza', 'Higiene', 'Outros'];
const COLORS = ['#173f7f', '#3b9bea', '#e07b39', '#8a4a9e', '#c23b5a', '#8f6410'];
const REM = [['', 'Sem lembrete'], [0, 'Na hora'], [30, '30 minutos antes'], [60, '1 hora antes'], [1440, '1 dia antes'], [10080, '1 semana antes']];
sel = today(); month = sel.slice(0, 7);

function toast(t) { const e = $('#toast'); e.textContent = t; e.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => e.classList.remove('on'), 3500); }
async function api(method, path, body) {
  let r;
  try {
    r = await fetch(window.API + path, { method, headers: { ...(token && { authorization: 'Bearer ' + token }), ...(body && { 'content-type': 'application/json' }) }, body: body && JSON.stringify(body) });
  } catch { throw new Error('Sem conexão. Tente de novo.'); }
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && token) { token = null; S = null; store.set('token', null); dlg.close(); render(); }
  if (!r.ok) throw new Error(j.error || 'Algo deu errado.');
  return j;
}
async function load(quiet) {
  if (!token || busy) return;
  try {
    const next = await api('GET', '/state');
    next.members.forEach((m, i) => { m.color = COLORS[i % COLORS.length]; });
    if (busy) return;
    const changed = JSON.stringify(next) !== JSON.stringify(S);
    S = next;
    const typing = app.contains(document.activeElement) && document.activeElement.matches('input:not([type=checkbox]),select');
    if (changed && !(quiet && typing)) render();
  } catch (e) { if (!quiet) { toast(e.message); if (!S) render(e.message); } }
}
async function act(fn) {
  busy++;
  try { return await fn(); } catch (e) { toast(e.message); return null; } finally { busy--; if (!busy) { await load(true); if (S) render(); } }
}

// Does an event happen on a given day? Same rule as the calendar feed (RRULE).
function on(e, day) {
  const s = e.starts.slice(0, 10), span = e.ends && e.ends.slice(0, 10) > s ? Math.round((at(e.ends) - at(s)) / 864e5) : 0;
  for (let i = 0; i <= span; i++) {
    const d = plus(day, -i);
    if (d < s) return false;
    if (d === s || e.repeat === 'daily') return true;
    if (e.repeat === 'weekly' && Math.round((at(d) - at(s)) / 864e5) % 7 === 0) return true;
    if (e.repeat === 'monthly' && d.slice(8) === s.slice(8)) return true;
    if (e.repeat === 'yearly' && d.slice(5) === s.slice(5)) return true;
    if (i > 366) return false;
  }
  return false;
}
const eventsOn = (d) => S.events.filter((e) => on(e, d)).sort((a, b) => (a.all_day ? '' : a.starts.slice(11)).localeCompare(b.all_day ? '' : b.starts.slice(11)));
const who = (id) => S.members.find((m) => m.id === id);
const dot = (id) => `<i class="dot" style="background:${esc(who(id)?.color || '')}"></i>`;
const eventRow = (e) => `<div class="row"><span class="time">${e.all_day ? 'Dia todo' : esc(e.starts.slice(11))}</span>${dot(e.member_id)}<button class="body" data-ev="${e.id}">${esc(e.title)}<small>${esc([who(e.member_id)?.name || 'Família', e.place].filter(Boolean).join(', '))}</small></button></div>`;
const taskRow = (t) => `<div class="row ${t.done ? 'done' : ''}"><input type="checkbox" id="t${t.id}" data-tk="${t.id}" ${t.done ? 'checked' : ''}><label class="body" for="t${t.id}">${esc(t.title)}<small class="${!t.done && t.due && t.due < today() ? 'late' : ''}">${esc([who(t.member_id)?.name || 'Qualquer pessoa', t.due && nice(t.due), t.repeat !== 'none' && REP[t.repeat]].filter(Boolean).join(', '))}</small></label><button class="x" data-ted="${t.id}" aria-label="Editar ${esc(t.title)}">✎</button></div>`;
const list = (rows, empty) => `<div class="list">${rows.length ? rows.join('') : `<div class="empty">${empty}</div>`}</div>`;
const byDue = (a, b) => (a.due || '9').localeCompare(b.due || '9');
const options = (pairs, cur) => pairs.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(cur ?? '') ? 'selected' : ''}>${esc(l)}</option>`).join('');

const V = {
  hoje() {
    const t = today(), due = S.tasks.filter((k) => !k.done && k.due && k.due <= t).sort(byDue);
    const next = [1, 2, 3, 4, 5, 6].map((n) => plus(t, n)).filter((d) => eventsOn(d).length);
    const shop = S.shopping.filter((i) => !i.done).length;
    return `<h1>Olá, ${esc(who(S.me).name)}</h1><p class="soft">${esc(fmt(t, { weekday: 'long', day: 'numeric', month: 'long' }))}</p>
    <h2>Hoje</h2>${list(eventsOn(t).map(eventRow), 'Nenhum compromisso hoje.')}
    ${due.length ? `<h2>Tarefas para agora</h2>${list(due.map(taskRow))}` : ''}
    <h2>Mercado</h2><div class="list"><div class="row"><button class="body" data-go="mercado">${shop ? `${shop} ${shop === 1 ? 'item' : 'itens'} para comprar` : 'Lista vazia'}</button></div></div>
    ${next.map((d) => `<h2>${esc(nice(d))}</h2>${list(eventsOn(d).map(eventRow))}`).join('')}`;
  },
  agenda() {
    const [y, m] = month.split('-').map(Number), first = new Date(y, m - 1, 1).getDay(), n = new Date(y, m, 0).getDate();
    let cells = '<span></span>'.repeat(first);
    for (let i = 1; i <= n; i++) {
      const d = `${month}-${pad(i)}`, ev = eventsOn(d);
      cells += `<button data-day="${d}" class="${d === sel ? 'sel' : d === today() ? 'today' : ''}" aria-label="${esc(fmt(d, { day: 'numeric', month: 'long' }))}, ${ev.length} compromissos">${i}<i>${ev.slice(0, 3).map((e) => `<b style="background:${esc(who(e.member_id)?.color || 'currentColor')}"></b>`).join('')}</i></button>`;
    }
    return `<div class="bar"><button data-mo="-1" aria-label="Mês anterior">‹</button><h1>${esc(fmt(month + '-01', { month: 'long', year: 'numeric' }))}</h1><button data-mo="1" aria-label="Próximo mês">›</button></div>
    <div class="cal">${['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((x) => `<span>${x}</span>`).join('')}${cells}</div>
    <div class="bar" style="margin-top:22px"><h2 style="margin:0">${esc(nice(sel))}</h2><button class="pri" data-ev="new">Novo compromisso</button></div>${list(eventsOn(sel).map(eventRow), 'Dia livre.')}`;
  },
  mercado() {
    const open = S.shopping.filter((i) => !i.done), done = S.shopping.filter((i) => i.done);
    const row = (i) => `<div class="row ${i.done ? 'done' : ''}"><input type="checkbox" id="s${i.id}" data-sh="${i.id}" ${i.done ? 'checked' : ''}><label class="body" for="s${i.id}">${esc(i.title)}${i.qty ? `<small>${esc(i.qty)}</small>` : ''}</label><button class="x" data-del="${i.id}" aria-label="Apagar ${esc(i.title)}">×</button></div>`;
    const usual = JSON.parse(store.get('usual') || '[]').filter((u) => !S.shopping.some((i) => i.title.toLowerCase() === u.title.toLowerCase())).sort((a, b) => b.n - a.n).slice(0, 8);
    return `<h1>Mercado</h1><form id="shop"><div class="add"><input name="title" maxlength="120" placeholder="O que falta?" aria-label="Item" required autocomplete="off"><input name="qty" maxlength="40" placeholder="Qtd." aria-label="Quantidade" style="max-width:84px" autocomplete="off"></div><div class="add"><select name="category" aria-label="Categoria" style="flex:1;max-width:none">${options(CATS.map((c) => [c, c]), store.get('cat') || 'Mercearia')}</select><button class="pri">Adicionar</button></div></form>
    ${usual.length ? `<p class="soft">Vocês costumam comprar</p><div class="chips">${usual.map((u) => `<button data-us="${esc(u.title)}" data-cat="${esc(u.category)}">+ ${esc(u.title)}</button>`).join('')}</div>` : ''}
    ${open.length ? [...new Set([...CATS, ...open.map((i) => i.category)])].map((c) => { const r = open.filter((i) => i.category === c); return r.length ? `<h2>${esc(c)}</h2>${list(r.map(row))}` : ''; }).join('') : `<h2>Para comprar</h2>${list([], 'Nada na lista.')}`}
    ${done.length ? `<div class="bar" style="margin-top:26px"><h2 style="margin:0">No carrinho</h2><button data-clear>Limpar comprados</button></div>${list(done.map(row))}` : ''}`;
  },
  tarefas() {
    const open = S.tasks.filter((t) => !t.done).sort(byDue), done = S.tasks.filter((t) => t.done);
    return `<div class="bar"><h1>Tarefas</h1><button class="pri" data-ted="new">Nova tarefa</button></div>${list(open.map(taskRow), 'Nenhuma tarefa pendente.')}${done.length ? `<h2>Feitas</h2>${list(done.map(taskRow))}` : ''}`;
  },
  familia() {
    const feed = `${window.API}/ics/${S.family.ics_token}.ics`, inv = `${location.href.split('#')[0]}#convite=${S.family.invite}`;
    return `<h1>${esc(S.family.name)}</h1><h2>Pessoas</h2>${list(S.members.map((m) => `<div class="row">${dot(m.id)}<span class="body">${esc(m.name)}</span></div>`))}
    <h2>Convidar</h2><p class="soft">Envie este link só para a sua família.</p><code>${esc(inv)}</code><button data-copy="${esc(inv)}">Copiar convite</button>
    <h2>Calendário do iPhone</h2><p class="soft">Os compromissos aparecem no app Calendário, só para leitura. Para receber os avisos, desligue “Remover Alarmes” ao assinar.</p><p><a class="btn pri" href="${esc(feed.replace(/^https?/, 'webcal'))}">Assinar no iPhone</a></p>
    <h2>Google Agenda</h2><p class="soft">No computador, abra Google Agenda, Outras agendas, De URL, e cole este link. O Google pode levar horas para atualizar.</p><code>${esc(feed)}</code><button data-copy="${esc(feed)}">Copiar link</button>
    <h2>Segurança</h2><p class="soft">Se um link vazar, troque os dois. Será preciso assinar os calendários de novo.</p><div class="acts"><button data-rotate>Trocar links</button><button class="danger" data-out>Sair</button></div>`;
  },
};
const ICON = { hoje: 'M3 11l9-8 9 8v10h-6v-6H9v6H3z', agenda: 'M4 5h16v16H4zM4 10h16M8 2v5M16 2v5', mercado: 'M2 3h3l3 12h10l3-8H6M9 20h.01M18 20h.01', tarefas: 'M4 6l2 2 3-4M4 16l2 2 3-4M13 6h8M13 17h8', familia: 'M9 11a4 4 0 100-8 4 4 0 000 8zM2 21a7 7 0 0114 0M17 4a4 4 0 010 7M19 15a6 6 0 013 6' };
const NAME = { hoje: 'Hoje', agenda: 'Agenda', mercado: 'Mercado', tarefas: 'Tarefas', familia: 'Família' };

function render(error) {
  if (!token) return renderEntry();
  if (!S) { app.innerHTML = `<main><p>${esc(error || 'Carregando…')}</p>${error ? '<button class="pri" data-retry>Tentar de novo</button>' : ''}</main>`; return; }
  app.innerHTML = `<main>${V[tab]()}</main><nav>${Object.keys(V).map((k) => `<button data-go="${k}" ${k === tab ? 'aria-current="page"' : ''}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICON[k]}"/></svg>${NAME[k]}</button>`).join('')}</nav>`;
}
function renderEntry() {
  const inv = new URLSearchParams(location.hash.slice(1)).get('convite') || '', j = entry === 'join', s = entry === 'setup';
  app.innerHTML = `<main style="max-width:420px"><h1>${j ? 'Entrar na família' : s ? 'Criar a família' : 'Família'}</h1><p class="soft">${window.API ? 'Agenda, mercado e tarefas de casa.' : 'O servidor ainda não foi configurado.'}</p><form id="entry">
  ${s ? '<label>Código de instalação<input name="code" type="password" required autocomplete="off"></label><label>Nome da família<input name="family" maxlength="60" required></label>' : ''}
  ${j ? `<label>Convite<input name="invite" value="${esc(inv)}" required autocomplete="off"></label>` : ''}
  ${j || s ? '<label>Seu nome<input name="name" maxlength="60" required autocomplete="name"></label>' : ''}
  <label>E-mail<input name="email" type="email" required autocomplete="username"></label>
  <label>Senha<input name="password" type="password" minlength="8" required autocomplete="${j || s ? 'new-password' : 'current-password'}"></label>
  <div class="acts"><button class="pri">${j || s ? 'Criar acesso' : 'Entrar'}</button></div></form>
  <div class="acts">${['login', 'join', 'setup'].filter((x) => x !== entry).map((x) => `<button data-entry="${x}">${{ login: 'Já tenho acesso', join: 'Tenho um convite', setup: 'Criar família' }[x]}</button>`).join('')}</div></main>`;
}

const people = (cur, none) => options([['', none], ...S.members.map((m) => [m.id, m.name])], cur);
function eventForm(id) {
  const e = S.events.find((x) => x.id === id) || { starts: sel + 'T09:00', repeat: 'none', remind_min: 60, member_id: '' };
  const end = e.ends || (e.all_day ? e.starts : '');
  dlg.innerHTML = `<form id="evf" data-id="${e.id || ''}"><h1>${e.id ? 'Compromisso' : 'Novo compromisso'}</h1><label>O que é<input name="title" maxlength="200" required value="${esc(e.title)}"></label><label class="in"><input type="checkbox" name="all_day" ${e.all_day ? 'checked' : ''}>Dia todo</label>
  <div class="two"><label>Começa<input type="date" name="d1" required value="${esc(e.starts.slice(0, 10))}"></label><label data-h>Hora<input type="time" name="t1" value="${esc(e.starts.slice(11) || '09:00')}"></label><label>Termina<input type="date" name="d2" value="${esc(end.slice(0, 10))}"></label><label data-h>Hora<input type="time" name="t2" value="${esc(end.slice(11))}"></label></div>
  <label>De quem<select name="member_id">${people(e.member_id, 'Família toda')}</select></label><div class="two"><label>Repetir<select name="repeat">${options(Object.entries(REP), e.repeat)}</select></label><label>Lembrete<select name="remind_min">${options(REM, e.remind_min)}</select></label></div>
  <label>Lugar<input name="place" maxlength="200" value="${esc(e.place)}"></label><label>Observações<textarea name="notes" maxlength="2000">${esc(e.notes)}</textarea></label>
  ${e.id ? `<p style="margin-top:14px"><a class="btn" target="_blank" rel="noopener noreferrer" href="${esc(gcal(e))}">Adicionar ao Google Agenda</a></p>` : ''}
  <div class="acts">${e.id ? `<button type="button" class="danger" data-rm="events">Apagar</button>` : ''}<button type="button" data-close>Cancelar</button><button class="pri">Salvar</button></div></form>`;
  const f = $('#evf'), sync = () => dlg.querySelectorAll('[data-h]').forEach((x) => { x.hidden = f.all_day.checked; });
  f.all_day.onchange = sync; sync(); dlg.showModal();
}
function taskForm(id) {
  const t = S.tasks.find((x) => x.id === id) || { repeat: 'none' };
  dlg.innerHTML = `<form id="tkf" data-id="${t.id || ''}"><h1>${t.id ? 'Tarefa' : 'Nova tarefa'}</h1><label>O que fazer<input name="title" maxlength="200" required value="${esc(t.title)}"></label><label>Responsável<select name="member_id">${people(t.member_id, 'Qualquer pessoa')}</select></label><div class="two"><label>Para quando<input type="date" name="due" value="${esc(t.due)}"></label><label>Repetir<select name="repeat">${options(Object.entries(REP), t.repeat)}</select></label></div><div class="acts">${t.id ? '<button type="button" class="danger" data-rm="tasks">Apagar</button>' : ''}<button type="button" data-close>Cancelar</button><button class="pri">Salvar</button></div></form>`;
  dlg.showModal();
}
function gcal(e) {
  const c = (s) => s.replace(/[-:]/g, ''), hour = (s) => { const d = new Date(s); d.setHours(d.getHours() + 1); return `${iso(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const dates = e.all_day ? `${c(e.starts.slice(0, 10))}/${c(plus((e.ends || e.starts).slice(0, 10), 1))}` : `${c(e.starts)}00/${c(e.ends || hour(e.starts))}00`;
  const p = new URLSearchParams({ action: 'TEMPLATE', text: e.title, dates, ctz: 'America/Sao_Paulo', location: e.place || '', details: e.notes || '' });
  if (e.repeat !== 'none') p.set('recur', 'RRULE:FREQ=' + e.repeat.toUpperCase());
  return 'https://calendar.google.com/calendar/render?' + p;
}
function nextDue(t) {
  const step = (s, n) => {
    if (t.repeat === 'daily') return plus(s, n);
    if (t.repeat === 'weekly') return plus(s, 7 * n);
    const d = at(s), day = d.getDate();
    d.setDate(1); d.setMonth(d.getMonth() + (t.repeat === 'yearly' ? 12 : 1) * n);
    d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
    return iso(d);
  };
  const base = t.due || today();
  let n = 1;
  while (step(base, n) <= today()) n++;
  return step(base, n);
}
async function addItem(title, category, qty) {
  const u = JSON.parse(store.get('usual') || '[]'), hit = u.find((x) => x.title.toLowerCase() === title.toLowerCase());
  if (hit) { hit.n++; hit.category = category; } else u.push({ title, category, n: 1 });
  store.set('usual', JSON.stringify(u.slice(-200)));
  return act(() => api('POST', '/shopping', { title, category, qty }));
}

document.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const f = ev.target, d = Object.fromEntries(new FormData(f)), btn = $('button.pri', f);
  btn.disabled = true;
  try {
    if (f.id === 'entry') {
      const r = await api('POST', '/auth/' + entry, d);
      token = r.token; store.set('token', token); history.replaceState(null, '', location.pathname); render(); await load();
    } else if (f.id === 'shop') {
      if (!d.title.trim()) return;
      store.set('cat', d.category);
      const ok = await addItem(d.title.trim(), d.category, d.qty);
      if (ok) $('#shop input')?.focus();
    } else {
      const id = f.dataset.id, table = f.id === 'evf' ? 'events' : 'tasks';
      let b = d;
      if (table === 'events') {
        const all = f.all_day.checked, d2 = d.d2 || (d.t2 && !all ? d.d1 : '');
        if (!all && !d.t1) throw new Error('Informe a hora.');
        if (!all && d2 && !d.t2) throw new Error('Informe a hora do término.');
        const starts = all ? d.d1 : `${d.d1}T${d.t1}`, ends = !d2 ? null : all ? d2 : `${d2}T${d.t2}`;
        if (ends && (all ? ends < starts : ends <= starts)) throw new Error('O término precisa ser depois do início.');
        b = { title: d.title, starts, ends, all_day: all, member_id: d.member_id, repeat: d.repeat, place: d.place, notes: d.notes, remind_min: d.remind_min === '' ? null : Number(d.remind_min) };
        sel = d.d1; month = sel.slice(0, 7);
      }
      const ok = await act(() => api(id ? 'PATCH' : 'POST', '/' + table + (id ? '/' + id : ''), b));
      if (ok) { dlg.close(); toast('Salvo'); }
    }
  } catch (e) { toast(e.message); } finally { btn.disabled = false; }
});
document.addEventListener('change', (ev) => {
  const x = ev.target;
  if (x.dataset.sh) act(() => api('PATCH', '/shopping/' + x.dataset.sh, { done: x.checked }));
  if (x.dataset.tk) {
    const t = S.tasks.find((k) => k.id === x.dataset.tk);
    const b = x.checked && t.repeat !== 'none' ? { due: nextDue(t) } : { done: x.checked };
    act(() => api('PATCH', '/tasks/' + t.id, b)).then((r) => { if (r && b.due) toast('Feito! Próxima: ' + nice(b.due)); });
  }
});
document.addEventListener('click', async (ev) => {
  const x = ev.target.closest('button');
  if (!x) return;
  const d = x.dataset;
  if (d.go) { tab = d.go; render(); scrollTo(0, 0); load(true); }
  else if (d.entry) { entry = d.entry; render(); }
  else if (d.ev) eventForm(d.ev);
  else if (d.ted) taskForm(d.ted);
  else if (d.day) { sel = d.day; render(); }
  else if (d.mo) { const m = new Date(+month.slice(0, 4), +month.slice(5) - 1 + +d.mo, 1); month = iso(m).slice(0, 7); sel = month === today().slice(0, 7) ? today() : month + '-01'; render(); }
  else if (d.us) addItem(d.us, d.cat, '');
  else if (d.del) act(() => api('DELETE', '/shopping/' + d.del));
  else if ('clear' in d) act(() => api('DELETE', '/shopping/done'));
  else if ('close' in d) dlg.close();
  else if ('retry' in d) { render(); load(); }
  else if (d.rm) {
    if (d.sure) { const id = x.closest('form').dataset.id; if (await act(() => api('DELETE', `/${d.rm}/${id}`))) dlg.close(); }
    else { d.sure = 1; x.textContent = 'Apagar mesmo?'; }
  } else if ('rotate' in d) {
    if (!d.sure) { d.sure = 1; x.textContent = 'Trocar mesmo?'; } else if (await act(() => api('POST', '/rotate', {}))) toast('Links trocados');
  } else if (d.copy) { try { await navigator.clipboard.writeText(d.copy); toast('Copiado'); } catch { toast('Não consegui copiar. Selecione o texto acima.'); } }
  else if ('out' in d) { try { await api('POST', '/auth/logout', {}); } catch { /* signs out on this device anyway */ } token = null; S = null; store.set('token', null); store.set('usual', null); entry = 'login'; render(); }
});
document.addEventListener('visibilitychange', () => { if (!document.hidden) load(true); });
setInterval(() => { if (!document.hidden && !dlg.open) load(true); }, 10000);
if ('serviceWorker' in navigator && location.hostname !== 'localhost') navigator.serviceWorker.register('sw.js').catch(() => {});
render();
load();
