/* Upgrade from 1.0.0. The record is shaped exactly as the shipped store wrote it; the new build
   must lose nothing and misread nothing, and the one schema addition (minSet, tunedFor) must
   do the right thing for a bar that was moved by hand and for one that never was. */
const L = require('./review-lib');
const DAY = 86400000;
module.exports = async ({ page, shot, wait, text, click, errors, log }) => {
  const V = s => L.vis(page, s);

  /* 0. The reminder key in the fixture must be the key the feed still produces, or the test
        would be seeding a key no build ever wrote. */
  await L.seed(page, L.v100(), { native: true, now: L.DEC }); await wait(300);
  const keys = await page.evaluate((DEC) => {
    const f = Sky.feed(Store.home(), DEC - 6 * 3600000, 365);
    const gem = f.find(e => e.kind === 'shower' && e.shower.code === 'GEM');
    const ecl = f.find(e => e.kind === 'lunar-eclipse' || e.kind === 'solar-eclipse');
    return { gem: gem.key, ecl: ecl.key, eclTitle: ecl.title, eclAt: ecl.at };
  }, L.DEC);
  log('feed keys:', JSON.stringify(keys));
  L.assert(keys.gem === 'shGEM20801', 'fixture reminder key matches the feed: ' + keys.gem);

  /* 1. A user who moved the slider in 1.0.0 (6.5 is not the old default), with a reminder on the
        Geminids and one on the next eclipse. Loaded at 16:00 on the day of the Geminids night. */
  const rec = L.v100({ reminders: { shGEM20801: true, [keys.ecl]: true } });
  await L.seed(page, rec, { native: true, now: L.DEC_PM }); await wait(1200);
  L.assert(!(await V('#onboard')) && (await V('#app')), 'no onboarding for an upgraded user');
  L.assert((await text('#placeName')) === 'Gothenburg', 'home place named in the top bar');
  let r = await L.raw(page);
  // Everything 1.0.0 wrote is still there, field for field.
  L.assert(JSON.stringify(r.places) === JSON.stringify(rec.places), 'places byte for byte');
  L.assert(JSON.stringify(r.log) === JSON.stringify(rec.log), 'log byte for byte');
  L.assert(JSON.stringify(r.reminders) === JSON.stringify(rec.reminders), 'reminders byte for byte');
  L.assert(r.homeId === 'plabc123' && r.compareId === 'pldef456' && r.firstRun === 1730000000000, 'ids and firstRun');
  L.assert(r.settings.clock24 === false && r.settings.red === 'auto' && r.settings.seenIntro === true, 'display settings');
  const a = r.settings.alerts;
  L.assert(a.on === true && a.min === 6.5 && a.hour === 20 && a.eclipses === false && a.digest === true, 'alert settings: ' + JSON.stringify(a));
  L.assert(a.minSet === true, 'a hand moved bar is marked minSet so calibration never touches it');
  L.assert(a.tunedFor === null || a.tunedFor === undefined, 'no calibration ran on a hand set bar (tunedFor ' + a.tunedFor + ')');
  L.assert(r.upgraded === undefined, 'the upgrade marker is not written to disk');
  // The record was written back once, so the next load is not an upgrade again.
  const written = await page.evaluate(k => localStorage.getItem(k), L.KEY);
  L.assert(/"minSet":true/.test(written), 'upgraded record persisted');

  // Red light "auto" at 16:00 in a Gothenburg December: sunset 15:24, civil dusk 16:15, so not yet.
  L.assert((await page.$eval('html', h => h.dataset.red)) === 'off', 'red auto stays off before civil dusk');
  // Twelve hour clock chosen in 1.0.0.
  L.assert(/am|pm/.test(await text('#stripRow')), 'twelve hour clock honoured: ' + (await text('#stripRow')).slice(0, 50));
  await page.evaluate(() => { Store.set('red', 'off'); App.applyRed(); App.renderTonight(); }); await wait(300);
  await shot('r02-upgraded-tonight');

  // The schedule handed to the shell carries the 1.0.0 Geminids reminder tonight at 20:00 and the eclipse reminder.
  await page.waitForFunction(() => window.__n.sched && window.__n.sched.some(o => /Geminids/.test(o.title)), { timeout: 20000 });
  let sched = await page.evaluate(() => window.__n.sched);
  const gem = sched.find(o => /Geminids/.test(o.title));
  const gemLocal = new Date(gem.at + L.GOT);
  log('Geminids reminder at', gemLocal.toISOString(), 'place clock');
  L.assert(gemLocal.getUTCFullYear() === 2026 && gemLocal.getUTCMonth() === 11 && gemLocal.getUTCDate() === 13 && gemLocal.getUTCHours() === 20 && gemLocal.getUTCMinutes() === 0, 'Geminids reminder lands 13 Dec 20:00 on the place clock');
  L.assert(/asked Umbra to remind you/.test(gem.body), 'reminder body explains itself');
  const ecl = sched.find(o => o.title.indexOf(keys.eclTitle) === 0);
  log('eclipse reminder:', ecl ? new Date(ecl.at + L.GOT).toISOString() : 'none', 'for', keys.eclTitle, 'at', new Date(keys.eclAt).toISOString());
  L.assert(ecl, 'the 1.0.0 eclipse reminder becomes an alert too');
  L.assert(sched.every(o => o.at > L.DEC_PM), 'nothing in the past');
  L.assert(sched.length <= 64, 'at most 64');

  // The UI reads the old data correctly.
  await click('.tab[data-view="places"]'); await wait(600);
  const pt = await text('#placesBody');
  L.assert(/The field at Onnered/.test(pt) && /side by side/i.test(pt) && /Compared/.test(pt), 'compared pair from 1.0.0 renders');
  await shot('r02-upgraded-places');
  await click('.tab[data-view="log"]'); await wait(500);
  const lt = await text('#logBody');
  L.assert(/2 of 27/.test(lt.replace(/\s+/g, ' ')) || /3 of 27/.test(lt.replace(/\s+/g, ' ')), 'life list counts the 1.0.0 ticks: ' + (lt.match(/\d+ of 27/) || [''])[0]);
  L.assert(/Perseids from the field/.test(lt) && /kitchen window/.test(lt), 'both entries listed with their notes');
  await shot('r02-upgraded-log');
  await click('.tab[data-view="events"]');
  await page.waitForFunction(() => document.querySelectorAll('#eventsBody .row').length > 3, { timeout: 30000 }); await wait(300);
  await page.evaluate(() => [...document.querySelectorAll('#eventsBody .row')].find(r => /Geminids/.test(r.textContent)).click()); await wait(500);
  L.assert(/Reminder set/.test(await text('#pageBody')), 'the 1.0.0 reminder shows as set on the event page');
  await shot('r02-upgraded-event');
  await page.evaluate(() => App.back()); await wait(150);
  await click('#setBtn'); await wait(800);
  await page.waitForFunction(() => !/Working out/.test(document.querySelector('#ceilNote').textContent), { timeout: 20000 });
  L.assert((await page.$eval('#minS', e => e.value)) === '6.5', 'slider shows the hand set bar');
  L.assert((await page.$eval('#hourS', e => e.value)) === '20', 'slider shows the 1.0.0 hour');
  await shot('r02-upgraded-settings');
  // A save after the upgrade keeps everything.
  await click('[data-act="toggle"][data-id="clock"]'); await wait(400);
  r = await L.raw(page);
  L.assert(r.settings.clock24 === true && JSON.stringify(r.log) === JSON.stringify(rec.log) && JSON.stringify(r.places) === JSON.stringify(rec.places) && JSON.stringify(r.reminders) === JSON.stringify(rec.reminders), 'a save after upgrade drops nothing');
  await page.evaluate(() => App.back());

  // Same record loaded at 20:40: red auto is on now, and the 20:00 reminder for tonight has passed and is not resurrected.
  await L.seed(page, rec, { native: true, now: L.DEC }); await wait(1500);
  L.assert((await page.$eval('html', h => h.dataset.red)) === 'on', 'red auto honoured after dusk');
  await shot('r02-upgraded-tonight-red');
  await page.waitForFunction(() => window.__n.sched && window.__n.sched.length > 0, { timeout: 20000 });
  sched = await page.evaluate(() => window.__n.sched);
  L.assert(!sched.some(o => /Geminids/.test(o.title) && o.at < L.DEC), 'a passed reminder is not scheduled in the past');
  L.assert(sched.every(o => o.at > L.DEC), 'nothing in the past at 20:40 either');

  /* 2. A user who never touched the slider: 7.5 was the 1.0.0 default. The bar is calibrated to
        the sky once, is not marked hand set, and is left alone on the next open. */
  const untouched = L.v100({ settings: { clock24: true, red: 'off', alerts: { on: true, min: 7.5, hour: 18, eclipses: true, digest: true }, seenIntro: true } });
  await L.seed(page, untouched, { native: true, now: L.DEC });
  await page.waitForFunction(k => { const d = JSON.parse(localStorage.getItem(k)); return !!d.settings.alerts.tunedFor; }, { timeout: 40000 }, L.KEY);
  r = await L.raw(page);
  log('calibrated bar for Gothenburg Bortle 6:', r.settings.alerts.min, 'tunedFor', r.settings.alerts.tunedFor);
  L.assert(r.settings.alerts.minSet === false, 'an untouched bar is not marked hand set');
  L.assert(r.settings.alerts.tunedFor === 'plabc123:6', 'calibration remembered for this place and sky');
  L.assert(r.settings.alerts.min >= 5 && r.settings.alerts.min <= 9.5, 'bar inside the slider range');
  L.assert(JSON.stringify(r.log) === JSON.stringify(untouched.log) && JSON.stringify(r.places) === JSON.stringify(untouched.places), 'calibration write keeps the data');
  const minBefore = r.settings.alerts.min;
  // What does the calibrated bar mean in nights? Count the year's nights at or above it.
  const above = await page.evaluate((min) => {
    let n = 0, seen = {}; const home = Store.home();
    for (let d = 0; d < 365; d++) { const t = Date.now() + d * 86400000; const nt = Sky.tonight(home, t); if (seen[nt.n.t0]) continue; seen[nt.n.t0] = 1; if (nt.score.value >= min) n++; }
    return n;
  }, minBefore);
  log('nights in the coming year scoring at or above', minBefore, ':', above);
  L.assert(above >= 6 && above <= 40, 'the calibrated bar yields a sane number of alert nights a year (' + above + ')');
  await page.reload({ waitUntil: 'networkidle0' }); await wait(1800);
  r = await L.raw(page);
  L.assert(r.settings.alerts.min === minBefore && r.settings.alerts.tunedFor === 'plabc123:6', 'no second calibration on reload');
  // A hand move after calibration sticks, and a new home place does not overwrite it.
  await click('#setBtn'); await wait(800);
  await page.$eval('#minS', e => { e.value = '8'; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); });
  await wait(400);
  r = await L.raw(page);
  L.assert(r.settings.alerts.min === 8 && r.settings.alerts.minSet === true, 'hand move after calibration marks minSet');
  await page.evaluate(() => App.back()); await wait(200);
  await page.evaluate(() => { Store.setHome('pldef456'); App.act('sethome', { id: 'pldef456' }); }); await wait(2500);
  r = await L.raw(page);
  L.assert(r.settings.alerts.min === 8, 'changing home does not move a hand set bar');

  /* 3. Alerts off in 1.0.0 stay off, and the shell is told nothing. */
  const off = L.v100({ settings: { clock24: true, red: 'off', alerts: { on: false, min: 7.5, hour: 18, eclipses: true, digest: true }, seenIntro: true } });
  await L.seed(page, off, { native: true, now: L.DEC }); await wait(1800);
  r = await L.raw(page);
  L.assert(r.settings.alerts.on === false, 'alerts stay off');
  const n = await page.evaluate(() => ({ calls: window.__n.schedCalls, sched: window.__n.sched, requested: window.__n.requested }));
  L.assert(n.calls === 0 && n.requested === 0, 'no schedule and no permission prompt with alerts off: ' + JSON.stringify(n));

  /* 4. Garbage in the record does not take the good data with it. */
  const messy = L.v100({ places: [{ id: 'bad', name: 'Nowhere', lat: 'x', lon: null }, { id: 'ok', name: 'Oslo', lat: 59.91, lon: 10.75, bortle: 7 }], homeId: 'bad', reminders: null, settings: { alerts: { min: 'high' } } });
  await L.seed(page, messy, { native: false, now: L.DEC }); await wait(900);
  L.assert((await text('#placeName')) === 'Oslo', 'an invalid home falls back to the first valid place');
  r = await L.raw(page);
  L.assert(r.log.length === 2 && r.settings.alerts.min === 7.5 && r.settings.alerts.hour === 18 && r.settings.clock24 === true, 'log kept, bad settings replaced by defaults');
  L.assert((await L.count(page, '#tonightBody .part')) === 4, 'Tonight renders from the repaired record');

  /* 5. A file exported by 1.0.0 (its exact shape) imports into this build. */
  await L.seed(page, L.v100({ log: [], compareId: null, places: [L.v100().places[0]] }), { native: true, now: L.DEC }); await wait(900);
  const fs = require('fs'), path = require('path');
  const exp100 = { app: 'Umbra', version: 1, exported: '2026-09-01T10:00:00.000Z', note: 'Written on your device. Nothing was uploaded to produce this file.',
    places: L.v100().places, log: L.v100().log.map(e => ({ ...e, place: e.placeId === 'pldef456' ? 'The field at Onnered' : 'Gothenburg' })),
    lifeList: { peak: { count: 1, first: 1786570800000, last: 1786570800000 }, fire: { count: 1, first: 1786570800000, last: 1786570800000 }, tle: { count: 1, first: 1757273400000, last: 1757273400000 } } };
  const file = path.join(__dirname, 'shots', 'r02-export-100.json'); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(exp100));
  await click('#setBtn'); await wait(700);
  await (await page.$('#importFile')).uploadFile(file); await wait(900);
  const note = await text('#importNote'); log('import of a 1.0.0 export:', note);
  r = await L.raw(page);
  L.assert(/Imported 2 entries and 1 place/.test(note), 'a 1.0.0 export imports: ' + note);
  L.assert(r.log.length === 2 && r.places.length === 2 && r.log.every(e => e.placeId === 'plabc123' || e.placeId === 'pldef456'), 'entries keep their place after import');
  await shot('r02-import-100');
  log('errors:', errors.length);
};
