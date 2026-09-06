/* First run at today's real date: onboarding with its refusals, every screen, real data on each,
   reload, and a fresh tab. Zero page errors across the whole run. */
const L = require('./review-lib');
module.exports = async ({ page, shot, wait, text, click, type, errors, log, browser }) => {
  await L.seed(page, null, { native: true });
  await wait(300);
  L.assert(await L.vis(page, '#onboard'), 'onboarding on first run');
  L.assert(await page.$('#onboardBody .ecl'), 'the eclipse mark is on the first screen');
  await shot('r01-onboard');

  await click('[data-act="ob-next"]'); await wait(250);
  L.assert(await page.$('#onboardBody .err'), 'empty continue refused inline');
  await shot('r01-onboard-err');
  await page.$eval('#obLat', e => e.value = '95'); await page.$eval('#obLon', e => e.value = '10');
  await click('[data-act="ob-next"]'); await wait(200);
  L.assert(await L.vis(page, '#onboard') && (await L.count(page, '#onboardBody .err')) === 1, 'latitude 95 refused, one error box');
  await type('#obCity', 'goth'); await wait(200);
  L.assert((await L.count(page, '#obHits .pick')) >= 1, 'city search finds Gothenburg');
  await click('#obHits .pick'); await wait(150);
  L.assert((await page.$eval('#obLat', e => e.value)) !== '', 'city pick fills coordinates');
  L.assert(!(await page.$('#onboardBody .err')), 'error cleared by the pick');
  await click('[data-act="ob-next"]'); await wait(250);
  await shot('r01-onboard-sky');
  await click('[data-act="ob-next"]'); await wait(200);
  L.assert(await page.$('#onboardBody .err'), 'sky step refuses without a pick');
  await click('[data-act="ob-bortle"][data-b="6"]'); await wait(200);
  await click('[data-act="ob-next"]'); await wait(250);
  await shot('r01-onboard-promise');
  await click('[data-act="ob-alerts"]'); await wait(1400);
  L.assert(!(await L.vis(page, '#onboard')) && (await L.vis(page, '#app')), 'app shown after onboarding');
  L.assert((await page.evaluate(() => window.__n.requested)) === 1, 'notification permission asked once');
  let r = await L.raw(page);
  L.assert(r.places.length === 1 && r.settings.alerts.on === true && r.settings.seenIntro === true, 'place and alerts stored');
  L.assert((await text('#placeName')) === 'Gothenburg', 'top bar names the place');

  /* Tonight */
  L.assert(await page.$('#tonightBody .hero-ring .ecl'), 'score ring drawn');
  const val = (await text('#tonightBody .hero-ring .val')).trim();
  L.assert(/^\d{1,2}\.\d$/.test(val), 'score is a number: ' + val);
  L.assert((await L.count(page, '#tonightBody .part')) === 4, 'four score parts');
  L.assert(await page.$eval('#stripCv', c => c.width > 100 && c.height > 100), 'strip canvas painted');
  L.assert(await page.$eval('#moonCv', c => c.width > 50), 'moon canvas painted');
  const tonightTxt = await text('#tonightBody');
  if (/\d+deg\b/.test(tonightTxt)) log('DEFECT: bare "deg" label on Tonight:', tonightTxt.match(/.{0,20}\d+deg\b.{0,20}/)[0]);
  await shot('r01-tonight');
  await L.noOverflow(page, 'tonight');

  const nh = await L.count(page, '[data-act="happening"]');
  log('happenings tonight:', nh);
  for (let i = 0; i < Math.min(nh, 7); i++) {
    await click('[data-act="happening"][data-i="' + i + '"]'); await wait(350);
    L.assert(await L.vis(page, '#page'), 'happening page ' + i);
    if (i === 0) await shot('r01-happening');
    L.assert(await page.evaluate(() => App.back()), 'back from happening'); await wait(100);
  }
  if (await page.$('[data-act="target"]')) {
    await click('[data-act="target"]'); await wait(300);
    L.assert(await L.vis(page, '#sheet'), 'target sheet');
    await shot('r01-target');
    L.assert(await page.evaluate(() => App.back()), 'back from target'); await wait(100);
  }
  await click('[data-act="tomorrow"]'); await wait(500);
  L.assert(await L.vis(page, '#page') && (await page.$('#pageBody .hero-ring .ecl')), 'tomorrow has its own ring');
  await shot('r01-tomorrow');
  await page.evaluate(() => App.back()); await wait(100);

  /* Events */
  // The skeleton must be in the document the instant the tab handler returns, before any frame.
  const skel = await page.evaluate(() => { document.querySelector('.tab[data-view="events"]').click(); return { skel: !!document.querySelector('#eventsBody .skel'), rows: document.querySelectorAll('#eventsBody .skel-row').length }; });
  L.assert(skel.skel && skel.rows >= 5, 'skeleton rows while the year computes: ' + JSON.stringify(skel));
  await shot('r01-events-loading');
  const t0 = Date.now();
  await page.waitForFunction(() => document.querySelectorAll('#eventsBody .row').length > 3, { timeout: 30000 });
  log('feed ready in', Date.now() - t0, 'ms');
  await wait(400);
  await shot('r01-events');
  await L.noOverflow(page, 'events');
  for (const f of ['shower', 'planet', 'moon', 'all']) {
    await click('[data-act="filter"][data-id="' + f + '"]'); await wait(250);
    const n = await L.count(page, '#eventsBody .row');
    log('filter', f, n, 'rows');
    L.assert(n > 0, 'rows under ' + f);
    await click('#eventsBody .row'); await wait(500);
    L.assert(await L.vis(page, '#page'), 'detail page for ' + f);
    await shot('r01-event-' + f);
    await L.noOverflow(page, 'event ' + f);
    await page.evaluate(() => App.back()); await wait(120);
  }
  await click('[data-act="filter"][data-id="eclipse"]'); await wait(250);
  const ne = await L.count(page, '#eventsBody .row');
  log('eclipses in the year:', ne);
  L.assert(ne > 0, 'eclipse rows');
  for (let i = 0; i < ne; i++) {
    await page.evaluate(i => document.querySelectorAll('#eventsBody .row')[i].click(), i); await wait(450);
    const t = await text('#pageBody');
    L.assert(!/\bIt is a [aeiou]/i.test(t), 'article before the eclipse type: ' + (t.match(/It is an? \w+/) || [''])[0]);
    L.assert((await page.$('#eclCv')) || (await page.$('#pageBody .scene')), 'eclipse page has a drawing');
    if (i === 0) await shot('r01-event-eclipse');
    if (/Not from here/.test(t)) await shot('r01-event-eclipse-far');
    await page.evaluate(() => App.back()); await wait(120);
  }
  // A reminder on the first highlight becomes a real scheduled alert.
  await click('[data-act="filter"][data-id="hi"]'); await wait(250);
  const firstTitle = await page.$eval('#eventsBody .row .t b', e => e.textContent);
  await click('#eventsBody .row'); await wait(450);
  await click('[data-act="remind"]'); await wait(900);
  r = await L.raw(page);
  L.assert(Object.keys(r.reminders).length === 1, 'reminder stored');
  L.assert(/Reminder set/.test(await text('#pageBody')), 'button reads Reminder set');
  await shot('r01-reminded');
  const sched = await page.evaluate(() => window.__n.sched);
  log('scheduled after reminder:', sched ? sched.length : null, 'first title:', sched && sched[0] && sched[0].title);
  L.assert(sched && sched.some(o => o.title.indexOf(firstTitle) === 0), 'the reminder is in the schedule handed to the shell (' + firstTitle + ')');
  await page.evaluate(() => App.back()); await wait(120);

  /* Places */
  await click('.tab[data-view="places"]'); await wait(400);
  await shot('r01-places-one');
  await click('[data-act="addplace"]'); await wait(300);
  await click('[data-act="saveplace"]'); await wait(250);
  L.assert(await L.vis(page, '#sheet') && (await page.$('#sheetBody .err')), 'empty coordinates refused inline');
  await shot('r01-place-err');
  await page.$eval('#pLat', e => e.value = '-91'); await page.$eval('#pLon', e => e.value = '0');
  await click('[data-act="saveplace"]'); await wait(250);
  L.assert(await L.vis(page, '#sheet'), 'latitude -91 refused');
  await page.$eval('#pName', e => e.value = 'gothenburg');
  await page.$eval('#pLat', e => e.value = '57.05'); await page.$eval('#pLon', e => e.value = '12.65');
  await click('[data-act="saveplace"]'); await wait(250);
  L.assert(await L.vis(page, '#sheet') && /already have a place/.test(await text('#sheetBody')), 'duplicate name refused');
  await page.$eval('#pName', e => e.value = 'The field at Onnered');
  await click('[data-act="bortle"][data-b="4"]'); await wait(100);
  await click('[data-act="saveplace"]'); await wait(700);
  L.assert(!(await L.vis(page, '#sheet')), 'sheet closed on save');
  r = await L.raw(page);
  L.assert(r.places.length === 2 && r.places[1].bortle === 4, 'second place stored with Bortle 4');
  await shot('r01-places-two');
  await click('[data-act="compare"]'); await wait(700);
  L.assert(/side by side/i.test(await text('#placesBody')), 'comparison card renders');
  await page.evaluate(() => { document.querySelector('#v-places').scrollTop = 520; }); await wait(250);
  await shot('r01-places-compare');
  await L.noOverflow(page, 'places');
  await click('[data-act="editplace"]'); await wait(300);
  L.assert((await page.$eval('#pName', e => e.value)) === 'Gothenburg', 'edit sheet carries the name');
  await click('[data-act="saveplace"]'); await wait(700);

  /* Log */
  await click('.tab[data-view="log"]'); await wait(400);
  L.assert(await page.$('#logBody .empty .scene'), 'log empty state is drawn');
  L.assert(/27/.test(await text('#logBody')), 'life list counts 27');
  await shot('r01-log-empty');
  await click('#logBody [data-act="log-new"]'); await wait(300);
  await click('[data-act="save-log"]'); await wait(250);
  L.assert(await page.$('#sheetBody .err'), 'empty entry refused inline');
  await shot('r01-log-err');
  await click('[data-act="ph"][data-id="earth"]'); await click('[data-act="ph"][data-id="jmoons"]');
  await type('#lgNote', 'Balcony, twenty minutes. Three moons on one side of Jupiter.');
  await shot('r01-log-sheet');
  await click('[data-act="save-log"]'); await wait(700);
  r = await L.raw(page);
  L.assert(r.log.length === 1 && r.log[0].phenomena.length === 2 && r.log[0].ctx.score != null, 'entry stored with conditions attached');
  await shot('r01-log-one');
  await click('[data-act="entry"]'); await wait(300);
  await click('[data-act="ph"][data-id="halo"]'); await click('[data-act="save-log"]'); await wait(600);
  r = await L.raw(page);
  L.assert(r.log[0].phenomena.length === 3, 'entry edited');
  await click('[data-act="life"][data-id="halo"]'); await wait(300);
  L.assert(/First seen/.test(await text('#sheetBody')), 'life sheet knows the first sighting');
  await shot('r01-life');
  await page.evaluate(() => App.back()); await wait(100);

  /* Settings */
  await click('#setBtn'); await wait(600);
  L.assert(await page.$('#planBox'), 'plan box present with alerts on');
  await page.waitForFunction(() => { const b = document.querySelector('#planBox'); return b && !b.querySelector('.skel'); }, { timeout: 15000 });
  await page.waitForFunction(() => !/Working out/.test(document.querySelector('#ceilNote').textContent), { timeout: 15000 });
  await shot('r01-settings');
  log('ceiling note:', await text('#ceilNote'));
  await click('[data-act="toggle"][data-id="clock"]'); await wait(500);
  r = await L.raw(page);
  L.assert(r.settings.clock24 === false, 'clock toggle stored');
  await click('[data-act="toggle"][data-id="clock"]'); await wait(500);
  await click('[data-act="method"]'); await wait(400);
  L.assert(/Meeus/.test(await text('#pageBody')), 'method page');
  await shot('r01-method');
  await page.evaluate(() => App.back()); await wait(150);
  L.assert(/Alerts/i.test(await text('#pageBody')), 'settings under method');
  await click('[data-act="red"][data-v="on"]'); await wait(400);
  L.assert((await page.$eval('html', h => h.dataset.red)) === 'on', 'red via settings');
  await shot('r01-settings-red');
  await click('[data-act="red"][data-v="off"]'); await wait(300);
  await page.evaluate(() => App.back()); await wait(150);
  await click('#redBtn'); await wait(400);
  await click('.tab[data-view="tonight"]'); await wait(500);
  await shot('r01-red-tonight');
  await click('#redBtn'); await wait(300);

  /* Reload: byte for byte. */
  const before = await L.raw(page);
  await page.reload({ waitUntil: 'networkidle0' }); await wait(1200);
  const after = await L.raw(page);
  L.assert(JSON.stringify(before) === JSON.stringify(after), 'record survives a reload byte for byte');
  L.assert((await text('#placeName')) === 'Gothenburg' && (await L.vis(page, '#app')), 'app straight to Tonight after reload');
  /* Kill the tab, open a new one. */
  const p2 = await browser.newPage();
  await p2.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await p2.goto(page.url(), { waitUntil: 'networkidle0' }); await wait(1200);
  const again = await p2.evaluate(k => JSON.parse(localStorage.getItem(k)), L.KEY);
  L.assert(JSON.stringify(again) === JSON.stringify(before), 'record intact in a fresh tab');
  L.assert(await p2.evaluate(() => !document.getElementById('app').hidden && document.querySelectorAll('#tonightBody .part').length === 4), 'fresh tab renders Tonight');
  await p2.close();
  log('errors:', errors.length);
};
