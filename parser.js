const API_URL = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ? 'http://localhost:3001'
  : 'https://api.посо.su';

const token = localStorage.getItem('token');
if (!token) location.href = 'index.html';

const state = {
  page: 1,
  perPage: 10,
  type: 'all',
  server: '',
  privilege: '',
  total: 0,
  totalPages: 1
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function esc(s) {
  if (s == null) return '';
  const d = document.createElement('div');
  d.textContent = String(s);
  return d.innerHTML;
}

function toast(msg) {
  let el = document.querySelector('.ft-toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'ft-toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  requestAnimationFrame(() => el.classList.add('show'));
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 2000);
}

function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => toast('Скопировано ✓')).catch(() => fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); toast('Скопировано ✓'); } catch { toast('Не удалось скопировать'); }
  document.body.removeChild(ta);
}

function isHash(value) {
  if (!value || typeof value !== 'string') return false;
  const s = value.trim();
  return s.startsWith('$SHA$') || s.startsWith('$2y$') || s.startsWith('$2a$') || s.startsWith('$2b$') || /^[0-9a-f]{32}$/i.test(s) || /^[0-9a-f]{40}$/i.test(s) || /^[0-9a-f]{64}$/i.test(s);
}

async function api(url, options = {}) {
  const res = await fetch(API_URL + url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...(options.headers || {})
    }
  });
  if (res.status === 401) {
    localStorage.removeItem('token');
    location.href = 'index.html';
    throw new Error('Unauthorized');
  }
  return res;
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(String(iso).replace(' ', 'T') + '+03:00');
  if (isNaN(d)) return '—';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}, ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

function nickState(row) {
  if (row.in_db === 1 && row.checked === 1) return 'st-done';
  if (row.in_db === 1) return 'st-green';
  return 'st-white';
}

function renderRows(rows) {
  const tbody = $('#tbody');
  if (!rows.length) {
    tbody.innerHTML = '';
    $('#emptyState').classList.remove('hidden');
    return;
  }
  $('#emptyState').classList.add('hidden');
  tbody.innerHTML = rows.map(r => {
    const priv = r.checked && r.check_result ? r.check_result : (r.privilege || '');
    return `<tr>
      <td><div class="td-server"><img src="funtime.png" class="td-server-icon" alt="" onerror="this.style.display='none'"><span class="td-server-name">${esc(r.server || 'FunTime')}</span></div></td>
      <td><span class="td-nick ${nickState(r)}" data-nick="${esc(r.nickname)}" data-display="${esc(r.display)}" title="Нажмите для проверки ника">${esc(r.display)}</span></td>
      <td>${priv ? `<span class="td-priv">${esc(priv)}</span>` : '<span class="td-priv"><span class="priv-none">—</span></span>'}</td>
      <td><span class="td-date">${esc(fmtDate(r.parse_date))}</span></td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('.td-nick').forEach(el => {
    el.addEventListener('click', () => openCheckModal(el.dataset.nick, el.dataset.display));
  });
}

function renderPagination() {
  const el = $('#pagination');
  const total = state.totalPages;
  const cur = state.page;
  if (total <= 1) { el.innerHTML = ''; return; }
  const pages = new Set([1, total, cur - 1, cur, cur + 1]);
  const sorted = [...pages].filter(p => p >= 1 && p <= total).sort((a, b) => a - b);
  let html = '';
  let prev = 0;
  for (const p of sorted) {
    if (prev && p - prev > 1) html += '<span class="pg-ellipsis">…</span>';
    html += `<button class="pg-btn ${p === cur ? 'active' : ''}" data-page="${p}">${p}</button>`;
    prev = p;
  }
  el.innerHTML = html;
  el.querySelectorAll('.pg-btn').forEach(b => {
    b.addEventListener('click', () => { state.page = parseInt(b.dataset.page); loadRows(); });
  });
}

function archiveNicks(rows) {
  try {
    const key = 'ft_nick_archive';
    const set = new Set(JSON.parse(localStorage.getItem(key) || '[]'));
    let added = 0;
    for (const r of rows || []) {
      const n = String(r.display || r.nickname || '').trim();
      if (n && !set.has(n)) { set.add(n); added++; }
    }
    if (added) localStorage.setItem(key, JSON.stringify([...set]));
    if (added) console.log(`[parser] Архив ников: +${added} (всего ${set.size})`);
  } catch {
  }
}

const nickArchiveKey = 'ft_nick_archive';

function getArchivedNicks() {
  try { return new Set(JSON.parse(localStorage.getItem(nickArchiveKey) || '[]')); }
  catch { return new Set(); }
}

function downloadNickArchive() {
  const set = getArchivedNicks();
  if (!set.size) { toast('Архив ников пуст'); return; }
  const sorted = [...set].sort((a, b) => a.localeCompare(b, 'ru'));
  const blob = new Blob([sorted.join('\n')], { type: 'text/plain;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'ники_архив.txt';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
  toast(`Скачано ников: ${sorted.length}`);
}

function archiveNick(name) {
  try {
    const set = getArchivedNicks();
    const n = String(name || '').trim();
    if (n && !set.has(n)) {
      set.add(n);
      localStorage.setItem(nickArchiveKey, JSON.stringify([...set]));
    }
  } catch {
  }
}

async function loadRows() {
  const q = new URLSearchParams({ page: state.page, perPage: state.perPage, type: state.type });
  if (state.server) q.set('server', state.server);
  if (state.privilege) q.set('privilege', state.privilege);
  try {
    const res = await api(`/api/parser/rows?${q}`);
    if (!res.ok) throw new Error('load failed');
    const data = await res.json();
    state.total = data.total;
    state.totalPages = Math.max(1, Math.ceil(data.total / state.perPage));
    if (state.page > state.totalPages) { state.page = state.totalPages; return loadRows(); }
    $('#countLabel').innerHTML = `<b>${data.total.toLocaleString('ru-RU')}</b> строк по фильтру`;
    renderRows(data.rows);
    archiveNicks(data.rows);
    renderPagination();
  } catch (e) {
    if (e.message === 'Unauthorized') return;
    $('#countLabel').textContent = 'Ошибка загрузки';
  }
}

function setupDropdown(filterEl, menuEl, onPick) {
  const btn = filterEl.querySelector('.ft-drop-btn');
  const valueEl = filterEl.querySelector('.ft-drop-value');
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    $$('.ft-menu').forEach(m => m !== menuEl && m.classList.add('hidden'));
    const willOpen = menuEl.classList.contains('hidden');
    menuEl.classList.toggle('hidden', !willOpen);
  });
  menuEl.addEventListener('click', (e) => {
    const opt = e.target.closest('.ft-option');
    if (!opt) return;
    $$('.ft-option', menuEl).forEach(o => o.classList.toggle('selected', o === opt));
    if (valueEl) {
      valueEl.textContent = opt.textContent;
      valueEl.dataset.value = opt.dataset.value;
    }
    menuEl.classList.add('hidden');
    onPick(opt.dataset.value);
  });
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.ft-filter')) $$('.ft-menu').forEach(m => m.classList.add('hidden'));
});

async function loadFilters() {
  try {
    const res = await api('/api/parser/filters');
    if (!res.ok) return;
    const data = await res.json();
    const privMenu = $('#privMenu');
    privMenu.innerHTML = '<div class="ft-option" data-value="">Все привилегии</div>' +
      data.privileges.map(p => `<div class="ft-option" data-value="${esc(p)}">${esc(p)}</div>`).join('');
    const serverMenu = $('#serverMenu');
    serverMenu.innerHTML = '<div class="ft-option" data-value="">Все серверы</div>' +
      data.servers.map(s => `<div class="ft-option" data-value="${esc(s)}">FT ${esc(s)}</div>`).join('');
  } catch { /* ignore */ }
}

function setType(type) { state.type = type; state.page = 1; loadRows(); }
function setServer(server) {
  state.server = server; state.page = 1;
  $('#serverChip').classList.toggle('hidden', !server);
  if (server) {
    $('#serverEmpty').textContent = `FT ${server}`;
    $('#serverChip').classList.remove('hidden');
  } else {
    $('#serverEmpty').textContent = '';
    $('#serverChip').classList.add('hidden');
  }
  loadRows();
}
function setPrivilege(privilege) { state.privilege = privilege; state.page = 1; loadRows(); }

setupDropdown($('#typeFilter'), $('#typeMenu'), setType);
setupDropdown($('#serverFilter'), $('#serverMenu'), setServer);
setupDropdown($('#privFilter'), $('#privMenu'), setPrivilege);

$('#serverChipX').addEventListener('click', (e) => {
  e.stopPropagation();
  setServer('');
});

$('#perPage').addEventListener('change', (e) => {
  state.perPage = parseInt(e.target.value);
  state.page = 1;
  loadRows();
});

$('#archiveBtn').addEventListener('click', downloadNickArchive);

// Быстрое обновление: запускаем фоновую переиндексацию на сервере и сразу обновляем таблицу
$('#refreshBtn').addEventListener('click', async () => {
  const btn = $('#refreshBtn');
  btn.disabled = true;
  btn.textContent = 'Обновляю…';
  try {
    const res = await api('/api/parser/refresh', { method: 'POST', body: '{}' });
    const data = await res.json();
    if (res.ok) {
      if (data.newRows != null) toast(`Обновлено: +${data.newRows} новых строк`);
      else toast('Таблица обновлена');
    } else {
      toast(data.error || 'Ошибка обновления');
    }
  } catch {
    toast('Не удалось обновить');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Обновить';
    loadRows();
  }
});

// ============ Модалка ============
let modalCheckId = 0;

function openCheckModal(nick, display) {
  const checkId = ++modalCheckId;
  const nickEl = $('#modalNick');
  nickEl.textContent = display || nick;
  nickEl.dataset.nick = nick;
  archiveNick(display || nick);
  $('#modalStatus').textContent = 'Чекер…';
  $('#modalSpinner').classList.remove('hidden');
  $('#modalResult').classList.add('hidden');
  $('#modalError').classList.add('hidden');
  $('#modalDonateResult').classList.add('hidden');
  $('#modalDonateBtn').disabled = false;
  $('#modal').classList.remove('hidden');

  runCheck(nick)
    .then(result => {
      if (checkId !== modalCheckId) return;
      $('#modalStatus').textContent = 'Готово';
      $('#modalSpinner').classList.add('hidden');
      renderCheckResult(result);
    })
    .catch(e => {
      if (checkId !== modalCheckId) return;
      $('#modalStatus').textContent = 'Ошибка проверки';
      $('#modalSpinner').classList.add('hidden');
      $('#modalError').classList.remove('hidden');
      $('#modalError').textContent = e.message || 'Ошибка проверки';
    });
}

async function runCheck(nick) {
  const res = await api('/api/parser/check', {
    method: 'POST',
    body: JSON.stringify({ nickname: nick })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка проверки');
  return data;
}

function renderCheckResult(result) {
  const badge = $('#modalResultBadge');
  const listEl = $('#modalResultList');
  const meta = $('#modalResultMeta');
  const box = $('#modalResult');
  box.classList.remove('hidden', 'good');
  listEl.innerHTML = '';
  meta.textContent = '';

  const found = result.found || [];
  const o2 = result.o2 || [];
  const dehash = result.dehash || [];
  const decryptedByHash = {};
  dehash.forEach(d => {
    if (d.status === 'decrypted') decryptedByHash[d.originalResult.password] = d.decryptedPassword;
  });

  const lines = [];
  for (const r of found) {
    const decrypted = decryptedByHash[r.password];
    const hash = r.password || '';
    let line = `<div class="ft-dbrow">
      <div class="ft-dbrow-head">🗃 <b>${esc(r.database)}</b> <span class="ft-dbrow-src">${esc(r.source)}</span></div>
      <div class="ft-hashbox" data-hash="${esc(hash)}" title="Нажмите, чтобы открыть хеш целиком"><span class="ft-hash-key">🔐</span><span class="ft-hash-val">${esc(hash)}</span><span class="ft-hash-more" title="Полный хеш в отдельном окне">👁</span></div>`;
    if (decrypted) line += `<div class="ft-dbrow-pw">🔑 Пароль: <span class="ft-hash-key" data-copy="${esc(decrypted)}" title="Нажмите, чтобы скопировать">${esc(decrypted)}</span></div>`;
    line += `</div>`;
    lines.push(line);
  }
  for (const r of o2) {
    const extra = r.password || r.email || r.hash || '';
    let line = `<div class="ft-dbrow">
      <div class="ft-dbrow-head">🗃 <b>${esc(r.db || r.database || 'o2')}</b> <span class="ft-dbrow-src">o2</span></div>`;
    if (extra) {
      line += `<div class="ft-hashbox" data-hash="${esc(extra)}" title="Нажмите, чтобы открыть полное значение"><span class="ft-hash-key">🔐</span><span class="ft-hash-val">${esc(extra)}</span><span class="ft-hash-more" title="Полное значение в отдельном окне">👁</span></div>`;
    }
    line += `</div>`;
    lines.push(line);
  }
  listEl.innerHTML = lines.join('');

  listEl.querySelectorAll('.ft-hashbox').forEach(el => {
    el.addEventListener('click', () => openHashModal(el.dataset.hash));
  });
  listEl.querySelectorAll('.ft-dbrow-pw .ft-hash-key').forEach(el => {
    el.addEventListener('click', () => copyText(el.dataset.copy));
  });

  if (found.length + o2.length === 0) {
    badge.textContent = 'Не найден в базах';
  } else {
    badge.textContent = `Найден в ${found.length + o2.length} базе(ах)`;
    box.classList.add('good');
    const undecryptedCount = dehash.filter(d => d.status === 'not_found').length;
    meta.textContent = 'данные из баз данных · мгновенно' + (undecryptedCount ? ` · Не расшифровано хешей: ${undecryptedCount} — откройте хеш и нажмите «Брут»` : '');
  }
}

let modalHashId = 0;

function openHashModal(hash) {
  modalHashId++;
  $('#hashDisplay').textContent = hash || '';
  $('#hashDisplay').dataset.copy = hash || '';
  $('#hashModalBrut').classList.toggle('hidden', !isHash(hash));
  $('#hashModal').classList.remove('hidden');
}

function closeHashModal() {
  modalHashId++;
  $('#hashModal').classList.add('hidden');
}

async function checkDonate(nick) {
  const btn = $('#modalDonateBtn');
  const resEl = $('#modalDonateResult');
  btn.disabled = true;
  btn.textContent = 'Валидка funtime.su…';
  resEl.classList.add('hidden');
  try {
    const res = await api('/api/parser/check-donate', {
      method: 'POST',
      body: JSON.stringify({ nickname: nick })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Ошибка проверки');
    const donate = data.result && data.result.donate;
    const label = !donate || donate === 'No Donation' || donate === 'EXISTS' || donate === 'ERROR'
      ? 'Нет доната'
      : (donate === 'Unregistered' || donate === 'Аккаунт не существует' ? 'Аккаунт не существует' : donate);
    resEl.textContent = `✅ Результат: ${label}`;
    resEl.classList.remove('hidden');
    loadRows();
  } catch (e) {
    resEl.textContent = `❌ ${e.message || 'Ошибка проверки'}`;
    resEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Узнать дон на funtime.su';
  }
}

function closeModal() {
  modalCheckId++;
  $('#modal').classList.add('hidden');
}

$('#modalClose').addEventListener('click', closeModal);
$('#modalNick').addEventListener('click', (e) => {
  const nick = e.target.textContent;
  if (nick && nick !== '—') copyText(nick);
});
$('#modalDonateBtn').addEventListener('click', () => {
  const nick = $('#modalNick').textContent;
  if (nick && nick !== '—') checkDonate(nick);
});
$('#modal').addEventListener('click', (e) => {
  if (e.target === $('#modal')) closeModal();
});
$('#hashModalClose').addEventListener('click', closeHashModal);
$('#hashModalCopy').addEventListener('click', () => copyText($('#hashDisplay').dataset.copy));
$('#hashModalBrut').addEventListener('click', () => {
  const h = $('#hashDisplay').dataset.copy;
  if (h) location.href = 'index.html?hashcat=' + encodeURIComponent(h);
});
$('#hashModal').addEventListener('click', (e) => {
  if (e.target === $('#hashModal')) closeHashModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!$('#modal').classList.contains('hidden')) closeModal();
    else if (!$('#hashModal').classList.contains('hidden')) closeHashModal();
  }
});

// ============ Старт ============
loadFilters();
loadRows();
setInterval(() => {
  if (!$('#modal').classList.contains('hidden')) return;
  loadRows();
}, 30000);