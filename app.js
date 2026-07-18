const API_URL = window.location.origin;
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
    toast('Copied');
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed'; ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    toast('Copied');
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
      showError(data.error === 'Key expired' ? 'KEY EXPIRED' : 'INVALID KEY');
      return;
    }
    authToken = data.token;
    localStorage.setItem('token', authToken);
    showDashboard(data);
  } catch {
    showError('CONNECTION ERROR');
  } finally {
    loading($('#loginBtn'), false);
  }
}

$('#logoutBtn').addEventListener('click', () => {
  authToken = null;
  localStorage.removeItem('token');
  hide('dashboardPage');
  show('loginPage');
  $('#keyInput').value = '';
});

$$('.mode-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    $$('.mode-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentMode = tab.dataset.mode;
    hide('panelChecker');
    hide('panelValid');
    hide('panelHashcat');
    hide('panelDecoder');
    show('panel' + currentMode.charAt(0).toUpperCase() + currentMode.slice(1));
    if (currentMode === 'valid') loadValidHistory();
    if (currentMode === 'hashcat') loadHashcatHistory();
  });
});

$('#checkBtn').addEventListener('click', checkNickname);
$('#nickInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') checkNickname(); });

async function checkNickname() {
  const nick = $('#nickInput').value.trim();
  if (!nick) return;
  loading($('#checkBtn'), true);
  try {
    const res = await fetch(`${API_URL}/api/check/nickname`, {
      method: 'POST', headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ nickname: nick })
    });
    const data = await res.json();
    if (res.status === 403) { renderResults([], 'DAILY LIMIT EXCEEDED', true, 0, null); return; }
    if (!res.ok) { renderResults([], data.error || 'ERROR', true, 0, null); return; }
    renderResults(data.results, null, false, data.total, data.dehash);
  } catch {
    renderResults([], 'CONNECTION ERROR', true, 0, null);
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
  if (count) count.textContent = `${results.length} match${results.length !== 1 ? 'es' : ''}`;
  let html = '';
  results.forEach((r, idx) => {
    const isHashVal = isHash(r.password);
    const decrypted = dehash?.dehashResults?.[idx]?.decryptedPassword;
    const hashLabel = isHashVal ? 'hash' : 'pass';
    html += `<div class="result-row">
      <span class="rr-nick" onclick="copyText('${escAttr(r.nickname)}')">${esc(r.nickname)}</span>
      <span class="rr-db">${esc(r.database)}</span>
      <span class="rr-pass ${hashLabel}" onclick="copyText('${escAttr(r.password)}')" title="Click to copy">${esc(r.password)}</span>`;
    if (isHashVal) {
      html += `<button class="btn-brut" onclick="openHashcat('${escAttr(r.password)}')" title="Bruteforce this hash"></button>`;
    }
    html += `</div>`;
    if (decrypted) {
      html += `<div class="result-row dehash-row">
        <span class="rr-label" style="color:#a855f7">🔑 Decoded</span>
        <span class="rr-pass" onclick="copyText('${escAttr(decrypted)}')" style="color:#a855f7">${esc(decrypted)}</span>
      </div>`;
    }
  });
  if (dehash) {
    if (dehash.foundHashes > 0 && dehash.decryptedHashes === 0) {
      html += `<div class="result-row" style="border-top:1px solid var(--border-glass);background:transparent">
        <span style="font-size:11px;color:var(--text-secondary);grid-column:1/-1">❌ Hashes not decrypted — use Hashcat tab</span>
      </div>`;
    } else if (dehash.decryptedHashes > 0) {
      html += `<div class="result-row" style="border-top:1px solid var(--border-glass);background:transparent">
        <span style="font-size:11px;color:var(--accent);grid-column:1/-1">✅ Auto-decoded ${dehash.decryptedHashes} hash${dehash.decryptedHashes !== 1 ? 'es' : ''}</span>
      </div>`;
    }
  }
  list.innerHTML = html;
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
    const res = await fetch(`${API_URL}/api/valid/check`, {
      method: 'POST', headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    validSound.pause();
    if (res.status === 403) { renderValidResult([{ label: 'Error', value: 'DAILY LIMIT EXCEEDED' }], true); return; }
    if (!res.ok) { renderValidResult([{ label: 'Error', value: data.error || 'CHECK FAILED' }], true); return; }
    const items = [
      { label: 'Status', value: data.valid ? 'VALID' : 'INVALID' },
      { label: '1FA', value: data.has1fa ? 'Yes' : 'No' },
      { label: '2FA', value: data.has2fa ? 'Yes' : 'No' },
      { label: 'Banned', value: data.banned ? 'Yes' : 'No' },
    ];
    if (data.banned && data.banReason) items.push({ label: 'Ban Reason', value: data.banReason });
    if (data.banned && data.banDuration) items.push({ label: 'Ban Duration', value: data.banDuration });
    renderValidResult(items, false, data.valid);
    showValidStats(data.valid);
    if (!data.valid) nevalidSound.play().catch(() => {});
    loadValidHistory();
  } catch {
    validSound.pause();
    renderValidResult([{ label: 'Error', value: 'CONNECTION ERROR' }], true);
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

let hashcatPollTimer = null;

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
    const res = await fetch(`${API_URL}/api/hashcat`, {
      method: 'POST', headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ hash })
    });
    const data = await res.json();
    if (!res.ok) { renderHashcatResult(null, data.error || 'ERROR', true); return; }
    if (data.taskId && data.position > 0) {
      renderHashcatResult(null, `Queued — position ${data.position}`, false, 'queued');
      hashcatPollTimer = setInterval(() => pollHashcatResult(data.taskId), 2000);
    } else if (data.taskId) {
      renderHashcatResult(null, 'Processing...', false, 'processing');
      hashcatPollTimer = setInterval(() => pollHashcatResult(data.taskId), 2000);
    }
  } catch {
    renderHashcatResult(null, 'CONNECTION ERROR', true);
  } finally {
    loading($('#hashcatBtn'), false);
  }
}

async function pollHashcatResult(taskId) {
  try {
    const res = await fetch(`${API_URL}/api/hashcat/status/${taskId}`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (!res.ok) { clearInterval(hashcatPollTimer); hashcatPollTimer = null; return; }
    const data = await res.json();
    if (data.taskStatus === 'processing' || data.status === 'processing') return;
    clearInterval(hashcatPollTimer); hashcatPollTimer = null;
    if (data.hashcatStatus === 'Cracked' && data.password) {
      renderHashcatResult(data.password, `Cracked in ${data.elapsed}s`, false, 'done');
      toast('✅ Hash cracked: ' + data.password, 3000);
    } else if (data.hashcatStatus === 'Exhausted') {
      renderHashcatResult(null, `Not found — ${data.elapsed}s`, false, 'done');
      toast('❌ Hash not found', 2000);
    } else if (data.hashcatStatus === 'Timeout') {
      renderHashcatResult(null, 'Timeout', false, 'done');
      toast('⏱ Timeout', 2000);
    } else {
      renderHashcatResult(null, `Status: ${data.hashcatStatus || data.status}`, false, 'done');
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
        <span style="font-size:13px;color:var(--text-secondary)">🔑 Password</span>
        <span style="font-size:14px;font-weight:700" onclick="copyText('${escAttr(password)}')">${esc(password)}</span>
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
    const res = await fetch(`${API_URL}/api/decode`, {
      method: 'POST', headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ input })
    });
    const data = await res.json();
    if (!res.ok) { renderDecodeResult(null, data.error || 'ERROR', true); return; }
    renderDecodeResult(data, null, false);
  } catch {
    renderDecodeResult(null, 'CONNECTION ERROR', true);
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
      <span style="color:var(--text-secondary);font-size:12px">Hash</span>
      <span class="rr-pass hash" onclick="copyText('${escAttr(data.hash)}')">${esc(data.hash)}</span>
    </div>
    <div class="result-row" style="background:transparent">
      <span style="color:#a855f7;font-size:12px">🔑 Decoded</span>
      <span style="color:#a855f7;font-weight:600" onclick="copyText('${escAttr(data.password)}')">${esc(data.password)}</span>
    </div>`;
  } else if (data.direction === 'pass-to-hash') {
    html += `<div class="result-row">
      <span style="color:var(--text-secondary);font-size:12px">Password</span>
      <span style="font-weight:600" onclick="copyText('${escAttr(data.password)}')">${esc(data.password)}</span>
    </div>`;
    if (data.hashes && data.hashes.length > 0) {
      data.hashes.forEach(h => {
        html += `<div class="result-row">
          <span style="color:var(--text-secondary);font-size:12px">Hash</span>
          <span class="rr-pass hash" onclick="copyText('${escAttr(h)}')">${esc(h)}</span>
        </div>`;
      });
    } else {
      html += `<div class="result-row"><span style="color:var(--text-secondary);grid-column:1/-1">No hashes found for this password</span></div>`;
    }
  } else if (data.direction === 'passwords-list') {
    html += `<div class="result-row">
      <span style="color:var(--text-secondary);font-size:12px">Found passwords</span>
    </div>`;
    data.passwords.forEach(pw => {
      html += `<div class="result-row">
        <span style="grid-column:1/-1" onclick="copyText('${escAttr(pw)}')">${esc(pw)}</span>
      </div>`;
    });
  } else {
    html += `<div class="result-row"><span style="color:var(--text-secondary);grid-column:1/-1">${data.message || 'No result'}</span></div>`;
  }
  list.innerHTML = html;
}

// ===== Valid History =====
let validHistorySort = 'newest';

async function loadValidHistory() {
  const list = $('#validHistoryList');
  if (!list) return;
  list.innerHTML = '<div style="padding:8px;color:var(--text-secondary);font-size:12px">Loading...</div>';
  try {
    const res = await fetch(`${API_URL}/api/valid/history?sort=${validHistorySort}`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (!res.ok) { list.innerHTML = '<div class="result-error">Failed to load</div>'; return; }
    const rows = await res.json();
    if (!rows.length) {
      list.innerHTML = '<div style="padding:8px;color:var(--text-secondary);font-size:12px">No history</div>';
      return;
    }
    list.innerHTML = rows.map(r => {
      const badge = r.valid ? '<span style="color:var(--accent)">✅</span>' : '<span style="color:var(--danger)">❌</span>';
      const ban = r.banned ? ' <span style="color:var(--danger);font-size:10px">BANNED</span>' : '';
      return `<div class="result-row" style="gap:2px">
        <span style="min-width:24px;font-size:12px">${badge}</span>
        <span style="font-size:12px;min-width:70px" onclick="copyText('${escAttr(r.username)}')">${esc(r.username)}</span>
        <span style="font-size:11px;flex:1" onclick="copyText('${escAttr(r.password)}')">${esc(r.password)}</span>
        <span style="font-size:10px;color:var(--text-secondary)">${r.timestamp ? r.timestamp.split(' ')[0] : ''}</span>
        <span style="font-size:10px">${ban}</span>
      </div>`;
    }).join('');
  } catch {
    list.innerHTML = '<div class="result-error">Connection error</div>';
  }
}

// ===== Hashcat History =====
async function loadHashcatHistory() {
  const list = $('#hashcatHistoryList');
  if (!list) return;
  list.innerHTML = '<div style="padding:8px;color:var(--text-secondary);font-size:12px">Loading...</div>';
  try {
    const res = await fetch(`${API_URL}/api/hashcat/history`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (!res.ok) { list.innerHTML = '<div class="result-error">Failed to load</div>'; return; }
    const rows = await res.json();
    if (!rows.length) {
      list.innerHTML = '<div style="padding:8px;color:var(--text-secondary);font-size:12px">No history</div>';
      return;
    }
    list.innerHTML = rows.map(r => {
      const ok = r.status === 'Cracked';
      const badge = ok ? '<span style="color:var(--accent)">✅</span>' : '<span style="color:var(--danger)">❌</span>';
      return `<div class="result-row" style="gap:2px">
        <span style="min-width:24px;font-size:12px">${badge}</span>
        <span class="rr-pass hash" style="font-size:11px;flex:1" onclick="copyText('${escAttr(r.hash_value)}')">${esc(r.hash_value)}</span>
        <span style="font-size:11px;color:${ok ? 'var(--accent)' : 'var(--text-secondary)'};min-width:60px" onclick="copyText('${escAttr(r.result)}')">${ok ? esc(r.result) : r.status}</span>
        <span style="font-size:10px;color:var(--text-secondary)">${r.timestamp ? r.timestamp.split(' ')[0] : ''}</span>
      </div>`;
    }).join('');
  } catch {
    list.innerHTML = '<div class="result-error">Connection error</div>';
  }
}

// ===== Auth / Dashboard =====
async function checkAuth() {
  try {
    const res = await fetch(`${API_URL}/api/user/me`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (!res.ok) throw new Error();
    const data = await res.json();
    showDashboard(data);
  } catch {
    localStorage.removeItem('token');
    authToken = null;
  }
}

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
