const API_URL = 'https://api.посо.su';
let authToken = localStorage.getItem('token');
let currentMode = 'checker';

const bgCanvas = document.getElementById('bgCanvas');
const ctx = bgCanvas.getContext('2d');

function resizeCanvas() {
  bgCanvas.width = window.innerWidth;
  bgCanvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

const nodes = [];
const NODE_COUNT = 60;
const CONNECTION_DIST = 120;

for (let i = 0; i < NODE_COUNT; i++) {
  nodes.push({
    x: Math.random() * bgCanvas.width,
    y: Math.random() * bgCanvas.height,
    vx: (Math.random() - 0.5) * 0.5,
    vy: (Math.random() - 0.5) * 0.5,
    r: Math.random() * 2 + 1,
  });
}

function drawBg() {
  ctx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
  for (const n of nodes) {
    n.x += n.vx;
    n.y += n.vy;
    if (n.x < 0 || n.x > bgCanvas.width) n.vx *= -1;
    if (n.y < 0 || n.y > bgCanvas.height) n.vy *= -1;
    ctx.beginPath();
    ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 255, 136, 0.4)';
    ctx.fill();
  }
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const dx = nodes[i].x - nodes[j].x;
      const dy = nodes[i].y - nodes[j].y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < CONNECTION_DIST) {
        ctx.beginPath();
        ctx.moveTo(nodes[i].x, nodes[i].y);
        ctx.lineTo(nodes[j].x, nodes[j].y);
        ctx.strokeStyle = `rgba(0, 255, 136, ${0.08 * (1 - dist / CONNECTION_DIST)})`;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
    }
  }
  requestAnimationFrame(drawBg);
}
drawBg();

function $(sel) { return document.querySelector(sel); }
function $$(sel) { return document.querySelectorAll(sel); }
function show(id) { document.getElementById(id).classList.remove('hidden'); }
function hide(id) { document.getElementById(id).classList.add('hidden'); }
function loading(btn, state) {
  if (state) { btn.classList.add('btn-loading'); btn.disabled = true; }
  else { btn.classList.remove('btn-loading'); btn.disabled = false; }
}

let authKicked = false;
let hashcatPollTimer = null;

function handleUnauthorized() {
  if (authKicked) return;
  authKicked = true;
  authToken = null;
  localStorage.removeItem('token');
  if (hashcatPollTimer) { clearInterval(hashcatPollTimer); hashcatPollTimer = null; }
  hide('dashboardPage');
  show('loginPage');
  $('#keyInput').value = '';
  toast('Сессия истекла — введите новый ключ', 2500);
}

async function apiFetch(url, options) {
  const res = await fetch(url, options);
  if (res.status === 401) {
    handleUnauthorized();
    throw new Error('Unauthorized');
  }
  return res;
}

function isHash(val) {
  return /^\$SHA\$/.test(val) || /^\$2[ayb]\$/.test(val) ||
         /^[a-fA-F0-9]{32}$/.test(val) || /^[a-fA-F0-9]{40}$/.test(val) ||
         /^[a-fA-F0-9]{64}$/.test(val);
}

function toast(msg, duration) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, duration || 1500);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Скопировано ✓');
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed'; ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    toast('Скопировано ✓');
  }
}

function toggleHistory(id, btn) {
  const body = document.getElementById(id);
  const arrow = btn.querySelector('.collapse-arrow');
  if (body.classList.contains('open')) {
    body.classList.remove('open');
    arrow.innerHTML = '&#9660;';
  } else {
    body.classList.add('open');
    arrow.innerHTML = '&#9650;';
  }
}

if (authToken) checkAuth();

$('#keyInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') login(); });
$('#loginBtn').addEventListener('click', login);

async function login() {
  const key = $('#keyInput').value.trim();
  if (!key) return;
  $('#errorMessage').classList.add('hidden');
  loading($('#loginBtn'), true);
  try {
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key })
    });
    const data = await res.json();
    if (!res.ok) {
      showError(data.error === 'Key expired' ? 'КЛЮЧ ИСТЁК' : 'НЕВЕРНЫЙ КЛЮЧ');
      return;
    }
    authToken = data.token;
    localStorage.setItem('token', authToken);
    authKicked = false;
    showDashboard(data);
  } catch {
    showError('ОШИБКА СОЕДИНЕНИЯ');
  } finally {
    loading($('#loginBtn'), false);
  }
}

$('#logoutBtn').addEventListener('click', () => {
  authToken = null;
  authKicked = false;
  localStorage.removeItem('token');
  hide('dashboardPage');
  show('loginPage');
  $('#keyInput').value = '';
});

function setMode(mode) {
  $$('.mode-tab').forEach(t => t.classList.remove('active'));
  const tab = document.querySelector(`.mode-tab[data-mode="${mode}"]`);
  if (tab) tab.classList.add('active');
  currentMode = mode;
  hide('panelChecker');
  hide('panelValid');
  hide('panelHashcat');
  hide('panelDecoder');
  hide('panelMass');
  show('panel' + mode.charAt(0).toUpperCase() + mode.slice(1));
  if (mode === 'valid') loadValidHistory();
  if (mode === 'hashcat') loadHashcatHistory();
}

$$('.mode-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    setMode(tab.dataset.mode);
  });
});

$('#checkBtn').addEventListener('click', checkNickname);
$('#nickInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') checkNickname(); });

async function checkNickname() {
  const nick = $('#nickInput').value.trim();
  if (!nick) return;
  loading($('#checkBtn'), true);
  try {
    const res = await apiFetch(`${API_URL}/api/check/nickname`, {
      method: 'POST', headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ nickname: nick })
    });
    const data = await res.json();
    if (res.status === 403) { renderResults([], 'ДНЕВНОЙ ЛИМИТ ИСЧЕРПАН', true, 0, null); return; }
    if (!res.ok) { renderResults([], data.error || 'ОШИБКА', true, 0, null); return; }
    renderResults(data.results, null, false, data.total, data.dehash);
  } catch {
    renderResults([], 'ОШИБКА СОЕДИНЕНИЯ', true, 0, null);
  } finally {
    loading($('#checkBtn'), false);
  }
}

function renderResults(results, error, isError, total, dehash) {
  const container = $('#checkResults');
  const list = $('#resultsList');
  const empty = $('#emptyState');
  const count = $('#resultCount');
  if (isError) {
    container.classList.remove('hidden'); empty.classList.add('hidden');
    list.innerHTML = `<div class="result-error">${error}</div>`;
    if (count) count.textContent = ''; return;
  }
  if (results.length === 0) {
    container.classList.add('hidden'); empty.classList.remove('hidden'); return;
  }
  container.classList.remove('hidden'); empty.classList.add('hidden');
  if (count) count.textContent = `${results.length} ${results.length === 1 ? 'совпадение' : 'совпадений'}`;
  let html = '';
  results.forEach((r, idx) => {
    const isHashVal = isHash(r.password);
    const decrypted = dehash?.dehashResults?.[idx]?.decryptedPassword;
    const hashLabel = isHashVal ? 'hash' : 'pass';
    html += `<div class="result-row">
      <span class="rr-nick" onclick="copyText('${escAttr(r.nickname)}')" title="Скопировать ник">${esc(r.nickname)}</span>
      <span class="rr-db">${esc(r.database)}</span>
      <span class="rr-pass ${hashLabel}" onclick="copyText('${escAttr(r.password)}')" title="Нажмите, чтобы скопировать">${esc(r.password)}</span>`;
    if (isHashVal) {
      html += `<button class="btn-brut" onclick="openHashcat('${escAttr(r.password)}')" title="Расшифровать хеш перебором (подбор пароля)">⚡ Брутфорс</button>`;
    }
    html += `</div>`;
    if (decrypted) {
      html += `<div class="result-row dehash-row">
        <span class="rr-label" style="color:#00ff88">🔑 Расшифровано</span>
        <span class="rr-pass" onclick="copyText('${escAttr(decrypted)}')" style="color:#00ff88" title="Нажмите, чтобы скопировать">${esc(decrypted)}</span>
      </div>`;
    }
  });
  if (dehash) {
    if (dehash.foundHashes > 0 && dehash.decryptedHashes === 0) {
      html += `<div class="result-row" style="border-top:1px solid var(--border-glass);background:transparent">
        <span style="font-size:11px;color:var(--text-secondary);grid-column:1/-1">Хеши не расшифрованы — используйте вкладку «Брутфорс»</span>
      </div>`;
    } else if (dehash.decryptedHashes > 0) {
      html += `<div class="result-row" style="border-top:1px solid var(--border-glass);background:transparent">
        <span style="font-size:11px;color:var(--accent);grid-column:1/-1">✅ Автоматически расшифровано хешей: ${dehash.decryptedHashes}</span>
      </div>`;
    }
  }
  list.innerHTML = html;
}

// ===== Mass Check =====
let massRunning = false;
let massStop = false;
let massHits = [];

$('#massBtn').addEventListener('click', startMassCheck);
$('#massStopBtn').addEventListener('click', () => { massStop = true; });
$('#massCopyBtn').addEventListener('click', copyMassResults);
$('#massInput').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.ctrlKey) startMassCheck(); });

async function startMassCheck() {
  if (massRunning) return;
  const raw = $('#massInput').value.trim();
  if (!raw) return;
  const nicks = [...new Set(raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean))];
  if (!nicks.length) return;

  massRunning = true;
  massStop = false;
  massHits = [];
  let processed = 0;
  let emptyCount = 0;
  let errCount = 0;
  let totalHits = 0;
  let stopped = false;
  let idx = 0;
  const allResults = [];
  const CONCURRENCY = 25;

  $('#massBtn').classList.add('hidden');
  $('#massStopBtn').classList.remove('hidden');
  $('#massCopyBtn').classList.add('hidden');
  $('#massProgress').classList.remove('hidden');
  $('#massSummary').classList.add('hidden');
  $('#massResults').classList.add('hidden');
  $('#massEmptyState').classList.add('hidden');
  updateMassProgress(0, nicks.length);

  async function worker() {
    while (massRunning && !massStop) {
      const i = idx++;
      if (i >= nicks.length) return;
      const nick = nicks[i];
      try {
        const res = await apiFetch(`${API_URL}/api/check/nickname`, {
          method: 'POST', headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
          },
          body: JSON.stringify({ nickname: nick })
        });
        const data = await res.json();
        if (res.status === 403) {
          massStop = true;
          stopped = true;
          toast('Дневной лимит исчерпан', 3000);
          return;
        }
        if (!res.ok) { errCount++; return; }
        if (data.results && data.results.length) {
          data.results.forEach((r, ridx) => {
            const decrypted = data.dehash?.dehashResults?.[ridx]?.decryptedPassword;
            allResults.push({ nickname: r.nickname, database: r.database, password: r.password, decrypted });
            massHits.push({ nick: r.nickname, pass: r.password });
          });
          totalHits += data.results.length;
        } else {
          emptyCount++;
        }
      } catch {
        errCount++;
        if (authKicked) { massStop = true; stopped = true; }
      } finally {
        processed++;
        updateMassProgress(processed, nicks.length);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, nicks.length) }, () => worker()));

  massRunning = false;
  $('#massBtn').classList.remove('hidden');
  $('#massStopBtn').classList.add('hidden');
  if (massHits.length) $('#massCopyBtn').classList.remove('hidden');

  const checked = processed + (stopped ? 0 : Math.max(0, nicks.length - processed));
  renderMassResults(allResults, totalHits, emptyCount, errCount, nicks.length, checked, stopped);
  refreshStats();
}

function updateMassProgress(processed, total) {
  const pct = total ? Math.round((processed / total) * 100) : 0;
  $('#massProgressFill').style.width = pct + '%';
  $('#massProgressText').textContent = `${processed} / ${total}`;
}

function renderMassResults(results, totalHits, emptyCount, errCount, total, checked, stopped) {
  const container = $('#massResults');
  const output = $('#massOutput');
  const empty = $('#massEmptyState');
  const summary = $('#massSummary');

  const finished = !stopped && checked >= total;
  let s = `<span>Проверено: <b>${checked}</b> / ${total}</span>`;
  s += `<span class="ms-hit">Совпадений: ${totalHits}</span>`;
  s += `<span class="ms-empty">Пусто: ${emptyCount}</span>`;
  if (errCount) s += `<span class="ms-err">Ошибок: ${errCount}</span>`;
  if (stopped) s += `<span class="ms-err">Остановлено — дневной лимит</span>`;
  summary.innerHTML = s;
  summary.classList.remove('hidden');

  if (!results.length) {
    container.classList.add('hidden');
    empty.classList.remove('hidden');
    return;
  }
  container.classList.remove('hidden');
  empty.classList.add('hidden');
  const seen = new Set();
  const lines = [];
  results.forEach(r => {
    const line = `${r.nickname}:${r.password}`;
    if (!seen.has(line)) { seen.add(line); lines.push(line); }
  });
  output.textContent = lines.join('\n');
}

function copyMassResults() {
  const seen = new Set();
  const lines = [];
  massHits.forEach(h => {
    const key = `${h.nick}:${h.pass}`;
    if (!seen.has(key)) { seen.add(key); lines.push(key); }
  });
  if (lines.length) copyText(lines.join('\n'));
}

async function refreshStats() {
  try {
    const res = await apiFetch(`${API_URL}/api/user/me`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (!res.ok) return;
    const data = await res.json();
    $('#statTotalChecks').textContent = data.totalChecks ?? 0;
    const dc = data.dailyChecks ?? 0;
    const dl = data.dailyLimit ?? 500;
    $('#statDailyChecks').textContent = `${dc} / ${dl}`;
    const pct = Math.min((dc / dl) * 100, 100);
    const fill = $('#progressFill');
    fill.style.width = pct + '%';
    if (pct > 80) fill.style.background = 'linear-gradient(90deg, #f59e0b, #ef4444)';
    else fill.style.background = 'linear-gradient(90deg, #22c55e, #f59e0b)';
  } catch {}
}

const validSound = new Audio('valid.m4a');
validSound.loop = true;
const nevalidSound = new Audio('nevalid.mp3');

$('#validBtn').addEventListener('click', validCheck);
$('#validUserInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') validCheck(); });
$('#validPassInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') validCheck(); });

async function validCheck() {
  const username = $('#validUserInput').value.trim();
  const password = $('#validPassInput').value.trim();
  if (!username || !password) return;
  loading($('#validBtn'), true);
  validSound.currentTime = 0;
  validSound.play().catch(() => {});
  try {
    const res = await apiFetch(`${API_URL}/api/valid/check`, {
      method: 'POST', headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    validSound.pause();
    if (res.status === 403) { renderValidResult([{ label: 'Ошибка', value: 'ДНЕВНОЙ ЛИМИТ ИСЧЕРПАН' }], true); return; }
    if (!res.ok) { renderValidResult([{ label: 'Ошибка', value: data.error || 'ПРОВЕРКА НЕ УДАЛАСЬ' }], true); return; }
    const items = [
      { label: 'Статус', value: data.valid ? 'Аккаунт действителен' : 'Аккаунт недействителен' },
      { label: '1FA', value: data.has1fa ? 'Да' : 'Нет' },
      { label: '2FA', value: data.has2fa ? 'Да' : 'Нет' },
      { label: 'Забанен', value: data.banned ? 'Да' : 'Нет' },
    ];
    if (data.banned && data.banReason) items.push({ label: 'Причина бана', value: data.banReason });
    if (data.banned && data.banDuration) items.push({ label: 'Срок бана', value: data.banDuration });
    renderValidResult(items, false, data.valid);
    showValidStats(data.valid);
    if (!data.valid) nevalidSound.play().catch(() => {});
    loadValidHistory();
  } catch {
    validSound.pause();
    renderValidResult([{ label: 'Ошибка', value: 'ОШИБКА СОЕДИНЕНИЯ' }], true);
  } finally {
    loading($('#validBtn'), false);
  }
}

function renderValidResult(items, isError, valid) {
  const container = $('#validResults');
  const list = $('#validResultList');
  const empty = $('#validEmptyState');
  container.classList.remove('hidden'); empty.classList.add('hidden');
  const s = valid ? '✅' : '❌';
  const color = valid ? 'var(--accent)' : 'var(--danger)';
  list.innerHTML = items.map((item, i) => {
    if (i === 0) {
      return `<div class="result-row" style="border-bottom:1px solid var(--border-glass)">
        <span style="font-size:18px;font-weight:700;color:${color};grid-column:1/-1">${s} ${esc(item.value)}</span>
      </div>`;
    }
    return `<div class="result-row">
      <span style="min-width:140px;font-size:12px;font-weight:500;color:var(--text-secondary)">${esc(item.label)}</span>
      <span style="text-align:left;font-size:13px">${esc(item.value)}</span>
    </div>`;
  }).join('');
}

function showValidStats(v) {
  const parts = ($('#statDailyChecks').textContent || '0 / 500').split('/');
  const d = parseInt(parts[0]) || 0;
  const l = parseInt(parts[1]) || 500;
  const c = parseInt($('#statTotalChecks').textContent) || 0;
  if (v) {
    $('#statTotalChecks').textContent = c + 1;
    $('#statDailyChecks').textContent = `${d + 1} / ${l}`;
  }
  const pct = Math.min(((v ? d + 1 : d) / l) * 100, 100);
  const fill = $('#progressFill');
  fill.style.width = pct + '%';
  if (pct > 80) fill.style.background = 'linear-gradient(90deg, #f59e0b, #ef4444)';
  else fill.style.background = 'linear-gradient(90deg, #22c55e, #f59e0b)';
}

// ===== Hashcat =====
$('#hashcatBtn').addEventListener('click', () => hashcatBruteforce($('#hashcatInput').value.trim()));
$('#hashcatInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') hashcatBruteforce($('#hashcatInput').value.trim()); });

function openHashcat(hash) {
  const tab = document.querySelector('.mode-tab[data-mode="hashcat"]');
  if (tab) tab.click();
  $('#hashcatInput').value = hash;
  hashcatBruteforce(hash);
}

async function hashcatBruteforce(hash) {
  if (!hash) return;
  if (hashcatPollTimer) { clearInterval(hashcatPollTimer); hashcatPollTimer = null; }
  loading($('#hashcatBtn'), true);
  $('#hashcatResults').classList.add('hidden');
  $('#hashcatEmptyState').classList.add('hidden');
  try {
    const res = await apiFetch(`${API_URL}/api/hashcat`, {
      method: 'POST', headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ hash })
    });
    const data = await res.json();
    if (!res.ok) { renderHashcatResult(null, data.error || 'ОШИБКА', true); return; }
    if (data.taskId && data.position > 0) {
      renderHashcatResult(null, `В очереди — позиция ${data.position}`, false, 'queued');
      hashcatPollTimer = setInterval(() => pollHashcatResult(data.taskId), 2000);
    } else if (data.taskId) {
      renderHashcatResult(null, 'Обработка…', false, 'processing');
      hashcatPollTimer = setInterval(() => pollHashcatResult(data.taskId), 2000);
    }
  } catch {
    renderHashcatResult(null, 'ОШИБКА СОЕДИНЕНИЯ', true);
  } finally {
    loading($('#hashcatBtn'), false);
  }
}

async function pollHashcatResult(taskId) {
  try {
    const res = await apiFetch(`${API_URL}/api/hashcat/status/${taskId}`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (!res.ok) { clearInterval(hashcatPollTimer); hashcatPollTimer = null; return; }
    const data = await res.json();
    if (data.taskStatus === 'processing' || data.status === 'processing') return;
    clearInterval(hashcatPollTimer); hashcatPollTimer = null;
    if (data.hashcatStatus === 'Cracked' && data.password) {
      renderHashcatResult(data.password, `Расшифровано за ${data.elapsed}с`, false, 'done');
      toast('✅ Хеш расшифрован: ' + data.password, 3000);
    } else if (data.hashcatStatus === 'Exhausted') {
      renderHashcatResult(null, `Пароль не найден — ${data.elapsed}с`, false, 'done');
      toast('❌ Пароль не найден', 2000);
    } else if (data.hashcatStatus === 'Timeout') {
      renderHashcatResult(null, 'Время истекло', false, 'done');
      toast('⏱ Время истекло', 2000);
    } else {
      renderHashcatResult(null, `Статус: ${data.hashcatStatus || data.status}`, false, 'done');
    }
    loadHashcatHistory();
  } catch {
    clearInterval(hashcatPollTimer); hashcatPollTimer = null;
  }
}

function renderHashcatResult(password, message, isError, stage) {
  const container = $('#hashcatResults');
  const list = $('#hashcatResultList');
  const status = $('#hashcatResultStatus');
  container.classList.remove('hidden');
  if (isError) {
    status.textContent = '';
    list.innerHTML = `<div class="result-error">${esc(message)}</div>`;
    return;
  }
  status.textContent = stage || '';
  if (password) {
    list.innerHTML = `
      <div class="result-row">
        <span style="font-size:13px;color:var(--text-secondary)">🔑 Пароль</span>
        <span style="font-size:14px;font-weight:700" onclick="copyText('${escAttr(password)}')" title="Нажмите, чтобы скопировать">${esc(password)}</span>
      </div>
      <div class="result-row" style="border-top:1px solid var(--border-glass)">
        <span style="font-size:12px;color:var(--text-secondary);grid-column:1/-1">${esc(message)}</span>
      </div>`;
  } else {
    list.innerHTML = `<div class="result-row"><span style="grid-column:1/-1;text-align:center">${esc(message)}</span></div>`;
  }
}

// ===== Decoder =====
$('#decodeBtn').addEventListener('click', decodeHash);
$('#decodeInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') decodeHash(); });

async function decodeHash() {
  const input = $('#decodeInput').value.trim();
  if (!input) return;
  loading($('#decodeBtn'), true);
  try {
    const res = await apiFetch(`${API_URL}/api/decode`, {
      method: 'POST', headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ input })
    });
    const data = await res.json();
    if (!res.ok) { renderDecodeResult(null, data.error || 'ОШИБКА', true); return; }
    renderDecodeResult(data, null, false);
  } catch {
    renderDecodeResult(null, 'ОШИБКА СОЕДИНЕНИЯ', true);
  } finally {
    loading($('#decodeBtn'), false);
  }
}

function renderDecodeResult(data, error, isError) {
  const container = $('#decodeResults');
  const list = $('#decodeResultList');
  const empty = $('#decodeEmptyState');
  container.classList.remove('hidden'); empty.classList.add('hidden');
  if (isError) {
    list.innerHTML = `<div class="result-error">${esc(error)}</div>`;
    return;
  }
  let html = '';
  if (data.direction === 'hash-to-pass') {
    html += `<div class="result-row">
      <span style="color:var(--text-secondary);font-size:12px">Хеш</span>
      <span class="rr-pass hash" onclick="copyText('${escAttr(data.hash)}')" title="Нажмите, чтобы скопировать">${esc(data.hash)}</span>
    </div>
    <div class="result-row" style="background:transparent">
      <span style="color:var(--accent);font-size:12px">🔑 Расшифровано</span>
      <span style="color:var(--accent);font-weight:600" onclick="copyText('${escAttr(data.password)}')" title="Нажмите, чтобы скопировать">${esc(data.password)}</span>
    </div>`;
  } else if (data.direction === 'pass-to-hash') {
    html += `<div class="result-row">
      <span style="color:var(--text-secondary);font-size:12px">Пароль</span>
      <span style="font-weight:600" onclick="copyText('${escAttr(data.password)}')" title="Нажмите, чтобы скопировать">${esc(data.password)}</span>
    </div>`;
    if (data.hashes && data.hashes.length > 0) {
      data.hashes.forEach(h => {
        html += `<div class="result-row">
          <span style="color:var(--text-secondary);font-size:12px">Хеш</span>
          <span class="rr-pass hash" onclick="copyText('${escAttr(h)}')" title="Нажмите, чтобы скопировать">${esc(h)}</span>
        </div>`;
      });
    } else {
      html += `<div class="result-row"><span style="color:var(--text-secondary);grid-column:1/-1">Хеши для этого пароля не найдены</span></div>`;
    }
  } else if (data.direction === 'passwords-list') {
    html += `<div class="result-row">
      <span style="color:var(--text-secondary);font-size:12px">Найденные пароли</span>
    </div>`;
    data.passwords.forEach(pw => {
      html += `<div class="result-row">
        <span style="grid-column:1/-1" onclick="copyText('${escAttr(pw)}')" title="Нажмите, чтобы скопировать">${esc(pw)}</span>
      </div>`;
    });
  } else {
    html += `<div class="result-row"><span style="color:var(--text-secondary);grid-column:1/-1">${data.message || 'Ничего не найдено'}</span></div>`;
  }
  list.innerHTML = html;
}

// ===== Valid History =====
let validHistorySort = 'newest';

async function loadValidHistory() {
  const list = $('#validHistoryList');
  if (!list) return;
  list.innerHTML = '<div style="padding:8px;color:var(--text-secondary);font-size:12px">Загрузка…</div>';
  try {
    const res = await apiFetch(`${API_URL}/api/valid/history?sort=${validHistorySort}`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (!res.ok) { list.innerHTML = '<div class="result-error">Не удалось загрузить</div>'; return; }
    const rows = await res.json();
    if (!rows.length) {
      list.innerHTML = '<div style="padding:8px;color:var(--text-secondary);font-size:12px">Истории нет</div>';
      return;
    }
    list.innerHTML = rows.map(r => {
      const badge = r.valid ? '<span style="color:var(--accent)">✅</span>' : '<span style="color:var(--danger)">❌</span>';
      const ban = r.banned ? ' <span style="color:var(--danger);font-size:10px">ЗАБАНЕН</span>' : '';
      return `<div class="result-row" style="gap:2px">
        <span style="min-width:24px;font-size:12px">${badge}</span>
        <span style="font-size:12px;min-width:70px" onclick="copyText('${escAttr(r.username)}')" title="Скопировать">${esc(r.username)}</span>
        <span style="font-size:11px;flex:1" onclick="copyText('${escAttr(r.password)}')" title="Скопировать">${esc(r.password)}</span>
        <span style="font-size:10px;color:var(--text-secondary)">${r.timestamp ? r.timestamp.split(' ')[0] : ''}</span>
        <span style="font-size:10px">${ban}</span>
      </div>`;
    }).join('');
  } catch {
    list.innerHTML = '<div class="result-error">Ошибка соединения</div>';
  }
}

// ===== Hashcat History =====
async function loadHashcatHistory() {
  const list = $('#hashcatHistoryList');
  if (!list) return;
  list.innerHTML = '<div style="padding:8px;color:var(--text-secondary);font-size:12px">Загрузка…</div>';
  try {
    const res = await apiFetch(`${API_URL}/api/hashcat/history`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (!res.ok) { list.innerHTML = '<div class="result-error">Не удалось загрузить</div>'; return; }
    const rows = await res.json();
    if (!rows.length) {
      list.innerHTML = '<div style="padding:8px;color:var(--text-secondary);font-size:12px">Истории нет</div>';
      return;
    }
    list.innerHTML = rows.map(r => {
      const ok = r.status === 'Cracked';
      const badge = ok ? '<span style="color:var(--accent)">✅</span>' : '<span style="color:var(--danger)">❌</span>';
      return `<div class="result-row" style="gap:2px">
        <span style="min-width:24px;font-size:12px">${badge}</span>
        <span class="rr-pass hash" style="font-size:11px;flex:1" onclick="copyText('${escAttr(r.hash_value)}')" title="Скопировать">${esc(r.hash_value)}</span>
        <span style="font-size:11px;color:${ok ? 'var(--accent)' : 'var(--text-secondary)'};min-width:60px" onclick="copyText('${escAttr(r.result)}')" title="Скопировать">${ok ? esc(r.result) : r.status}</span>
        <span style="font-size:10px;color:var(--text-secondary)">${r.timestamp ? r.timestamp.split(' ')[0] : ''}</span>
      </div>`;
    }).join('');
  } catch {
    list.innerHTML = '<div class="result-error">Ошибка соединения</div>';
  }
}

// ===== Auth / Dashboard =====
async function checkAuth() {
  try {
    const res = await apiFetch(`${API_URL}/api/user/me`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (!res.ok) throw new Error();
    const data = await res.json();
    showDashboard(data);
  } catch {
    handleUnauthorized();
  }
}

// Автоматический кик при истечении сессии (1 час) — проверяем раз в 30 сек
setInterval(() => {
  if (!authToken) return;
  apiFetch(`${API_URL}/api/user/me`, {
    headers: { 'Authorization': `Bearer ${authToken}` }
  }).catch(() => {});
}, 30000);

function showDashboard(data) {
  hide('loginPage');
  show('dashboardPage');
  $('#statUserId').textContent = data.userId ?? '—';
  $('#statRegNum').textContent = '#' + (data.registrationNumber ?? '—');
  $('#statTotalChecks').textContent = data.totalChecks ?? 0;
  const dc = data.dailyChecks ?? 0;
  const dl = data.dailyLimit ?? 500;
  $('#statDailyChecks').textContent = `${dc} / ${dl}`;
  const pct = Math.min((dc / dl) * 100, 100);
  const fill = $('#progressFill');
  fill.style.width = '0%';
  setTimeout(() => { fill.style.width = pct + '%'; }, 100);
  if (pct > 80) fill.style.background = 'linear-gradient(90deg, #f59e0b, #ef4444)';
  else fill.style.background = 'linear-gradient(90deg, #22c55e, #f59e0b)';
  loadValidHistory();
  loadHashcatHistory();

  // Переход с парсера: брутфорс хеша из модалки
  const hashParam = new URLSearchParams(location.search).get('hashcat');
  if (hashParam) {
    openHashcat(hashParam);
    history.replaceState(null, '', location.pathname);
  }
}

function showError(msg) {
  const el = $('#errorMessage');
  el.textContent = msg;
  el.classList.remove('hidden');
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
function escAttr(s) {
  return esc(s).replace(/'/g, '&#39;').replace(/"/g, '&quot;');
}

document.addEventListener('keydown', e => {
  if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'C')) || (e.ctrlKey && e.key === 'U')) {
    e.preventDefault();
    nevalidSound.currentTime = 0;
    nevalidSound.play().catch(() => {});
  }
});

setInterval(() => {
  const start = performance.now();
  debugger;
  if (performance.now() - start > 100) {
    nevalidSound.currentTime = 0;
    nevalidSound.play().catch(() => {});
  }
}, 500);
