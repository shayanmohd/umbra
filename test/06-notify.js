/* The notification schedule: recomputed on every open, at most 64, nothing in the past,
   one a day, and the hand set reminders inside it. */
const { seed, assert, v100Record, DEC, GOT_OFF } = require('./lib');
const DAY = 86400000;
module.exports = async ({ page, wait, click, errors, log }) => {
  const check = async (label) => {
    await page.waitForFunction(() => window.__native.scheduled !== null, { timeout: 20000 });
    const s = await page.evaluate(() => window.__native.scheduled);
    const now = await page.evaluate(() => Date.now());
    assert(s.length <= 64, label + ': at most 64, got ' + s.length);
    assert(s.every(o => o.at > now), label + ': nothing in the past');
    assert(s.every(o => typeof o.title === 'string' && o.title.length && typeof o.body === 'string'), label + ': every entry has text');
    assert(new Set(s.map(o => o.id)).size === s.length, label + ': ids unique');
    const days = s.map(o => Math.floor((o.at + GOT_OFF) / DAY));
    assert(new Set(days).size === days.length, label + ': one a day');
    assert(s.every(o => !/[–—]/.test(o.title + o.body)), label + ': no dashes in notification copy');
    assert(s.every(o => !/!/.test(o.title + o.body)), label + ': no exclamation marks');
    for (const o of s) {
      const h = new Date(o.at + GOT_OFF).getUTCHours();
      if (o.title.indexOf('in 45 minutes') < 0) assert(h >= 12 && h <= 22, label + ': evening alerts only fire between 12 and 22, got ' + h + ' for ' + o.title);
    }
    log(label + ':', s.length, 'scheduled;', s.slice(0, 4).map(o => new Date(o.at + GOT_OFF).toISOString().slice(0, 16) + ' ' + o.title).join(' | '));
    return s;
  };

  // Alerts on, eclipses off, digest on, a Geminids reminder, from 1.0.0, on the afternoon
  // before the reminder is due.
  await seed(page, v100Record(), { native: true, now: DEC - 4.5 * 3600000 });
  const s1 = await check('cold start');
  assert(s1.some(o => /Geminids/.test(o.title)), 'the reminder is scheduled');

  // Everything on, a low bar: the busiest plausible schedule.
  await seed(page, v100Record({ settings: { clock24: true, red: 'off', alerts: { on: true, min: 5, minSet: true, hour: 18, eclipses: true, digest: true }, seenIntro: true } }), { native: true, now: DEC });
  const s2 = await check('everything on, bar 5');
  assert(s2.length >= 3, 'a low bar produces alerts: ' + s2.length);
  // The digest only goes out when the week holds something, and a good night on the Sunday
  // itself outranks it, so from a Bortle 6 sky in a Swedish winter it is rare. Over a year of
  // Sundays there must be some.
  const digestAt = await page.evaluate(() => {
    const real = Date.now, out = [];
    try {
      for (let w = 0; w < 52; w++) {
        const T = real() - 3 * 86400000 + w * 7 * 86400000;
        Date.now = () => T;
        const d = Notify.plan().find(o => o.kind === 'digest');
        if (d) out.push(new Date(d.at).toISOString().slice(0, 16) + ' ' + d.body.slice(0, 80));
      }
    } finally { Date.now = real; }
    return out;
  });
  log('digests found from later Sundays:', digestAt.length, digestAt.slice(0, 2).join(' | '));
  assert(digestAt.length > 0, 'a Sunday digest exists somewhere in the coming year');
  assert(digestAt.every(d => !/[!\u2013\u2014]/.test(d)), 'digest copy has no dashes or exclamation marks');

  // Alerts off: the schedule is cancelled, not left stale.
  await seed(page, v100Record({ settings: { clock24: true, red: 'off', alerts: { on: false, min: 5, hour: 18, eclipses: true, digest: true }, seenIntro: true } }), { native: true, now: DEC });
  await wait(1500);
  const off = await page.evaluate(() => ({ s: window.__native.scheduled, c: window.__native.cancelled }));
  assert(!off.s || off.s.length === 0, 'nothing scheduled with alerts off');
  assert(off.c >= 1, 'the shell was told to cancel');

  // Turning alerts on from Settings asks for permission and schedules.
  await click('#setBtn');
  await wait(700);
  await click('[data-act="toggle"][data-id="alerts-on"]');
  await wait(1500);
  const on = await page.evaluate(() => ({ s: window.__native.scheduled, r: window.__native.requested }));
  assert(on.r >= 1, 'permission requested');
  assert(on.s && on.s.length > 0, 'schedule sent after switching on');
  await check('after switching on');

  // A place near the date line, with the phone's clock far away: times stay on the place's clock.
  await seed(page, v100Record({ places: [{ id: 'pl1', name: 'Auckland', lat: -36.85, lon: 174.76, bortle: 5 }], homeId: 'pl1', compareId: null, reminders: {}, settings: { clock24: true, red: 'off', alerts: { on: true, min: 5, minSet: true, hour: 19, eclipses: true, digest: true }, seenIntro: true } }), { native: true, now: DEC });
  await page.waitForFunction(() => window.__native.scheduled !== null, { timeout: 20000 });
  const s3 = await page.evaluate(() => window.__native.scheduled);
  const now = await page.evaluate(() => Date.now());
  assert(s3.length <= 64 && s3.every(o => o.at > now), 'far place: sane schedule');
  // 19:00 in Auckland is 07:00 UTC; the device is in the CET winter, so it fires at 08:00 device time.
  const firstNight = s3.find(o => /scores/.test(o.title));
  if (firstNight) {
    const utcH = new Date(firstNight.at).getUTCHours();
    log('Auckland evening alert lands at', utcH, 'UTC');
    assert(utcH === 7, 'far place alert lands on its own 19:00, got ' + utcH + ' UTC');
  }

  // The plan is deterministic: two syncs in a row hand the shell the same list.
  await page.evaluate(() => window.App.onResume());
  await wait(1200);
  const s4 = await page.evaluate(() => window.__native.scheduled);
  assert(JSON.stringify(s3) === JSON.stringify(s4), 'resume recomputes the same schedule');
  log('errors:', errors.length);
};
