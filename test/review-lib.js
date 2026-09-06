/* The reviewer's own harness for the drive scripts, written independently of test/lib.js.
   Every script runs the page in Gothenburg's own time zone so the app behaves as it would on
   a Swedish phone, with an optional frozen clock, an optional window.Native mock, and optional
   safe area insets stamped on the root element the way the Android shell does it. */
const KEY = 'umbra.v1';

const NATIVE = `
  window.__n = { vib: [], saved: [], sched: null, schedCalls: 0, cancelled: 0, requested: 0 };
  window.Native = {
    isNative: () => true,
    vibrate: (ms, a) => { window.__n.vib.push([ms, a]); },
    vibratePattern: () => {}, hasAmplitudeControl: () => true, cancelVibration: () => {}, keepAwake: () => {},
    saveFile: (name, mime, b64) => { window.__n.saved.push({ name, mime, b64 }); return 'content://downloads/' + name; },
    shareText: () => {}, shareUri: () => {},
    scheduleNotifications: (json) => { window.__n.schedCalls++; window.__n.sched = JSON.parse(json); },
    cancelNotifications: () => { window.__n.cancelled++; window.__n.sched = []; },
    notificationsAllowed: () => true,
    requestNotificationPermission: () => { window.__n.requested++; }
  };`;

let seq = 0, prev = null;
/** Installs the record and the environment for the next document, then reloads once. */
async function seed(page, record, o) {
  o = o || {};
  const nonce = 'rv' + (++seq) + '-' + Date.now();
  if (prev) { try { await page.removeScriptToEvaluateOnNewDocument(prev.identifier); } catch (e) {} }
  await page.emulateTimezone(o.tz || 'Europe/Stockholm');
  prev = await page.evaluateOnNewDocument((k, r, native, now, insets, nonce) => {
    if (now) {
      const Real = Date, T = now;
      class Frozen extends Real { constructor(...a) { if (a.length === 0) super(T); else super(...a); } static now() { return T; } }
      window.Date = Frozen;
    }
    if (native) eval(native);
    if (sessionStorage.getItem('rv.seed') !== nonce) {
      sessionStorage.setItem('rv.seed', nonce);
      if (r) localStorage.setItem(k, JSON.stringify(r)); else localStorage.removeItem(k);
    }
    if (insets) {
      const ap = () => { const s = document.documentElement.style; s.setProperty('--sat', insets[0] + 'px'); s.setProperty('--sab', insets[1] + 'px'); };
      if (document.documentElement) ap();
      document.addEventListener('DOMContentLoaded', ap);
    }
  }, KEY, record, o.native ? NATIVE : '', o.now || 0, o.insets || null, nonce);
  await page.reload({ waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts && document.fonts.ready);
}

const raw = page => page.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), KEY);
const vis = (page, sel) => page.evaluate(s => { const e = document.querySelector(s); return !!e && !e.hidden; }, sel);
const count = (page, sel) => page.$$eval(sel, l => l.length);
function assert(c, m) { if (!c) throw new Error('ASSERT: ' + m); }

/** Two taps as fast as a thumb can manage them. Both events are stamped at input time, the way
    a phone stamps a queued second touch, however long the first handler takes; the second one
    lands on whatever is under the finger once the first has been handled. */
async function dtap(page, sel) {
  await page.waitForSelector(sel, { timeout: 8000 });
  await page.evaluate(s => document.querySelector(s).scrollIntoView({ block: 'center' }), sel);
  await new Promise(r => setTimeout(r, 80));
  const b = await (await page.$(sel)).boundingBox();
  const x = b.x + b.width / 2, y = b.y + b.height / 2;
  await page.evaluate((x, y) => {
    const mk = () => new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y });
    const e1 = mk(), e2 = mk();
    const a = document.elementFromPoint(x, y); if (a) a.dispatchEvent(e1);
    const b = document.elementFromPoint(x, y); if (b) b.dispatchEvent(e2);
  }, x, y);
}

/** Nothing on the page may be wider than the viewport, and no card may clip its own content sideways. */
async function noOverflow(page, where) {
  const bad = await page.evaluate(() => {
    const out = [];
    if (document.documentElement.scrollWidth > innerWidth + 1) out.push('document ' + document.documentElement.scrollWidth);
    for (const c of document.querySelectorAll('.card, .row, .placehead, .btnrow, .sheet-panel, .pad'))
      if (c.offsetParent && c.scrollWidth > c.clientWidth + 1 && !c.classList.contains('filterbar'))
        out.push(c.className + ' ' + c.scrollWidth + '>' + c.clientWidth);
    return out;
  });
  assert(!bad.length, 'horizontal overflow on ' + where + ': ' + bad.join('; '));
}


/* A record shaped exactly as the shipped 1.0.0 store wrote it (git show 610fa8d:web/js/store.js):
   settings.alerts has on, min, hour, eclipses, digest and nothing else; reminders is a flat map
   of event key to true; log entries carry ctx. The Geminids key is 'sh' + code + round(peak / DAY)
   as 1.0.0's feed() wrote it; review-02 checks that value against the live feed before use. */
function v100(over) {
  return Object.assign({
    places: [
      { id: 'plabc123', name: 'Gothenburg', lat: 57.71, lon: 11.97, bortle: 6 },
      { id: 'pldef456', name: 'The field at Onnered', lat: 57.05, lon: 12.65, bortle: 4 }
    ],
    homeId: 'plabc123',
    compareId: 'pldef456',
    log: [
      { id: 'lg1', at: 1786570800000, nightOf: 1786552800000, placeId: 'pldef456', phenomena: ['peak', 'fire'],
        note: 'Perseids from the field. Two fireballs inside ten minutes.', ctx: { score: 8.1, lm: 6.3, moon: 0.11, bortle: 4, top: 'Perseids' } },
      { id: 'lg2', at: 1757273400000, nightOf: 1757255400000, placeId: 'plabc123', phenomena: ['tle'],
        note: 'Total lunar eclipse from the kitchen window.', ctx: { score: 8.9, lm: 4.4, moon: 1.0, bortle: 6, top: 'Total lunar eclipse' } }
    ],
    reminders: { shGEM20801: true },
    settings: { clock24: false, red: 'auto', alerts: { on: true, min: 6.5, hour: 20, eclipses: false, digest: true }, seenIntro: true },
    firstRun: 1730000000000
  }, over || {});
}

const DEC = new Date('2026-12-13T20:40:00+01:00').getTime();
const DEC_PM = new Date('2026-12-13T16:00:00+01:00').getTime();
const GOT = 3600000;   // Gothenburg's clock in December

module.exports = { KEY, NATIVE, v100, seed, raw, vis, count, assert, dtap, noOverflow, DEC, DEC_PM, GOT };
