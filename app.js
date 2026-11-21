import { deriveKey, decryptJSON } from './crypto.js';

const STORE = { pass: 'advent.pass', opened: 'advent.opened', hint: 'advent.hintDismissed' };
const ORDER = [7, 14, 3, 22, 1, 18, 10, 24, 5, 12, 20, 8, 16, 2, 23, 11, 19, 6, 13, 21, 4, 15, 9, 17];
const KINDS = {
  gift: '🎁 A gift',
  activity: '✨ Something to do together',
  note: '💌 A note',
};

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);

// ?reset clears saved passphrase + opened doors (handy while testing).
if (params.has('reset')) {
  localStorage.clear();
  history.replaceState(null, '', location.pathname);
}

// ?today=2026-12-05 previews the calendar as if it were that day.
function getToday() {
  const t = params.get('today');
  if (t && /^\d{4}-\d{2}-\d{2}$/.test(t)) {
    const [y, m, d] = t.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

let bundle = null;   // content.json
let key = null;      // CryptoKey
let meta = null;     // { title, intro, year }
const today = getToday();
const opened = new Set(JSON.parse(localStorage.getItem(STORE.opened) || '[]'));

function unlockDate(day) { return new Date(meta.year, 11, day); }
function isUnlocked(day) { return today >= unlockDate(day); }
function fmtDate(d) { return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long' }); }

function toast(msg, ms = 2200) {
  const el = $('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { el.hidden = true; }, ms);
}

// ---------- Unlock ----------
async function tryUnlock(passphrase) {
  const k = await deriveKey(passphrase, bundle.kdf);
  const m = await decryptJSON(k, bundle.meta); // throws on wrong passphrase
  key = k;
  meta = { year: 2026, ...m };
}

$('unlock-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('unlock-btn');
  const err = $('unlock-error');
  err.hidden = true;
  btn.disabled = true;
  btn.textContent = 'Opening…';
  const pass = $('passphrase').value;
  if (!window.isSecureContext || !crypto.subtle) {
    err.textContent = 'This page must be opened over HTTPS (or localhost) to unlock. Plain http:// links cannot decrypt.';
    err.hidden = false;
    btn.disabled = false;
    btn.textContent = 'Open the calendar';
    return;
  }
  try {
    await tryUnlock(pass);
    localStorage.setItem(STORE.pass, pass);
    showCalendar();
  } catch {
    err.textContent = "Hmm, that's not it. Try again.";
    err.hidden = false;
    $('passphrase').select();
  } finally {
    btn.disabled = false;
    btn.textContent = 'Open the calendar';
  }
});

$('lock-btn').addEventListener('click', () => {
  localStorage.removeItem(STORE.pass);
  key = null; meta = null;
  $('calendar').hidden = true;
  $('unlock').hidden = false;
  $('passphrase').value = '';
});

// ---------- Calendar ----------
function showCalendar() {
  $('unlock').hidden = true;
  $('calendar').hidden = false;
  $('title').textContent = meta.title || 'Advent Calendar';
  $('intro').textContent = meta.intro || '';
  renderStatus();
  renderGrid();
  renderInstallHint();
}

function renderStatus() {
  const first = unlockDate(1);
  const el = $('status');
  if (today < first) {
    const days = Math.round((first - today) / 86400000);
    el.textContent = days === 1 ? 'The first door opens tomorrow!' : `${days} days until the first door opens.`;
    return;
  }
  const todayDay = today.getFullYear() === meta.year && today.getMonth() === 11 ? today.getDate() : null;
  if (todayDay && todayDay <= 24) {
    el.textContent = opened.has(todayDay) ? `Door ${todayDay} is open.` : `Door ${todayDay} is ready for you. 🎄`;
  } else if (todayDay && todayDay >= 25) {
    el.textContent = 'Merry Christmas! 🎄';
  } else {
    el.textContent = 'All doors are open. Thank you for a lovely December.';
  }
}

function renderGrid() {
  const grid = $('grid');
  grid.innerHTML = '';
  const todayDay = today.getFullYear() === meta.year && today.getMonth() === 11 ? today.getDate() : null;
  for (const day of ORDER) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'door';
    b.setAttribute('role', 'listitem');
    b.dataset.day = day;
    const unlocked = isUnlocked(day);
    if (!unlocked) b.classList.add('locked');
    if (opened.has(day)) b.classList.add('open');
    if (day === todayDay && !opened.has(day)) b.classList.add('today');
    b.innerHTML = `<span class="door-num">${day}</span>`;
    if (!unlocked) b.innerHTML += `<span class="door-tag">🔒</span>`;
    else if (opened.has(day)) b.innerHTML += `<span class="door-tag">opened</span>`;
    b.setAttribute('aria-label', `Door ${day}${unlocked ? '' : ', locked until ' + fmtDate(unlockDate(day))}`);
    b.addEventListener('click', () => onDoor(day, b));
    grid.appendChild(b);
  }
}

async function onDoor(day, el) {
  if (!isUnlocked(day)) {
    el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake');
    toast(`Opens on ${fmtDate(unlockDate(day))} 🔒`);
    return;
  }
  const box = bundle.doors.find((d) => d.day === day);
  let content;
  try {
    content = await decryptJSON(key, box);
  } catch {
    toast('Could not open this door. Try locking and unlocking.');
    return;
  }
  opened.add(day);
  localStorage.setItem(STORE.opened, JSON.stringify([...opened]));
  showModal(day, content);
  renderGrid();
  renderStatus();
}

// ---------- Modal ----------
function showModal(day, c) {
  $('m-day').textContent = `${fmtDate(unlockDate(day))} · Door ${day}`;
  $('m-kind').textContent = KINDS[c.type] || '';
  $('m-title').textContent = c.title || '';
  $('m-text').textContent = c.text || '';

  const img = $('m-image');
  if (c.image) { img.src = c.image; img.hidden = false; } else { img.hidden = true; img.removeAttribute('src'); }

  const gallery = $('m-gallery');
  gallery.innerHTML = '';
  if (Array.isArray(c.images) && c.images.length) {
    c.images.forEach((src, i) => {
      const im = document.createElement('img');
      im.src = src; im.alt = `Image ${i + 1}`; im.loading = 'lazy';
      im.addEventListener('click', () => openLightbox(src));
      gallery.appendChild(im);
    });
    const hint = document.createElement('p');
    hint.className = 'gallery-hint';
    hint.textContent = 'Tap a picture to enlarge it, then pinch to zoom.';
    gallery.appendChild(hint);
    gallery.hidden = false;
  } else {
    gallery.hidden = true;
  }

  const codeWrap = $('m-code-wrap');
  if (c.code) { $('m-code').textContent = c.code; codeWrap.hidden = false; } else { codeWrap.hidden = true; }

  const link = $('m-link');
  if (c.link) { link.href = c.link; link.textContent = c.linkText || 'Open link'; link.hidden = false; }
  else { link.hidden = true; }

  $('modal').hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  $('modal').hidden = true;
  document.body.style.overflow = '';
}

document.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', closeModal));

// ---------- Lightbox ----------
function openLightbox(src) {
  $('lightbox-img').src = src;
  $('lightbox').hidden = false;
  $('lightbox').querySelector('.lightbox-scroll').scrollTop = 0;
}
function closeLightbox() {
  $('lightbox').hidden = true;
  $('lightbox-img').removeAttribute('src');
}
document.querySelector('.lightbox-close').addEventListener('click', closeLightbox);
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!$('lightbox').hidden) closeLightbox(); else closeModal();
});

$('m-copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('m-code').textContent);
    toast('Copied!');
  } catch {
    toast('Press and hold the code to copy it.');
  }
});

// ---------- Install hint (iOS Safari, not yet on home screen) ----------
function renderInstallHint() {
  const standalone = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const dismissed = localStorage.getItem(STORE.hint) === '1';
  $('install-hint').hidden = standalone || !isIOS || dismissed;
}
$('install-dismiss').addEventListener('click', () => {
  localStorage.setItem(STORE.hint, '1');
  $('install-hint').hidden = true;
});

// ---------- Boot ----------
async function boot() {
  try {
    const res = await fetch('content.json', { cache: 'no-cache' });
    bundle = await res.json();
  } catch {
    document.body.innerHTML = '<p style="padding:40px;text-align:center">Could not load the calendar. Check your connection and try again.</p>';
    return;
  }
  const saved = localStorage.getItem(STORE.pass);
  if (saved) {
    try { await tryUnlock(saved); showCalendar(); return; } catch { localStorage.removeItem(STORE.pass); }
  }
  $('unlock').hidden = false;
}

boot();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
