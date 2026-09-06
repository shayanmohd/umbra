/* The alert rule is the app's whole promise, and the listing, the onboarding and the method
   page all state it. This checks the schedule the shell is actually handed against every
   clause: at most one a day, nothing in the past, at most 64, nothing at night except an
   eclipse you can see, no penumbral eclipse, and a countdown that says how long is really
   left rather than a fixed three quarters of an hour. */
const L = require('./review-lib');
const MIN = 60000, DAY = 86400000;

module.exports = async ({ page, wait, text, click, errors, log }) => {
  const alerts = over => Object.assign({ on: true, min: 5, minSet: true, hour: 18, eclipses: true, digest: true }, over || {});
  const rec = o => L.v100({ reminders: {}, settings: { clock24: true, red: 'off', alerts: alerts(o), seenIntro: true } });

  /* Find a real eclipse that is visible from Gothenburg, and its local first contact. */
  await L.seed(page, rec(), { native: true, now: L.DEC_PM }); await wait(1000);
  const ecl = await page.evaluate(now => {
    const home = Store.home();
    for (const e of Astro.eclipses(Astro.jdFromMs(now), Astro.jdFromMs(now + 400 * 86400000), home.lat, home.lon)) {
      if (!e.local || e.local.type === 'Penumbral') continue;
      return { kind: e.kind, type: e.local.type,
               start: e.local.start ? Astro.msFromJd(e.local.start) : Astro.msFromJd(e.jd),
               at: Astro.msFromJd(e.jd) };
    }
    return null;
  }, L.DEC_PM);
  L.assert(ecl, 'a visible eclipse exists in the window to test against');
  log('first visible eclipse:', ecl.kind, ecl.type, 'first contact', new Date(ecl.start).toISOString());

  /* 1. The ordinary schedule. */
  await L.seed(page, rec(), { native: true, now: L.DEC_PM }); await wait(1400);
  await page.waitForFunction(() => window.__n.sched && window.__n.sched.length > 0, { timeout: 25000 });
  let s = await page.evaluate(() => window.__n.sched);
  log('bar at 5:', s.length, 'entries,', new Date(s[0].at).toISOString(), 'to', new Date(s[s.length - 1].at).toISOString());
  L.assert(s.length <= 64, 'at most 64 entries');
  L.assert(s.every(o => o.at > L.DEC_PM), 'nothing in the past');
  L.assert(new Set(s.map(o => Math.floor((o.at + L.GOT) / DAY))).size === s.length, 'at most one a day');
  L.assert(s.every(o => Number.isInteger(o.id) && o.title && o.body), 'the shape the shell expects');
  const night = s.filter(o => { const h = new Date(o.at + L.GOT).getUTCHours(); return h < 7 || h >= 23; });
  log('entries outside 07:00 to 23:00:', night.map(o => o.title + ' @ ' + new Date(o.at + L.GOT).toISOString().slice(11, 16)));
  L.assert(night.every(o => /eclipse/i.test(o.title)), 'only an eclipse warning is allowed outside the evening');
  L.assert(!/[—–!]/.test(s.map(o => o.title + o.body).join('')), 'no dashes or exclamation marks in notification copy');

  /* 2. Eclipses switched off: nothing about an eclipse survives, and nothing wakes anybody. */
  await L.seed(page, rec({ eclipses: false }), { native: true, now: L.DEC_PM }); await wait(1400);
  await page.waitForFunction(() => window.__n.sched && window.__n.sched.length > 0, { timeout: 25000 });
  s = await page.evaluate(() => window.__n.sched);
  L.assert(!s.some(o => /eclipse/i.test(o.title)), 'the Eclipses switch removes every eclipse alert');
  L.assert(s.every(o => { const h = new Date(o.at + L.GOT).getUTCHours(); return h >= 7 && h < 23; }),
    'with eclipses off nothing at all is scheduled outside the evening');

  /* 3. A penumbral eclipse belongs in the calendar and never in a notification. */
  const pen = await page.evaluate(now => {
    const home = Store.home();
    for (const e of Astro.eclipses(Astro.jdFromMs(now), Astro.jdFromMs(now + 900 * 86400000), home.lat, home.lon))
      if (e.local && e.local.type === 'Penumbral') return { at: Astro.msFromJd(e.jd) };
    return null;
  }, L.DEC_PM);
  if (pen) {
    const before = pen.at - 3 * 3600000;
    await L.seed(page, rec(), { native: true, now: before }); await wait(1600);
    await page.waitForFunction(() => window.__n.sched, { timeout: 25000 });
    s = await page.evaluate(() => window.__n.sched);
    const soon = s.filter(o => o.at < pen.at && o.at > pen.at - 4 * 3600000);
    log('penumbral eclipse at', new Date(pen.at).toISOString(), 'alerts in the four hours before it:', JSON.stringify(soon.map(o => o.title)));
    L.assert(!soon.some(o => /eclipse from/i.test(o.title)), 'no warning fires for a penumbral eclipse');
    // It is still on the calendar.
    await click('.tab[data-view="events"]');
    await page.waitForFunction(() => document.querySelectorAll('#eventsBody .row').length > 3, { timeout: 30000 });
    await click('[data-act="filter"][data-id="eclipse"]'); await wait(400);
    L.assert(/Penumbral/i.test(await text('#eventsBody')), 'the penumbral eclipse is still listed under Eclipses');
  } else {
    log('no penumbral eclipse visible from here inside the window; skipped');
  }

  /* 4. Opened twenty minutes before first contact, the countdown tells the truth. */
  await L.seed(page, rec(), { native: true, now: ecl.start - 20 * MIN }); await wait(1600);
  await page.waitForFunction(() => window.__n.sched, { timeout: 25000 });
  s = await page.evaluate(() => window.__n.sched);
  const warn = s.find(o => /eclipse from/i.test(o.title));
  log('opened 20 minutes before first contact:', warn ? warn.title + ' @ ' + new Date(warn.at).toISOString() : 'none');
  L.assert(warn, 'the warning is still scheduled');
  const said = +(warn.title.match(/in (\d+) minute/) || [])[1];
  const real = Math.round((ecl.start - warn.at) / MIN);
  L.assert(said === real && said <= 20, 'the title says the lead it actually gets (' + said + ' vs ' + real + ')');
  L.assert(warn.at > ecl.start - 21 * MIN && warn.at < ecl.start, 'it fires before first contact');

  /* 5. Opened after it has begun, no countdown is scheduled at all. */
  await L.seed(page, rec(), { native: true, now: ecl.start + 10 * MIN }); await wait(1600);
  await page.waitForFunction(() => window.__n.sched, { timeout: 25000 });
  s = await page.evaluate(() => window.__n.sched);
  const late = s.find(o => /eclipse from/i.test(o.title) && o.at < ecl.at + 6 * 3600000);
  log('opened 10 minutes after first contact:', late ? late.title : 'no warning, as it should be');
  L.assert(!late, 'no eclipse countdown once the eclipse has started');

  /* 6. Alerts off means an empty schedule and a cancel, with a reminder set by hand. */
  await L.seed(page, L.v100({ reminders: { shGEM20801: true },
    settings: { clock24: true, red: 'off', alerts: alerts({ on: false }), seenIntro: true } }),
    { native: true, now: L.DEC_PM }); await wait(1600);
  const st = await page.evaluate(() => ({ sched: window.__n.sched, cancelled: window.__n.cancelled }));
  log('alerts off:', JSON.stringify(st));
  L.assert(!st.sched || !st.sched.length, 'nothing is scheduled with alerts off');
  log('errors:', errors.length);
};
