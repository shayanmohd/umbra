/* Shared bits for the drive scripts. */
const KEY = 'umbra.v1';

/* A record shaped exactly as the shipped 1.0.0 store wrote it (git show 610fa8d:web/js/store.js):
   no settings.alerts.minSet, reminders as a flat map, log entries with ctx. The reminder key is
   the one 1.0.0 wrote for the 2026 Geminids: 'sh' + code + round(peak / DAY).
   Times in the tests are checked in UTC: the drive machine may sit in any zone, and Umbra puts
   a place more than three hours from the phone's clock on its own solar clock, UTC+1 for
   Gothenburg, so UTC hours are the same on every machine. */
function v100Record(overrides) {
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
    reminders: { 'shGEM20801': true },
    settings: { clock24: false, red: 'auto', alerts: { on: true, min: 6.5, hour: 20, eclipses: false, digest: true }, seenIntro: true },
    firstRun: 1730000000000
  }, overrides || {});
}

/* A window.Native mock that records what the app hands the shell. */
const NATIVE_MOCK = `
  window.__native = { vibrations: [], saved: [], scheduled: null, cancelled: 0, requested: 0 };
  window.Native = {
    isNative: () => true,
    vibrate: (ms, amp) => { window.__native.vibrations.push([ms, amp]); },
    vibratePattern: () => {}, hasAmplitudeControl: () => true, cancelVibration: () => {},
    keepAwake: () => {},
    saveFile: (name, mime, b64) => { window.__native.saved.push({ name, mime, b64 }); return 'content://downloads/' + name; },
    shareText: () => {}, shareUri: () => {},
    scheduleNotifications: (json) => { window.__native.scheduled = JSON.parse(json); },
    cancelNotifications: () => { window.__native.cancelled++; window.__native.scheduled = []; },
    notificationsAllowed: () => true,
    requestNotificationPermission: () => { window.__native.requested++; }
  };
`;

/* Runs before every document: optional fixed clock, optional Native mock, the record, optional
   safe area insets. Each call replaces the previous one's effect, because the last script to
   run wins on every key it touches. */
let seedSeq = 0, seedScript = null;
async function seed(page, record, opts) {
  opts = opts || {};
  const nonce = 'seed' + (++seedSeq) + '-' + Date.now();
  // Only the latest seed script may run on a new document, or every reload replays them all.
  if (seedScript) { try { await page.removeScriptToEvaluateOnNewDocument(seedScript.identifier); } catch (e) {} }
  seedScript = await page.evaluateOnNewDocument((k, r, native, fixedNow, insets, nonce) => {
    if (fixedNow) { const T = fixedNow; Date.now = () => T; }
    if (native) eval(native); else { try { delete window.Native; } catch (e) {} }
    /* The record is written once per seed. A reload keeps whatever the app wrote since,
       which is the whole point of the reload tests. */
    if (sessionStorage.getItem('umbra.test.seed') !== nonce) {
      sessionStorage.setItem('umbra.test.seed', nonce);
      if (r) localStorage.setItem(k, JSON.stringify(r)); else localStorage.removeItem(k);
    }
    if (insets) {
      // The shell sets these on the root element after the page loads; do the same.
      const apply = () => { document.documentElement.style.setProperty('--sat', insets[0] + 'px'); document.documentElement.style.setProperty('--sab', insets[1] + 'px'); };
      if (document.documentElement) apply();
      document.addEventListener('DOMContentLoaded', apply);
    }
  }, KEY, record, opts.native ? NATIVE_MOCK : '', opts.now || 0, opts.insets || null, nonce);
  await page.reload({ waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts && document.fonts.ready);
}

const raw = page => page.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), KEY);

function assert(cond, msg) { if (!cond) throw new Error('ASSERT: ' + msg); }

/* Two taps inside the double tap window, the way a nervous thumb does it. */
async function doubleTap(page, sel) {
  await page.waitForSelector(sel, { timeout: 8000 });
  await page.evaluate(s => { const el = document.querySelector(s); el.scrollIntoView({ block: 'center' }); }, sel);
  const el = await page.$(sel);
  const box = await el.boundingBox();
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.click(x, y);
  await page.mouse.click(x, y);
}

/* The clock used by the store screenshots: a December evening in Gothenburg. */
const DEC = new Date('2026-12-13T20:40:00+01:00').getTime();
/* Earlier the same day, before the evening alert hour, for the reminder tests. */
const DEC_AFTERNOON = new Date('2026-12-13T16:00:00+01:00').getTime();
/* Gothenburg's clock in December, as the app computes it. */
const GOT_OFF = 3600000;

module.exports = { KEY, v100Record, NATIVE_MOCK, seed, raw, assert, doubleTap, DEC, DEC_AFTERNOON, GOT_OFF };
