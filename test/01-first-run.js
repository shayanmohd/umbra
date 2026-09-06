/* First run, empty state, the full happy path that creates data on every screen, then reload. */
const { seed, raw, assert } = require('./lib');
module.exports = async ({ page, shot, wait, text, click, type, errors, log }) => {
  await seed(page, null, { native: false });
  await wait(300);
  assert(!(await page.$eval('#onboard', e => e.hidden)), 'onboarding shows on first run');
  await shot('01-onboard-0');

  // Empty continue is refused, inline.
  await click('[data-act="ob-next"]');
  await wait(200);
  await shot('01-onboard-0-error');
  assert(!(await page.$eval('#onboard', e => e.hidden)), 'still on onboarding after empty continue');

  await type('#obCity', 'goth');
  await wait(200);
  await click('#obHits .pick');
  await wait(100);
  log('after city pick:', await page.$eval('#obLat', e => e.value), await page.$eval('#obLon', e => e.value));
  await click('[data-act="ob-next"]');
  await wait(200);
  await shot('01-onboard-1');
  // Back keeps what was typed.
  await click('[data-act="ob-back"]');
  await wait(150);
  const kept = await page.$eval('#obLat', e => e.value);
  log('lat after back:', kept);
  assert(kept !== '', 'coordinates survive Back in onboarding');
  await click('[data-act="ob-next"]');
  await wait(150);
  await click('[data-act="ob-next"]');   // no bortle picked yet
  await wait(150);
  assert(!!(await page.$('[data-act="ob-bortle"]')), 'refused to continue without a sky pick');
  await click('[data-act="ob-bortle"][data-b="6"]');
  await wait(150);
  await click('[data-act="ob-next"]');
  await wait(200);
  await shot('01-onboard-2');
  await click('[data-act="ob-done"]');
  await wait(900);
  await shot('01-tonight');
  assert((await text('#placeName')) === 'Gothenburg', 'home place named from the city');

  // Tonight: open a happening and a target, then tomorrow.
  const hap = await page.$('[data-act="happening"]');
  if (hap) { await click('[data-act="happening"]'); await wait(400); await shot('01-happening'); assert(await page.evaluate(() => App.back()), 'back from happening'); }
  const tg = await page.$('[data-act="target"]');
  if (tg) { await click('[data-act="target"]'); await wait(300); await shot('01-target-sheet'); assert(await page.evaluate(() => App.back()), 'back from target sheet'); }
  await click('[data-act="tomorrow"]');
  await wait(500);
  await shot('01-tomorrow');
  await page.evaluate(() => App.back());

  // Events: wait for the feed, open one of each kind.
  await click('.tab[data-view="events"]');
  await wait(150);
  await shot('01-events-loading');
  await page.waitForFunction(() => document.querySelectorAll('#eventsBody .row').length > 3, { timeout: 20000 });
  await wait(300);
  await shot('01-events');
  for (const f of ['shower', 'eclipse', 'planet', 'moon', 'all']) {
    await click('[data-act="filter"][data-id="' + f + '"]');
    await wait(200);
    const n = await page.$$eval('#eventsBody .row', r => r.length);
    log('filter', f, n, 'rows');
    const first = await page.$('#eventsBody .row');
    if (first) {
      await click('#eventsBody .row');
      await wait(500);
      await shot('01-event-' + f);
      await page.evaluate(() => App.back());
      await wait(100);
    }
  }
  await click('[data-act="filter"][data-id="hi"]');
  await wait(200);
  // Set a reminder on the first highlight and see it in the settings plan.
  await click('#eventsBody .row');
  await wait(400);
  await click('[data-act="remind"]');
  await wait(300);
  await shot('01-event-reminded');
  const rem = await raw(page);
  assert(Object.keys(rem.reminders).length === 1, 'reminder stored');
  await page.evaluate(() => App.back());

  // Places: add a dark site, compare, edit, then the comparison card.
  await click('.tab[data-view="places"]');
  await wait(300);
  await shot('01-places-one');
  await click('[data-act="addplace"]');
  await wait(200);
  await click('[data-act="saveplace"]');   // empty coordinates
  await wait(200);
  await shot('01-place-error');
  assert(!(await page.$eval('#sheet', e => e.hidden)), 'sheet stays open on bad coordinates');
  await type('#pName', 'The field at Onnered');
  await page.$eval('#pLat', e => e.value = '57.05');
  await page.$eval('#pLon', e => e.value = '12.65');
  await click('[data-act="bortle"][data-b="4"]');
  await wait(100);
  await click('[data-act="saveplace"]');
  await wait(600);
  await shot('01-places-two');
  await click('[data-act="compare"]');
  await wait(600);
  await page.evaluate(() => { const v = document.querySelector('#v-places'); v.scrollTop = 500; });
  await wait(200);
  await shot('01-places-compare');
  await click('[data-act="editplace"]');
  await wait(200);
  await shot('01-place-edit');
  await click('[data-act="saveplace"]');
  await wait(500);

  // Log: create an entry, edit it, tick a life item, export.
  await click('.tab[data-view="log"]');
  await wait(300);
  await shot('01-log-empty');
  await click('#logBody [data-act="log-new"]');
  await wait(200);
  await click('[data-act="save-log"]');   // nothing picked
  await wait(200);
  await shot('01-log-error');
  await click('[data-act="ph"][data-id="earth"]');
  await click('[data-act="ph"][data-id="jmoons"]');
  await type('#lgNote', 'Balcony, twenty minutes. Three moons on one side of Jupiter.');
  await shot('01-log-sheet');
  await click('[data-act="save-log"]');
  await wait(500);
  await shot('01-log-one');
  await click('[data-act="entry"]');
  await wait(200);
  await click('[data-act="ph"][data-id="halo"]');
  await click('[data-act="save-log"]');
  await wait(400);
  await click('[data-act="life"][data-id="halo"]');
  await wait(200);
  await shot('01-life-sheet');
  await page.evaluate(() => App.back());

  // Settings, method, red mode.
  await click('#setBtn');
  await wait(300);
  await shot('01-settings');
  await click('[data-act="toggle"][data-id="alerts-on"]');
  await wait(2500);
  await shot('01-settings-alerts');
  await click('[data-act="method"]');
  await wait(300);
  await shot('01-method');
  await page.evaluate(() => App.back());
  await page.evaluate(() => App.back());
  await click('#redBtn');
  await wait(400);
  await shot('01-red');
  await click('#redBtn');
  await wait(200);

  // Reload: everything persists.
  const before = await raw(page);
  await page.reload({ waitUntil: 'networkidle0' });
  await wait(800);
  const after = await raw(page);
  for (const k of Object.keys(before)) if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) log('differs after reload:', k, JSON.stringify(before[k]).slice(0, 300), '=>', JSON.stringify(after[k]).slice(0, 300));
  assert(JSON.stringify(before) === JSON.stringify(after), 'record survives a reload byte for byte');
  assert(after.places.length === 2 && after.log.length === 1 && after.settings.alerts.on, 'places, log and alerts intact');
  assert((await text('#placeName')) === 'Gothenburg', 'home still Gothenburg after reload');
  await click('.tab[data-view="log"]');
  await wait(300);
  await shot('01-log-after-reload');
  log('errors:', errors.length);
};
