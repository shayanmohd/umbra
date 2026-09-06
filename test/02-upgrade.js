/* Upgrade from 1.0.0: a record written by the shipped store loads into this build with nothing
   lost or misread, and the migration for the alert bar does the right thing both ways. */
const { seed, raw, assert, v100Record, DEC, DEC_AFTERNOON, GOT_OFF } = require('./lib');
module.exports = async ({ page, shot, wait, text, click, errors, log }) => {

  /* 1. A user who moved the slider in 1.0.0 (min 6.5 is not the old default). */
  await seed(page, v100Record(), { native: true, now: DEC });
  await wait(1200);
  assert(await page.$eval('#onboard', e => e.hidden), 'no onboarding for an upgraded user');
  assert((await text('#placeName')) === 'Gothenburg', 'home place survives');
  let r = await raw(page);
  assert(r.places.length === 2 && r.places[1].name === 'The field at Onnered', 'both places survive');
  assert(r.homeId === 'plabc123' && r.compareId === 'pldef456', 'home and compare ids survive');
  assert(r.log.length === 2 && r.log[0].ctx.top === 'Perseids', 'log entries and their context survive');
  assert(r.reminders.shGEM20801 === true, 'reminder flag survives');
  assert(r.settings.clock24 === false && r.settings.red === 'auto', 'display settings survive');
  assert(r.settings.alerts.on === true && r.settings.alerts.hour === 20 && r.settings.alerts.eclipses === false, 'alert settings survive');
  assert(r.settings.alerts.min === 6.5, 'a hand set bar is kept at 6.5');
  assert(r.settings.alerts.minSet === true, 'a bar that differs from the 1.0.0 default is marked as hand set');
  assert(r.firstRun === 1730000000000, 'firstRun survives');
  await shot('02-upgraded-tonight');

  // 12 hour clock was chosen in 1.0.0: the strip row must show am/pm.
  const strip = await text('#stripRow');
  assert(/am|pm/.test(strip), 'twelve hour clock honoured: ' + strip.slice(0, 60));

  // The compared place still renders side by side.
  await click('.tab[data-view="places"]');
  await wait(600);
  assert(/side by side/i.test(await text('#placesBody')), 'comparison card renders for the upgraded pair');
  await shot('02-upgraded-places');

  // The log knows both entries and the life list ticks them.
  await click('.tab[data-view="log"]');
  await wait(400);
  const logTxt = await text('#logBody');
  assert(/Total lunar eclipse/.test(logTxt) && /fireball/i.test(logTxt), 'life list ticks from the old log');
  await shot('02-upgraded-log');

  // At 20:40 the 20:00 alert for tonight has passed, so the schedule holds nothing in the past.
  await page.waitForFunction(() => window.__native.scheduled && window.__native.scheduled.length > 0, { timeout: 15000 });
  let sched = await page.evaluate(() => window.__native.scheduled);
  assert(sched.every(o => o.at > DEC), 'nothing scheduled in the past');
  assert(!sched.some(o => /Geminids/.test(o.title)), 'a reminder whose hour has passed is not resurrected');

  // Touching settings writes the record back with nothing dropped.
  await click('#setBtn');
  await wait(700);
  await click('[data-act="toggle"][data-id="clock"]');
  await wait(400);
  r = await raw(page);
  assert(r.settings.clock24 === true && r.log.length === 2 && r.places.length === 2 && r.reminders.shGEM20801, 'a save after upgrade keeps everything');
  await shot('02-upgraded-settings');

  // Earlier the same afternoon, the 1.0.0 reminder is a real scheduled alert on the right evening.
  await seed(page, v100Record(), { native: true, now: DEC_AFTERNOON });
  await page.waitForFunction(() => window.__native.scheduled && window.__native.scheduled.some(o => /Geminids/.test(o.title)), { timeout: 15000 });
  sched = await page.evaluate(() => window.__native.scheduled);
  const rem = sched.find(o => /Geminids/.test(o.title));
  const remLocal = new Date(rem.at + GOT_OFF);
  log('Geminids reminder fires', remLocal.toISOString().replace('T', ' ').slice(0, 16), 'on the place clock');
  assert(remLocal.getUTCHours() === 20 && remLocal.getUTCMinutes() === 0, 'reminder lands at the chosen hour (20:00), got ' + remLocal.getUTCHours());
  assert(rem.at > DEC_AFTERNOON, 'reminder is in the future');
  // The Geminids best night for Gothenburg is the night of 13 December: the same evening.
  assert(remLocal.getUTCDate() === 13 && remLocal.getUTCMonth() === 11, 'reminder lands on the best night, not the peak instant: got ' + remLocal.toISOString());
  assert(/asked Umbra to remind you/.test(rem.body), 'reminder body says why it fired');

  /* 2. A user who never touched the slider (min 7.5 was the 1.0.0 default) gets the bar
        calibrated to their sky, once, and it is not treated as hand set. */
  const untouched = v100Record({ settings: { clock24: true, red: 'off', alerts: { on: true, min: 7.5, hour: 18, eclipses: true, digest: true }, seenIntro: true } });
  await seed(page, untouched, { native: true, now: DEC });
  await page.waitForFunction(k => { const d = JSON.parse(localStorage.getItem(k)); return d.settings.alerts.tunedFor; }, { timeout: 30000 }, 'umbra.v1');
  r = await raw(page);
  log('calibrated bar for Gothenburg:', r.settings.alerts.min, 'tunedFor', r.settings.alerts.tunedFor);
  assert(r.settings.alerts.minSet === false, 'a default bar is not marked as hand set');
  assert(r.settings.alerts.min >= 5 && r.settings.alerts.min <= 9.5, 'calibrated bar is inside the slider range');
  assert(r.settings.alerts.tunedFor === 'plabc123:6', 'calibration remembered for this place and sky');
  const minBefore = r.settings.alerts.min;
  // A reload does not recalibrate (same place, same sky).
  await page.reload({ waitUntil: 'networkidle0' });
  await wait(1500);
  r = await raw(page);
  assert(r.settings.alerts.min === minBefore && r.settings.alerts.tunedFor === 'plabc123:6', 'no second calibration on reload');

  /* 3. Garbage in the record does not take the good data with it. */
  const messy = v100Record({ places: [{ id: 'bad', name: 'Nowhere', lat: 'x', lon: null }, { id: 'ok', name: 'Oslo', lat: 59.91, lon: 10.75, bortle: 7 }], homeId: 'bad' });
  await seed(page, messy, { native: false, now: DEC });
  await wait(800);
  assert((await text('#placeName')) === 'Oslo', 'an invalid home falls back to the first valid place');
  r = await raw(page);
  assert(r.log.length === 2, 'log kept through a messy places array');

  log('errors:', errors.length);
};
