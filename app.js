'use strict';

/* ==================================================================
 * CONFIG — replace this with your real iCloud Shortcut share link.
 * ================================================================== */
const SOS_SHORTCUT_URL = 'https://www.icloud.com/shortcuts/0041b144951b424883606d7c70c926f0';

const AUTO_LOCK_MS = 60 * 1000; // re-ask PIN after the app has been in the background this long

/* ================================================================== */
/* Helpers                                                            */
/* ================================================================== */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');

const store = {
  get(key, fallback = null) {
    try {
      const v = localStorage.getItem('safeher.' + key);
      return v === null ? fallback : JSON.parse(v);
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem('safeher.' + key, JSON.stringify(value)); } catch { /* storage full / private mode */ }
  },
  remove(key) {
    try { localStorage.removeItem('safeher.' + key); } catch { /* ignore */ }
  },
};

function localDateTimeValue(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function formatDateTime(value) {
  const d = new Date(value);
  if (isNaN(d)) return value || '';
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
function randomHex(bytes) {
  return [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Object URLs for photos are tracked so they can be released when leaving a screen.
const objectUrls = new Set();
function photoUrl(photo) {
  const url = URL.createObjectURL(new Blob([photo.data], { type: photo.type }));
  objectUrls.add(url);
  return url;
}
function revokePhotoUrls() {
  objectUrls.forEach((u) => URL.revokeObjectURL(u));
  objectUrls.clear();
}

/* ================================================================== */
/* SHA-256 (pure JS so it also works outside HTTPS, e.g. LAN testing) */
/* ================================================================== */
const sha256 = (() => {
  const primes = [];
  for (let n = 2; primes.length < 64; n++) if (primes.every((p) => n % p)) primes.push(n);
  const frac = (x) => ((x - Math.floor(x)) * 2 ** 32) >>> 0;
  const K = primes.map((p) => frac(Math.cbrt(p)));
  const H0 = primes.slice(0, 8).map((p) => frac(Math.sqrt(p)));
  const ror = (x, n) => (x >>> n) | (x << (32 - n));

  return (str) => {
    const bytes = new TextEncoder().encode(str);
    const len = bytes.length;
    const total = ((len + 9 + 63) >> 6) << 6;
    const msg = new Uint8Array(total);
    msg.set(bytes);
    msg[len] = 0x80;
    const dv = new DataView(msg.buffer);
    dv.setUint32(total - 8, Math.floor((len * 8) / 2 ** 32));
    dv.setUint32(total - 4, (len * 8) >>> 0);

    const h = H0.slice();
    const w = new Uint32Array(64);
    for (let off = 0; off < total; off += 64) {
      for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
      for (let i = 16; i < 64; i++) {
        const s0 = ror(w[i - 15], 7) ^ ror(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        const s1 = ror(w[i - 2], 17) ^ ror(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      let [a, b, c, d, e, f, g, hh] = h;
      for (let i = 0; i < 64; i++) {
        const t1 = (hh + (ror(e, 6) ^ ror(e, 11) ^ ror(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
        const t2 = ((ror(a, 2) ^ ror(a, 13) ^ ror(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      [a, b, c, d, e, f, g, hh].forEach((v, i) => { h[i] = (h[i] + v) | 0; });
    }
    return h.map((x) => (x >>> 0).toString(16).padStart(8, '0')).join('');
  };
})();

/* ================================================================== */
/* PIN                                                                */
/* ================================================================== */
const PIN = {
  hash(pin, salt) {
    let h = `safeher:${salt}:${pin}`;
    for (let i = 0; i < 1000; i++) h = sha256(h);
    return h;
  },
  isSet() { return !!store.get('pinHash'); },
  save(pin) {
    const salt = randomHex(16);
    store.set('pinSalt', salt);
    store.set('pinHash', this.hash(pin, salt));
  },
  check(pin) {
    return this.isSet() && this.hash(pin, store.get('pinSalt')) === store.get('pinHash');
  },
};

// PIN setup screen: used on first launch and for Change PIN. Unlocking happens on the calculator.
const Lock = {
  mode: 'set', // set | confirm | verify-old
  entry: '',
  first: '',
  firstRun: false,
  titles: {
    set: 'Set a 4-digit PIN',
    confirm: 'Confirm your PIN',
    'verify-old': 'Enter your current PIN',
  },

  show(mode) {
    Lens.stop(); IR.stop(); closeSheet();
    this.mode = mode;
    this.entry = '';
    this.first = '';
    this.firstRun = !PIN.isSet();
    $('#app').hidden = true;
    $('#calc').hidden = true;
    $('#lock').hidden = false;
    $('#lock-pin').hidden = false;
    $('#lock-done').hidden = true;
    $('#lock-cancel').hidden = this.firstRun;
    $('#lock-spacer').hidden = !this.firstRun;
    this.message(this.firstRun ? 'You will type this PIN on the calculator, then press =, to open the app.' : '');
    this.render();
    this.checkCooldown();
  },
  render() {
    $('#lock-title').textContent = this.titles[this.mode];
    $$('#pin-dots span').forEach((s, i) => s.classList.toggle('filled', i < this.entry.length));
  },
  message(text, isError = false) {
    const el = $('#lock-msg');
    el.textContent = text || ' ';
    el.classList.toggle('error', isError);
  },
  press(key) {
    if (Date.now() < store.get('lockedUntil', 0)) return;
    if (key === 'del') this.entry = this.entry.slice(0, -1);
    else if (this.entry.length < 4) this.entry += key;
    this.render();
    if (this.entry.length === 4) setTimeout(() => this.submit(), 120);
  },
  submit() {
    const pin = this.entry;
    this.entry = '';
    switch (this.mode) {
      case 'set':
        this.first = pin;
        this.mode = 'confirm';
        this.message('Type the same PIN again.');
        break;
      case 'confirm':
        if (pin === this.first) {
          PIN.save(pin);
          if (this.firstRun) {
            $('#lock-pin').hidden = true;
            $('#lock-done').hidden = false;
          } else {
            this.unlock();
          }
        } else {
          this.mode = 'set';
          this.message("PINs didn't match. Try again.", true);
          this.shake();
        }
        break;
      case 'verify-old':
        if (PIN.check(pin)) {
          this.mode = 'set';
          this.message('Now choose a new PIN.');
        } else this.fail();
        break;
    }
    this.render();
  },
  fail() {
    const fails = store.get('pinFails', 0) + 1;
    store.set('pinFails', fails);
    this.shake();
    if (fails >= 5) {
      store.set('lockedUntil', Date.now() + 30000);
      store.set('pinFails', 0);
      this.checkCooldown();
    } else {
      this.message(`Wrong PIN. ${5 - fails} ${5 - fails === 1 ? 'try' : 'tries'} left before a short wait.`, true);
    }
  },
  checkCooldown() {
    const until = store.get('lockedUntil', 0);
    const keys = $$('#keypad button');
    if (Date.now() < until) {
      keys.forEach((b) => { b.disabled = true; });
      this.message(`Too many attempts. Try again in ${Math.ceil((until - Date.now()) / 1000)}s.`, true);
      clearTimeout(this.cooldownTimer);
      this.cooldownTimer = setTimeout(() => this.checkCooldown(), 1000);
    } else {
      keys.forEach((b) => { b.disabled = false; });
      if (until) { store.remove('lockedUntil'); this.message(''); }
    }
  },
  shake() {
    const dots = $('#pin-dots');
    dots.classList.remove('shake');
    void dots.offsetWidth;
    dots.classList.add('shake');
    if (navigator.vibrate) navigator.vibrate(120);
  },
  unlock() {
    store.set('pinFails', 0);
    $('#lock').hidden = true;
    $('#calc').hidden = true;
    $('#app').hidden = false;
    hiddenAt = 0;
    Privacy.covered = null;
  },
};

async function resetEverything() {
  Object.keys(localStorage).filter((k) => k.startsWith('safeher.')).forEach((k) => localStorage.removeItem(k));
  await DB.destroy();
  location.reload();
}

/* ================================================================== */
/* Calculator: the app's front door                                   */
/* ================================================================== */
const Calc = {
  s: null,
  holdTimer: 0,

  reset() {
    // addAcc/addOp hold a pending + or − while a × or ÷ is evaluated first (12 + 7 × 2 = 26).
    this.s = { display: '0', acc: null, op: null, addAcc: null, addOp: null, fresh: true, typed: '' };
    this.render();
  },
  show() {
    Lens.stop(); IR.stop(); closeSheet();
    go('home'); // leave nothing sensitive rendered underneath
    Privacy.covered = null;
    $('#app').hidden = true;
    $('#lock').hidden = true;
    $('#calc').hidden = false;
    this.reset();
  },
  render() {
    const el = $('#calc-display');
    const text = this.pretty(this.s.display);
    el.textContent = text;
    el.style.fontSize = text.length > 11 ? '44px' : text.length > 8 ? '56px' : '';
    $$('#calc-keys .op').forEach((b) => b.classList.toggle('active', this.s.fresh && this.s.op === b.dataset.k));
  },
  // Thousands separators for display only; the raw value stays in s.display.
  pretty(raw) {
    if (!/^-?\d+(\.\d*)?$/.test(raw)) return raw;
    const [int, frac] = raw.split('.');
    const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return frac === undefined ? grouped : `${grouped}.${frac}`;
  },
  // Wrong guesses stay silent so it still looks like normal maths.
  // After 5 wrong PINs in a row, PIN entry is ignored for 30 seconds.
  tryPin(pin) {
    if (Date.now() < store.get('lockedUntil', 0)) return false;
    if (PIN.check(pin)) {
      Lock.unlock();
      return true;
    }
    const fails = store.get('pinFails', 0) + 1;
    if (fails >= 5) {
      store.set('lockedUntil', Date.now() + 30000);
      store.set('pinFails', 0);
    } else {
      store.set('pinFails', fails);
    }
    return false;
  },
  // Hold AC for 5 seconds: forgotten-PIN reset.
  startHold() {
    clearTimeout(this.holdTimer);
    this.holdTimer = setTimeout(() => {
      if (confirm('Erase all data and start again?\n\nThis permanently deletes your PIN and everything saved in this app.')) resetEverything();
    }, 5000);
  },
  cancelHold() { clearTimeout(this.holdTimer); },
  format(n) {
    if (!isFinite(n)) return 'Error';
    if (Math.abs(n) >= 1e9 || (Math.abs(n) < 1e-6 && n !== 0)) return n.toExponential(4);
    return String(parseFloat(n.toPrecision(9)));
  },
  compute(a, op, b) {
    switch (op) {
      case '+': return a + b;
      case '-': return a - b;
      case '*': return a * b;
      case '/': return b === 0 ? NaN : a / b;
    }
    return b;
  },
  press(k) {
    const s = this.s;
    const cur = parseFloat(s.display) || 0;
    if (/^\d$/.test(k)) {
      if (s.fresh || s.display === '0' || s.display === 'Error') { s.display = k; s.fresh = false; }
      else if (s.display.replace(/[-.]/g, '').length < 9) s.display += k;
      s.typed += k;
    } else if (k === '.') {
      if (s.fresh || s.display === 'Error') { s.display = '0.'; s.fresh = false; }
      else if (!s.display.includes('.')) s.display += '.';
      s.typed += '.';
    } else if (k === 'C') {
      this.reset();
      return;
    } else if (k === 'neg') {
      if (s.display !== '0' && s.display !== 'Error') s.display = s.display.startsWith('-') ? s.display.slice(1) : '-' + s.display;
    } else if (k === '%') {
      s.display = this.format(cur / 100);
    } else if (k === '=') {
      // The way in: type the 4-digit PIN, then press =
      if (!s.op && /^\d{4}$/.test(s.typed) && this.tryPin(s.typed)) return;
      if (s.op) {
        let result = this.compute(s.acc, s.op, cur);
        if (s.addOp) result = this.compute(s.addAcc, s.addOp, result);
        s.display = this.format(result);
        s.op = null;
        s.addOp = null;
      }
      s.fresh = true;
      s.typed = '';
    } else { // + - * /
      const high = (o) => o === '*' || o === '/';
      if (s.op && s.fresh) {
        s.op = k; // changed their mind about the operator
      } else {
        if (!s.op) {
          s.acc = cur;
        } else if (high(k) && !high(s.op)) {
          s.addAcc = s.acc;
          s.addOp = s.op;
          s.acc = cur;
        } else {
          s.acc = this.compute(s.acc, s.op, cur);
          if (!high(k) && s.addOp) {
            s.acc = this.compute(s.addAcc, s.addOp, s.acc);
            s.addOp = null;
          }
        }
        s.display = this.format(s.acc);
        s.op = k;
      }
      s.fresh = true;
      s.typed = '';
    }
    this.render();
  },
};

// The moment the app goes to the background the calculator covers the screen, so the
// app switcher shows a calculator. Coming back within AUTO_LOCK_MS restores where you were;
// after that you need the PIN again.
const Privacy = {
  covered: null, // selector of the screen hidden by the cover
  cover() {
    if (!PIN.isSet() || !$('#calc').hidden) return;
    this.covered = $('#app').hidden ? '#lock' : '#app';
    $(this.covered).hidden = true;
    $('#calc').hidden = false;
    Calc.reset();
  },
  restore(expired) {
    if (!this.covered) return;
    if (expired) { Calc.show(); return; }
    $('#calc').hidden = true;
    $(this.covered).hidden = false;
    this.covered = null;
  },
};

/* ================================================================== */
/* Navigation                                                         */
/* ================================================================== */
let currentView = 'home';
let roomAcknowledged = false;

function go(name, { parent } = {}) {
  if (name === 'room') name = !roomAcknowledged ? 'room-warn' : room.type ? 'room-check' : 'room-type';

  Lens.stop();
  IR.stop();
  closeSheet();
  revokePhotoUrls();
  if (currentView === 'report') $('#report-doc').innerHTML = '';
  if (currentView === 'vault-detail') $('#detail-body').innerHTML = '';

  const target = $(`.view[data-view="${name}"]`);
  $$('.view').forEach((v) => { v.hidden = v !== target; });
  if (parent) target.dataset.parent = parent;
  $('#view-title').textContent = target.dataset.title;
  $('#back-btn').hidden = !target.dataset.parent;
  $$('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === target.dataset.tab));
  currentView = name;
  window.scrollTo(0, 0);

  const onEnter = {
    'room-type': renderRoomTypes,
    'room-check': renderRoomCheck,
    vault: () => Vault.renderList(),
    'vault-detail': () => Vault.renderDetail(),
    sos: renderSos,
  };
  if (onEnter[name]) onEnter[name]();
}

/* ================================================================== */
/* Room Safety Check                                                  */
/* ================================================================== */
const SPOTS = {
  smoke: { name: 'Smoke detector', tip: 'Shine your torch at it from different angles. Look for a tiny dark hole or glassy dot that reflects light. Real detectors have vents and a test button, not a lens. Be extra wary of one above the bed or facing the shower.' },
  clock: { name: 'Alarm clock / radio', tip: "Look at the front and sides for a pinhole or dark glossy spot that isn't part of the display. Be wary if it's angled at the bed or has an unexpected USB cable." },
  usb: { name: 'USB charger / adapter', tip: "A charger already plugged in that isn't yours is a classic hiding place. Look for a small black dot or pinhole on its face. Use your own charger instead." },
  socket: { name: 'Wall sockets & switches', tip: "Look for a tiny hole that doesn't line up with the pin slots, or a cover that looks newer, thicker or looser than the others." },
  mirror: { name: 'Mirror', tip: 'Check the frame and edges for pinholes. Then do the fingernail test in the Mirror tab to rule out a two-way mirror.' },
  vent: { name: 'Air vent / AC unit', tip: 'Shine your torch through the slats. Look for a lens, glinting glass or a small light behind the grille.' },
  frame: { name: 'Photo frames & wall art', tip: 'Check the frame and the picture for a small hole or glossy dot, especially if it faces the bed, toilet or shower.' },
  tv: { name: 'TV / set-top box', tip: "Look at the front panel for a lens that isn't the normal remote sensor. Lights on a device that should be off are worth a closer look. If unsure, cover it with a towel." },
  tissue: { name: 'Tissue box', tip: "Look for a hole that doesn't match the tissue opening, or a box with a wire or that feels unusually heavy." },
  shower: { name: 'Shower head & fittings', tip: "Look up at the shower head and wall fittings for a dark dot or lens that doesn't belong. Shine your torch at them." },
  hooks: { name: 'Clothes hooks', tip: 'Some camera hooks look completely normal. Look for a small black dot or glassy lens on the front of each hook.' },
  ceiling: { name: 'Ceiling corners & light fittings', tip: 'Scan corners and around lights with your torch. Look for small holes, gaps or anything glinting back at you.' },
  lamp: { name: 'Lamps & bulbs', tip: 'Check the lamp base and shade, and any bulb that looks bulkier than normal — some "smart bulbs" contain cameras.' },
  decor: { name: 'Plants & decorations', tip: 'Check fake plants, figurines and ornaments for a dark glassy dot, especially anything pointed at the bed.' },
  router: { name: 'Wi-Fi router / smart speaker', tip: "Look for a lens among the lights on the front. Note any device that doesn't seem necessary in the room." },
  gaps: { name: 'Gaps above / below door or partition', tip: 'Check the gaps under the door and above partitions. Make sure nobody could hold a phone there, and watch for shadows or movement.' },
  shelf: { name: 'Shelves & toiletries', tip: 'Check soap dispensers, bottles, bins and anything on shelves for holes or glossy dots facing the toilet or shower.' },
};

const ROOM_TYPES = {
  hotel: { label: 'Hotel room', desc: 'Bedroom and sitting area', spots: ['smoke', 'clock', 'usb', 'socket', 'tv', 'frame', 'mirror', 'vent', 'lamp', 'tissue', 'hooks', 'ceiling', 'decor'] },
  bathroom: { label: 'Bathroom', desc: 'Hotel, rental or public bathroom', spots: ['mirror', 'shower', 'vent', 'hooks', 'ceiling', 'shelf', 'tissue', 'socket', 'smoke'] },
  trial: { label: 'Changing / trial room', desc: 'Shops, gyms, pools', spots: ['mirror', 'hooks', 'ceiling', 'gaps', 'vent', 'socket', 'frame', 'decor'] },
  pg: { label: 'PG or rental', desc: 'Paying guest, hostel or flat', spots: ['smoke', 'socket', 'usb', 'clock', 'router', 'frame', 'vent', 'lamp', 'tv', 'mirror', 'hooks', 'ceiling', 'decor'] },
  airbnb: { label: 'Airbnb / homestay', desc: 'Hosts must disclose any cameras', spots: ['smoke', 'clock', 'usb', 'socket', 'tv', 'router', 'frame', 'decor', 'mirror', 'vent', 'lamp', 'tissue', 'hooks', 'shower', 'ceiling'] },
};

const CHEVRON = '<svg class="chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>';
const X_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

let room = store.get('room', { type: null, results: {}, mirror: null });
const saveRoom = () => store.set('room', room);

function roomProgress(type = room.type) {
  const spots = ROOM_TYPES[type].spots;
  return { done: spots.filter((id) => room.results[id]).length, total: spots.length };
}

function renderRoomTypes() {
  $('#room-type-list').innerHTML = Object.entries(ROOM_TYPES).map(([key, t]) => {
    let note = `${t.spots.length} places to check · ${esc(t.desc)}`;
    if (key === room.type) {
      const p = roomProgress(key);
      note = `In progress: ${p.done}/${p.total} checked`;
    }
    return `<li><button type="button" class="row" data-room="${key}"><span class="row-text"><span class="row-title">${esc(t.label)}</span><span class="row-sub">${note}</span></span>${CHEVRON}</button></li>`;
  }).join('');
}

function chooseRoom(key) {
  if (key !== room.type) room = { type: key, results: {}, mirror: null };
  saveRoom();
  go('room-check');
}

function spotHtml(id) {
  const s = SPOTS[id];
  const st = room.results[id] || '';
  const badge = st ? `<span class="badge ${st}">${st === 'fine' ? 'Looks fine' : 'Suspicious'}</span>` : '';
  return `<li class="spot" data-id="${id}" data-state="${st}">
    <div class="spot-head"><h3>${esc(s.name)}</h3>${badge}</div>
    <p class="tip"><strong>How to check:</strong> ${esc(s.tip)}</p>
    <div class="btn-row">
      <button type="button" class="btn ${st === 'fine' ? 'primary' : ''}" data-act="fine" aria-pressed="${st === 'fine'}">Looks fine</button>
      <button type="button" class="btn ${st === 'sus' ? 'danger' : ''}" data-act="sus" aria-pressed="${st === 'sus'}">Suspicious</button>
    </div>
  </li>`;
}

function renderRoomCheck() {
  const t = ROOM_TYPES[room.type];
  $('#rc-room').textContent = t.label;
  $('#spot-list').innerHTML = t.spots.map(spotHtml).join('');
  renderMirror();
  showPanel('list');
  updateRoomProgress();
}

function renderMirror() {
  $('#mirror-result').textContent = room.mirror ? `Saved: ${room.mirror === 'fine' ? 'gap seen, looks fine' : 'no gap, suspicious'}.` : '';
  const fine = $('[data-mirror="fine"]'), sus = $('[data-mirror="sus"]');
  fine.classList.toggle('primary', room.mirror === 'fine');
  sus.classList.toggle('danger', room.mirror === 'sus');
  fine.setAttribute('aria-pressed', String(room.mirror === 'fine'));
  sus.setAttribute('aria-pressed', String(room.mirror === 'sus'));
}

function updateRoomProgress() {
  const { done, total } = roomProgress();
  $('#rc-progress').textContent = `${done}/${total} checked`;
  $('#rc-bar').style.width = `${(done / total) * 100}%`;
}

function markSpot(id, state) {
  room.results[id] = state;
  saveRoom();
  $(`.spot[data-id="${id}"]`).outerHTML = spotHtml(id);
  updateRoomProgress();
  if (state === 'sus') openAdvice(SPOTS[id].name);
}

function showPanel(name) {
  if (name !== 'lens') Lens.stop();
  if (name !== 'ir') IR.stop();
  $$('#rc-tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.panel === name)));
  $$('.view[data-view="room-check"] .panel').forEach((p) => { p.hidden = p.dataset.panel !== name; });
}

/* ---------- Advice sheet ---------- */
let adviceContext = {};

function openAdvice(spotName = '') {
  adviceContext = { roomType: room.type, spot: spotName };
  const where = [ROOM_TYPES[room.type] && ROOM_TYPES[room.type].label, spotName].filter(Boolean).join(' · ');
  $('#sheet-where').textContent = where;
  $('#sheet').hidden = false;
}
function closeSheet() { $('#sheet').hidden = true; }

function adviceToEvidence() {
  const { roomType, spot } = adviceContext;
  closeSheet();
  const roomLabel = ROOM_TYPES[roomType] ? ROOM_TYPES[roomType].label : '';
  const description = [
    'Possible hidden camera found during a room safety check.',
    roomLabel && `Room type: ${roomLabel}`,
    spot && `Where: ${spot}`,
    `Noted: ${formatDateTime(new Date())}`,
  ].filter(Boolean).join('\n');
  Vault.openForm(null, { type: 'camera', roomType: roomType || '', spot, description });
  // Same tap → open the camera straight away (iOS allows this inside a user gesture).
  $('#photo-camera').click();
}

/* ---------- Cameras ---------- */
function cameraErrorText(err) {
  if (!window.isSecureContext) return 'The camera only works over HTTPS (or localhost). Open the app from its https:// address.';
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return 'This browser does not support camera access.';
  if (err && err.name === 'NotAllowedError') return 'Camera access was blocked. Allow it in Settings → Safari → Camera, then try again.';
  if (err && err.name === 'NotFoundError') return 'No camera was found on this device.';
  return 'Could not start the camera. Close other apps using it and try again.';
}

async function openCamera(facing) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('unsupported');
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } },
  });
}

async function attachStream(video, stream) {
  video.srcObject = stream;
  const playing = video.play().catch(() => {});
  if (!video.videoWidth) await new Promise((r) => video.addEventListener('loadedmetadata', r, { once: true }));
  await playing;
}

// Finds small, very bright, roughly round spots (typical lens glint under a torch).
function detectBrightSpots(img, sensitivity) {
  const { data, width: w, height: h } = img;
  const n = w * h;
  const lum = new Uint8Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) lum[i] = (data[j] * 77 + data[j + 1] * 150 + data[j + 2] * 29) >> 8;

  const threshold = 252 - sensitivity * 4;   // 248 … 212
  const maxArea = 4 + sensitivity * 3;        // pixels at processing resolution
  const minContrast = 90 - sensitivity * 6;   // 84 … 30
  let brightCount = 0;
  for (let i = 0; i < n; i++) if (lum[i] >= threshold) brightCount++;
  if (brightCount > n * 0.08) return { tooBright: true, spots: [] };

  const seen = new Uint8Array(n);
  const stack = [];
  const spots = [];
  for (let i = 0; i < n; i++) {
    if (seen[i] || lum[i] < threshold) continue;
    let area = 0, sx = 0, sy = 0, peak = 0, minX = w, maxX = 0, minY = h, maxY = 0;
    seen[i] = 1;
    stack.push(i);
    while (stack.length) {
      const p = stack.pop();
      const x = p % w, y = (p - x) / w;
      area++; sx += x; sy += y;
      if (lum[p] > peak) peak = lum[p];
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      const nbrs = [x > 0 && p - 1, x < w - 1 && p + 1, y > 0 && p - w, y < h - 1 && p + w];
      for (const q of nbrs) {
        if (q !== false && !seen[q] && lum[q] >= threshold) { seen[q] = 1; stack.push(q); }
      }
    }
    if (area > maxArea) continue;
    const bw = maxX - minX + 1, bh = maxY - minY + 1;
    if (Math.max(bw, bh) > 3 * Math.min(bw, bh) + 1) continue; // streaks/edges, not dots

    // Average brightness of a ring around the blob: a glint must stand out from its surroundings.
    const r = 3;
    let sum = 0, cnt = 0;
    for (let x = minX - r; x <= maxX + r; x++) {
      for (const y of [minY - r, maxY + r]) {
        if (x >= 0 && x < w && y >= 0 && y < h) { sum += lum[y * w + x]; cnt++; }
      }
    }
    for (let y = minY - r + 1; y < maxY + r; y++) {
      for (const x of [minX - r, maxX + r]) {
        if (x >= 0 && x < w && y >= 0 && y < h) { sum += lum[y * w + x]; cnt++; }
      }
    }
    if (!cnt || peak - sum / cnt < minContrast) continue;
    spots.push({ x: sx / area, y: sy / area, r: Math.max(bw, bh) / 2 });
  }
  return { tooBright: false, spots };
}

const Lens = {
  stream: null,
  raf: 0,
  hits: [],
  torchOn: false,
  lastStatus: '',
  proc: document.createElement('canvas'),

  async start() {
    if (this.stream) return;
    this.setStatus('Starting camera…');
    $('#lens-start').disabled = true;
    try {
      this.stream = await openCamera('environment');
    } catch (err) {
      this.setStatus(cameraErrorText(err), true);
      return;
    } finally {
      $('#lens-start').disabled = false;
    }
    if (currentView !== 'room-check' || $('.panel[data-panel="lens"]').hidden) { this.stop(); return; }
    const video = $('#lens-video');
    await attachStream(video, this.stream);

    const canvas = $('#lens-canvas');
    const scale = Math.min(1, 720 / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    this.proc.width = 160;
    this.proc.height = Math.round((160 * video.videoHeight) / video.videoWidth);
    this.ctx = canvas.getContext('2d');
    this.pctx = this.proc.getContext('2d', { willReadFrequently: true });

    const track = this.stream.getVideoTracks()[0];
    const caps = track.getCapabilities ? track.getCapabilities() : {};
    $('#torch-btn').hidden = !caps.torch;
    $('#lens-start').hidden = true;
    $('#lens-stop').hidden = false;
    $('#lens-placeholder').hidden = true;
    this.hits = [];
    this.lastStatus = '';
    this.loop();
  },

  loop() {
    this.raf = requestAnimationFrame(() => this.loop());
    const video = $('#lens-video');
    if (video.readyState < 2) return;
    const { ctx, pctx, proc } = this;
    const canvas = ctx.canvas;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    pctx.drawImage(video, 0, 0, proc.width, proc.height);
    const sensitivity = Number($('#sens').value);
    const { tooBright, spots } = detectBrightSpots(pctx.getImageData(0, 0, proc.width, proc.height), sensitivity);

    // Only keep spots that persist across several frames — cuts out sensor noise and flicker.
    const near = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < 6;
    const next = spots.map((s) => {
      const prev = this.hits.find((hh) => near(hh, s));
      return { ...s, seen: prev ? Math.min(prev.seen + 1, 10) : 1, miss: 0 };
    });
    for (const hh of this.hits) {
      if (hh.seen >= 3 && hh.miss < 6 && !next.some((s) => near(s, hh))) next.push({ ...hh, miss: hh.miss + 1 });
    }
    this.hits = next.slice(0, 40);
    const shown = this.hits.filter((hh) => hh.seen >= 3);

    const k = canvas.width / proc.width;
    for (const s of shown) {
      const radius = Math.max(16, s.r * k + 12);
      ctx.beginPath();
      ctx.arc(s.x * k, s.y * k, radius, 0, Math.PI * 2);
      ctx.lineWidth = 7; ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.stroke();
      ctx.lineWidth = 4; ctx.strokeStyle = '#ff2d2d'; ctx.stroke();
    }

    if (tooBright) this.setStatus('Too much light. Turn off the room lights.');
    else if (shown.length) this.setStatus(`${shown.length} bright spot${shown.length > 1 ? 's' : ''} marked. Check ${shown.length > 1 ? 'those areas' : 'that area'} closely.`, true);
    else this.setStatus('Scanning. No small bright spots right now. Keep moving slowly.');
  },

  setStatus(text, alert = false) {
    if (text === this.lastStatus) return;
    this.lastStatus = text;
    const el = $('#lens-status');
    el.textContent = text;
    el.classList.toggle('alert', alert);
  },

  async toggleTorch() {
    if (!this.stream) return;
    try {
      this.torchOn = !this.torchOn;
      await this.stream.getVideoTracks()[0].applyConstraints({ advanced: [{ torch: this.torchOn }] });
      $('#torch-btn').textContent = this.torchOn ? 'Torch off' : 'Torch on';
    } catch {
      $('#torch-btn').hidden = true;
    }
  },

  stop() {
    cancelAnimationFrame(this.raf);
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.torchOn = false;
    $('#lens-video').srcObject = null;
    $('#lens-start').hidden = false;
    $('#lens-stop').hidden = true;
    $('#torch-btn').hidden = true;
    $('#torch-btn').textContent = 'Torch on';
    $('#lens-placeholder').hidden = false;
    if (this.ctx) this.ctx.clearRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
    this.lastStatus = '';
    $('#lens-status').textContent = '';
  },
};

const IR = {
  stream: null,
  async start() {
    if (this.stream) return;
    const status = $('#ir-status');
    status.textContent = 'Starting front camera…';
    $('#ir-start').disabled = true;
    try {
      this.stream = await openCamera('user');
    } catch (err) {
      status.textContent = cameraErrorText(err);
      return;
    } finally {
      $('#ir-start').disabled = false;
    }
    if (currentView !== 'room-check' || $('.panel[data-panel="ir"]').hidden) { this.stop(); return; }
    await attachStream($('#ir-video'), this.stream);
    status.textContent = 'Look for purple or white glowing dots.';
    $('#ir-start').hidden = true;
    $('#ir-stop').hidden = false;
    $('#ir-placeholder').hidden = true;
  },
  stop() {
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    this.stream = null;
    $('#ir-video').srcObject = null;
    $('#ir-start').hidden = false;
    $('#ir-stop').hidden = true;
    $('#ir-placeholder').hidden = false;
    $('#ir-status').textContent = '';
  },
};

/* ================================================================== */
/* Evidence Vault (IndexedDB, on-device only)                         */
/* ================================================================== */
const DB = {
  name: 'safeher',
  db: null,
  open() {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.name, 1);
      req.onupgradeneeded = () => req.result.createObjectStore('incidents', { keyPath: 'id', autoIncrement: true });
      req.onsuccess = () => { this.db = req.result; resolve(this.db); };
      req.onerror = () => reject(req.error);
    });
  },
  async run(mode, fn) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('incidents', mode);
      const req = fn(tx.objectStore('incidents'));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  },
  all() { return this.run('readonly', (s) => s.getAll()); },
  get(id) { return this.run('readonly', (s) => s.get(id)); },
  put(rec) { return this.run('readwrite', (s) => s.put(rec)); },
  remove(id) { return this.run('readwrite', (s) => s.delete(id)); },
  destroy() {
    if (this.db) { this.db.close(); this.db = null; }
    return new Promise((resolve) => {
      const req = indexedDB.deleteDatabase(this.name);
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
  },
};

const INCIDENT_TYPES = {
  online: 'Online harassment',
  stalking: 'Stalking',
  camera: 'Hidden camera',
  physical: 'Physical harassment',
  other: 'Other',
};

const LOCK_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14v16H5z"/><path d="M9 9h6M9 13h6M9 17h3"/></svg>';

const Vault = {
  editingId: null,
  editingCreatedAt: null,
  photos: [], // { type, name, data: ArrayBuffer } — raw bytes are the most reliable thing to keep in Safari's IndexedDB
  current: null,

  async renderList() {
    let items;
    try {
      items = await DB.all();
    } catch {
      $('#incident-list').innerHTML = '<li class="empty">Storage is unavailable. If you are in Private Browsing, open the app normally.</li>';
      return;
    }
    if (currentView !== 'vault') return;
    items.sort((a, b) => String(b.datetime).localeCompare(String(a.datetime)));
    $('#vault-empty').hidden = items.length > 0;
    $('#export-btn').disabled = items.length === 0;
    $('#incident-list').innerHTML = items.map((rec) => {
      const thumb = rec.photos && rec.photos.length
        ? `<img class="incident-thumb" src="${photoUrl(rec.photos[0])}" alt="">`
        : `<span class="incident-thumb">${LOCK_ICON}</span>`;
      const sub = [formatDateTime(rec.datetime), rec.location].filter(Boolean).map(esc).join(' · ');
      const photos = rec.photos && rec.photos.length ? `${rec.photos.length} photo${rec.photos.length > 1 ? 's' : ''}` : 'No photos';
      return `<li><button type="button" class="incident" data-id="${rec.id}">${thumb}
        <span class="incident-body"><strong>${esc(INCIDENT_TYPES[rec.type] || 'Incident')}</strong><span>${sub}</span><span>${photos}</span></span>
      </button></li>`;
    }).join('');
  },

  openForm(rec = null, prefill = {}) {
    const data = rec || prefill;
    go('vault-form', { parent: rec ? 'vault-detail' : 'vault' });
    $('.view[data-view="vault-form"]').dataset.title = rec ? 'Edit incident' : 'New incident';
    $('#view-title').textContent = rec ? 'Edit incident' : 'New incident';

    this.editingId = rec ? rec.id : null;
    this.editingCreatedAt = rec ? rec.createdAt : null;
    this.photos = rec && rec.photos ? rec.photos.slice() : [];

    const form = $('#incident-form');
    form.reset();
    form.type.value = data.type || 'online';
    form.datetime.value = data.datetime || localDateTimeValue();
    form.location.value = data.location || '';
    form.person.value = data.person || '';
    form.description.value = data.description || '';
    form.roomType.value = data.roomType || '';
    form.spot.value = data.spot || '';
    this.toggleCameraFields();
    this.renderPhotos();
  },

  toggleCameraFields() {
    $('#camera-fields').hidden = $('#f-type').value !== 'camera';
  },

  renderPhotos() {
    $('#photo-grid').innerHTML = this.photos.map((p, i) =>
      `<div class="photo-item"><img src="${photoUrl(p)}" alt="Photo ${i + 1}"><button type="button" data-remove="${i}" aria-label="Remove photo ${i + 1}"><span>${X_ICON}</span></button></div>`
    ).join('');
  },

  async addFiles(input) {
    const files = [...input.files];
    input.value = '';
    for (const f of files) {
      this.photos.push({ type: f.type || 'image/jpeg', name: f.name, data: await f.arrayBuffer() });
    }
    this.renderPhotos();
  },

  async save(e) {
    e.preventDefault();
    const form = $('#incident-form');
    const type = form.type.value;
    const rec = {
      type,
      datetime: form.datetime.value || localDateTimeValue(),
      location: form.location.value.trim(),
      person: form.person.value.trim(),
      description: form.description.value.trim(),
      roomType: type === 'camera' ? form.roomType.value : '',
      spot: type === 'camera' ? form.spot.value.trim() : '',
      photos: this.photos,
      createdAt: this.editingCreatedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    if (this.editingId != null) rec.id = this.editingId;
    try {
      const id = await DB.put(rec);
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
      this.showDetail(id);
    } catch {
      alert('Could not save this incident. Your phone may be low on storage — try fewer or smaller photos.');
    }
  },

  async showDetail(id) {
    const rec = await DB.get(id);
    if (!rec) { go('vault'); return; }
    this.current = rec;
    go('vault-detail');
  },

  renderDetail() {
    const rec = this.current;
    if (!rec) { go('vault'); return; }
    const rows = [
      ['Type', INCIDENT_TYPES[rec.type]],
      ['Date & time', formatDateTime(rec.datetime)],
      ['Location', rec.location],
      ['Room type', ROOM_TYPES[rec.roomType] && ROOM_TYPES[rec.roomType].label],
      ['Where', rec.spot],
      ['Person involved', rec.person],
      ['What happened', rec.description],
    ].filter(([, v]) => v);
    const photos = (rec.photos || []).map((p, i) => `<img src="${photoUrl(p)}" alt="Evidence photo ${i + 1}">`).join('');
    $('#detail-body').innerHTML = `<div class="card detail">
      <dl>${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
      ${photos ? `<div class="detail-photos">${photos}</div>` : ''}
      <p class="muted meta">Saved ${esc(formatDateTime(rec.createdAt))}${rec.updatedAt !== rec.createdAt ? ` · edited ${esc(formatDateTime(rec.updatedAt))}` : ''}</p>
    </div>`;
  },

  async remove() {
    if (!this.current) return;
    if (!confirm('Delete this incident and its photos? This cannot be undone.')) return;
    await DB.remove(this.current.id);
    this.current = null;
    go('vault');
  },

  async exportReport() {
    const items = await DB.all();
    if (!items.length) { alert('There are no incidents to export yet.'); return; }
    items.sort((a, b) => String(a.datetime).localeCompare(String(b.datetime)));
    go('report');
    const sections = items.map((rec, i) => {
      const rows = [
        ['Date & time', formatDateTime(rec.datetime)],
        ['Location', rec.location],
        ['Room type', ROOM_TYPES[rec.roomType] && ROOM_TYPES[rec.roomType].label],
        ['Where', rec.spot],
        ['Person involved', rec.person],
        ['Description', rec.description],
        ['Photos', rec.photos && rec.photos.length ? String(rec.photos.length) : 'None'],
      ].filter(([, v]) => v);
      const photos = (rec.photos || []).map((p, j) => `<img src="${photoUrl(p)}" alt="Incident ${i + 1}, photo ${j + 1}">`).join('');
      return `<section class="report-incident">
        <h2>${i + 1}. ${esc(INCIDENT_TYPES[rec.type] || 'Incident')}</h2>
        <table>${rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</table>
        ${photos ? `<div class="report-photos">${photos}</div>` : ''}
      </section>`;
    }).join('');
    const doc = $('#report-doc');
    doc.innerHTML = `<h1>Incident Report</h1>
      <p class="meta">Generated ${esc(formatDateTime(new Date()))} · ${items.length} incident${items.length > 1 ? 's' : ''}<br>
      Stored only on the owner's device.</p>${sections}`;
    await Promise.all($$('img', doc).map((img) => (img.decode ? img.decode().catch(() => {}) : null)));
    if (currentView === 'report') window.print();
  },
};

/* ================================================================== */
/* SOS Setup                                                          */
/* ================================================================== */
const SOS_CHECKS = [
  ['installed', 'SOS shortcut installed'],
  ['ranonce', 'Ran it once and allowed Location, Messages and Phone access'],
  ['contacts', 'Trusted contacts added to the shortcut'],
  ['received', 'A contact confirmed they got the test message with my location'],
  ['action', 'Action Button runs the shortcut'],
  ['backtap', 'Back Tap runs the shortcut'],
  ['widget', 'Home Screen widget runs the shortcut'],
  ['lockscreen', 'Lock Screen control runs the shortcut'],
  ['siri', 'Siri runs it, including when the phone is locked'],
  ['emergency', 'iPhone Emergency SOS and Medical ID contacts set up'],
];

function renderSos() {
  const done = store.get('sosChecks', {});
  $('#sos-checklist').innerHTML = SOS_CHECKS.map(([id, label]) =>
    `<li><label><input type="checkbox" data-check="${id}" ${done[id] ? 'checked' : ''}><span>${esc(label)}</span></label></li>`
  ).join('');
  updateSosCount();
}
function updateSosCount() {
  const done = store.get('sosChecks', {});
  $('#sos-count').textContent = `${SOS_CHECKS.filter(([id]) => done[id]).length}/${SOS_CHECKS.length}`;
}

/* ================================================================== */
/* Wiring                                                             */
/* ================================================================== */
let hiddenAt = 0;

function init() {
  // Lock screen
  $('#keypad').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-d]');
    if (b) Lock.press(b.dataset.d);
  });
  $('#lock-cancel').addEventListener('click', () => Lock.unlock());
  $('#lock-continue').addEventListener('click', () => Calc.show());
  $('#lock-now').addEventListener('click', () => Calc.show());
  $('#change-pin').addEventListener('click', () => Lock.show('verify-old'));

  // Calculator / quick exit
  $('#quick-exit').addEventListener('click', () => Calc.show());
  $('#calc-keys').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-k]');
    if (b) Calc.press(b.dataset.k);
  });
  const ac = $('#calc-keys [data-k="C"]');
  ac.addEventListener('pointerdown', () => Calc.startHold());
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((t) => ac.addEventListener(t, () => Calc.cancelHold()));

  // Navigation
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-go]');
    if (b) go(b.dataset.go);
  });
  $('#back-btn').addEventListener('click', () => {
    const parent = $(`.view[data-view="${currentView}"]`).dataset.parent;
    if (parent) go(parent);
  });

  // Room check
  $('#room-ack').addEventListener('click', () => { roomAcknowledged = true; go(room.type ? 'room-check' : 'room-type'); });
  $('#room-type-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-room]');
    if (b) chooseRoom(b.dataset.room);
  });
  $('#spot-list').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-act]');
    if (b) markSpot(b.closest('.spot').dataset.id, b.dataset.act);
  });
  $('#rc-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-panel]');
    if (b) showPanel(b.dataset.panel);
  });
  $('#rc-reset').addEventListener('click', () => {
    if (!confirm('Clear all answers for this room and start again?')) return;
    room.results = {};
    room.mirror = null;
    saveRoom();
    renderRoomCheck();
  });
  $$('[data-mirror]').forEach((b) => b.addEventListener('click', () => {
    room.mirror = b.dataset.mirror;
    saveRoom();
    renderMirror();
    if (room.mirror === 'sus') openAdvice('Mirror (possible two-way mirror)');
  }));
  $('#found-btn').addEventListener('click', () => openAdvice(''));

  const sens = $('#sens');
  sens.value = store.get('sensitivity', 5);
  $('#sens-out').textContent = sens.value;
  sens.addEventListener('input', () => { $('#sens-out').textContent = sens.value; store.set('sensitivity', Number(sens.value)); });
  $('#lens-start').addEventListener('click', () => Lens.start());
  $('#lens-stop').addEventListener('click', () => Lens.stop());
  $('#torch-btn').addEventListener('click', () => Lens.toggleTorch());
  $('#ir-start').addEventListener('click', () => IR.start());
  $('#ir-stop').addEventListener('click', () => IR.stop());

  // Advice sheet
  $('#sheet-close').addEventListener('click', closeSheet);
  $('#sheet').addEventListener('click', (e) => { if (e.target.id === 'sheet') closeSheet(); });
  $('#sheet-evidence').addEventListener('click', adviceToEvidence);

  // Vault
  $('#f-roomtype').innerHTML = '<option value="">—</option>' +
    Object.entries(ROOM_TYPES).map(([k, t]) => `<option value="${k}">${esc(t.label)}</option>`).join('');
  $('#add-incident').addEventListener('click', () => Vault.openForm());
  $('#export-btn').addEventListener('click', () => Vault.exportReport());
  $('#print-btn').addEventListener('click', () => window.print());
  $('#incident-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-id]');
    if (b) Vault.showDetail(Number(b.dataset.id));
  });
  $('#f-type').addEventListener('change', () => Vault.toggleCameraFields());
  $('#photo-camera').addEventListener('change', (e) => Vault.addFiles(e.target));
  $('#photo-library').addEventListener('change', (e) => Vault.addFiles(e.target));
  $('#photo-grid').addEventListener('click', (e) => {
    const b = e.target.closest('[data-remove]');
    if (!b) return;
    Vault.photos.splice(Number(b.dataset.remove), 1);
    Vault.renderPhotos();
  });
  $('#incident-form').addEventListener('submit', (e) => Vault.save(e));
  $('#detail-edit').addEventListener('click', () => Vault.current && Vault.openForm(Vault.current));
  $('#detail-delete').addEventListener('click', () => Vault.remove());

  // SOS
  $('#sos-install').href = SOS_SHORTCUT_URL;
  $('#sos-config-warning').hidden = !SOS_SHORTCUT_URL.includes('REPLACE');
  $('#sos-checklist').addEventListener('change', (e) => {
    const id = e.target.dataset.check;
    if (!id) return;
    const done = store.get('sosChecks', {});
    done[id] = e.target.checked;
    store.set('sosChecks', done);
    updateSosCount();
  });

  // Background: cameras off and calculator cover; over AUTO_LOCK_MS away needs the PIN again
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      hiddenAt = Date.now();
      Lens.stop();
      IR.stop();
      Privacy.cover();
    } else {
      Privacy.restore(hiddenAt > 0 && Date.now() - hiddenAt > AUTO_LOCK_MS);
    }
  });

  // Always open on the calculator; first launch sets the PIN first.
  store.remove('disguise'); // no longer used
  go('home');
  if (PIN.isSet()) Calc.show();
  else Lock.show('set');

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline support unavailable (e.g. plain http) */ });
  }
}

init();
