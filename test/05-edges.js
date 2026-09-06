/* Every input with an edge, rapid double taps, and quick rotation through the screens. */
const { seed, raw, assert, v100Record, DEC, doubleTap } = require('./lib');
module.exports = async ({ page, shot, wait, click, type, text, errors, log }) => {
  await seed(page, v100Record({ places: [{ id: 'plabc123', name: 'Gothenburg', lat: 57.71, lon: 11.97, bortle: 6 }], compareId: null, log: [], reminders: {} }), { native: true, now: DEC });
  await wait(600);
  const visible = sel => page.$eval(sel, e => !e.hidden);
  const setVal = (sel, v) => page.$eval(sel, (e, v) => { e.value = v; }, v);

  await click('.tab[data-view="places"]');
  await wait(300);

  /* Coordinates. */
  const tryPlace = async (name, lat, lon) => {
    await click('[data-act="addplace"]');
    await wait(150);
    await setVal('#pName', name); await setVal('#pLat', lat); await setVal('#pLon', lon);
    await click('[data-act="saveplace"]');
    await wait(300);
  };
  await tryPlace('Nowhere', '', '');
  assert(await visible('#sheet'), 'empty coordinates refused');
  assert(/coordinates/i.test(await page.$eval('#sheetBody', e => e.innerText)), 'refusal is written inline in the sheet');
  await shot('05-place-empty');
  await setVal('#pLat', '-91'); await setVal('#pLon', '10');
  await click('[data-act="saveplace"]'); await wait(200);
  assert(await visible('#sheet'), 'latitude -91 refused');
  await setVal('#pLat', 'abc'); await setVal('#pLon', '10');
  await click('[data-act="saveplace"]'); await wait(200);
  assert(await visible('#sheet'), 'letters refused');
  await setVal('#pLat', '10'); await setVal('#pLon', '181');
  await click('[data-act="saveplace"]'); await wait(200);
  assert(await visible('#sheet'), 'longitude 181 refused');
  await setVal('#pLat', '0'); await setVal('#pLon', '0');
  await click('[data-act="saveplace"]'); await wait(400);
  assert(!(await visible('#sheet')), 'zero, zero is a real place and is accepted');
  let r = await raw(page);
  assert(r.places.length === 2 && r.places[1].lat === 0, 'null island stored');

  // The poles and the date line.
  await tryPlace('Pole', '90', '180');
  assert(!(await visible('#sheet')), 'lat 90 lon 180 accepted');
  await page.evaluate(() => window.App.setView('places'));
  await wait(200);
  // Comparing the pole draws a night with no sunset or no sunrise, without throwing.
  const poleId = (await raw(page)).places[2].id;
  await click('[data-act="compare"][data-id="' + poleId + '"]');
  await wait(600);
  assert(/side by side/i.test(await text('#placesBody')), 'polar place compares without error');
  await shot('05-pole-compare');
  await click('[data-act="sethome"][data-id="' + poleId + '"]');
  await wait(600);
  await click('.tab[data-view="tonight"]');
  await wait(800);
  await shot('05-pole-tonight');
  assert(/night|sun does not/i.test(await text('#tonightBody')), 'tonight renders at the pole');
  await click('.tab[data-view="events"]');
  await page.waitForFunction(() => document.querySelectorAll('#eventsBody .row').length > 3, { timeout: 20000 });
  await shot('05-pole-events');
  await click('[data-act="sethome"][data-id="plabc123"]').catch(async () => {
    await page.evaluate(() => window.App.setView('places'));
    await wait(300);
    await click('[data-act="sethome"][data-id="plabc123"]');
  });
  await wait(400);

  /* Names. */
  const long = 'A'.repeat(120);
  await tryPlace(long, '48.85', '2.35');
  r = await raw(page);
  const lp = r.places[r.places.length - 1];
  assert(lp.name.length <= 40, 'long name truncated to 40: ' + lp.name.length);
  await click('[data-act="sethome"][data-id="' + lp.id + '"]');
  await wait(300);
  await shot('05-long-name-topbar');
  const nameW = await page.$eval('#placeName', e => e.getBoundingClientRect().right);
  const btnL = await page.$eval('#redBtn', e => e.getBoundingClientRect().left);
  assert(nameW <= btnL, 'a long place name does not run under the top bar buttons');
  await click('[data-act="sethome"][data-id="plabc123"]');
  await wait(300);
  // Duplicate name.
  await tryPlace('Gothenburg', '57.71', '11.97');
  assert(await visible('#sheet'), 'a duplicate name is refused');
  assert(/already/i.test(await page.$eval('#sheetBody', e => e.innerText)), 'duplicate refusal is inline');
  await shot('05-place-duplicate');
  await page.evaluate(() => window.App.back());
  // Empty name gets a default.
  await tryPlace('   ', '51.5', '-0.12');
  r = await raw(page);
  assert(r.places[r.places.length - 1].name === 'My sky', 'blank name becomes My sky');

  /* Bortle out of range through the slider is impossible; through the store it is clamped. */
  await page.evaluate(() => window.Store.addPlace({ name: 'Clamp', lat: 1, lon: 1, bortle: 42 }));
  r = await raw(page);
  assert(r.places[r.places.length - 1].bortle === 9, 'bortle clamped to 9');
  await page.evaluate(() => window.Store.addPlace({ name: 'Clamp2', lat: 1, lon: 1, bortle: -3 }));
  r = await raw(page);
  assert(r.places[r.places.length - 1].bortle === 1, 'bortle clamped to 1');

  /* The log. */
  await click('.tab[data-view="log"]');
  await wait(300);
  await click('#logBody [data-act="log-new"]');
  await wait(200);
  await click('[data-act="save-log"]');
  await wait(200);
  assert(await visible('#sheet'), 'empty entry refused');
  assert(/pick|write/i.test(await page.$eval('#sheetBody', e => e.innerText)), 'empty entry refusal is inline');
  await shot('05-log-empty-error');
  await setVal('#lgNote', 'x'.repeat(2000));
  await page.$eval('#lgNote', e => e.dispatchEvent(new Event('input', { bubbles: true })));
  await click('[data-act="save-log"]');
  await wait(400);
  r = await raw(page);
  assert(r.log.length === 1 && r.log[0].note.length <= 600, 'a 2000 character note is cut to 600: ' + r.log[0].note.length);

  /* Rapid double taps on the primary buttons. */
  await doubleTap(page, '#logBody [data-act="log-new"]');
  await wait(200);
  assert((await page.$$('#sheet .sheet-panel')).length === 1 && await visible('#sheet'), 'double tap opens one sheet');
  await click('[data-act="ph"][data-id="halo"]');
  await doubleTap(page, '[data-act="save-log"]');
  await wait(400);
  r = await raw(page);
  assert(r.log.length === 2, 'double tap on save makes one entry, got ' + r.log.length);
  await doubleTap(page, '[data-act="export"]');
  await wait(300);
  const saved = await page.evaluate(() => window.__native.saved.length);
  assert(saved === 1, 'double tap on export writes one file, got ' + saved);
  await click('.tab[data-view="places"]');
  await wait(300);
  await doubleTap(page, '[data-act="addplace"]');
  await wait(200);
  await setVal('#pName', 'Twice'); await setVal('#pLat', '40'); await setVal('#pLon', '-3');
  const nBefore = (await raw(page)).places.length;
  await doubleTap(page, '[data-act="saveplace"]');
  await wait(400);
  assert((await raw(page)).places.length === nBefore + 1, 'double tap on add place makes one place');

  /* Remove down to one place: the last one cannot be removed. */
  await page.evaluate(() => window.App.setView('places'));
  await wait(200);
  let n = (await raw(page)).places.length;
  while (n > 1) {
    const ids = (await raw(page)).places.map(p => p.id).filter(id => id !== 'plabc123');
    await click('[data-act="delplace"][data-id="' + ids[0] + '"]');
    await wait(200);
    // A confirm sheet, if one exists, is accepted.
    if (await visible('#sheet')) { await click('[data-act="delplace-yes"]'); await wait(200); }
    n = (await raw(page)).places.length;
  }
  assert(!(await page.$('[data-act="delplace"]')), 'the last place has no remove button');
  await shot('05-one-place');

  /* Rotate through the screens quickly. */
  for (let i = 0; i < 12; i++) {
    for (const v of ['events', 'places', 'log', 'tonight']) await page.evaluate(v => window.App.setView(v), v);
    await page.evaluate(() => { window.App.openPage('Settings', () => '<p>x</p>', 'zzz'); window.App.back(); });
  }
  await wait(800);
  assert(await visible('#v-tonight'), 'tonight after a fast rotation');
  assert(/out of ten/i.test(await text('#tonightBody')), 'tonight intact after rotation');

  /* The settings sliders at their ends. */
  await click('#setBtn');
  await wait(400);
  await setVal('#minS', '9.5'); await page.$eval('#minS', e => e.dispatchEvent(new Event('input', { bubbles: true })));
  await page.$eval('#minS', e => e.dispatchEvent(new Event('change', { bubbles: true })));
  await setVal('#hourS', '22'); await page.$eval('#hourS', e => e.dispatchEvent(new Event('input', { bubbles: true })));
  await page.$eval('#hourS', e => e.dispatchEvent(new Event('change', { bubbles: true })));
  await wait(600);
  r = await raw(page);
  assert(r.settings.alerts.min === 9.5 && r.settings.alerts.hour === 22 && r.settings.alerts.minSet === true, 'slider ends stored');
  await shot('05-settings-ends');

  /* Onboarding edges: refuse garbage, keep the draft across Back, a double tap on finish
     makes one place. */
  await seed(page, null, { native: true });
  await wait(300);
  await setVal('#obLat', '95'); await setVal('#obLon', '0');
  await click('[data-act="ob-next"]'); await wait(200);
  assert(!!(await page.$('#obLat')), 'latitude 95 refused in onboarding');
  assert(/coordinates|city/i.test(await text('#onboardBody')), 'onboarding refusal written inline');
  await shot('05-onboard-error');
  await setVal('#obLat', '-33.87'); await setVal('#obLon', '151.21');
  await click('[data-act="ob-next"]'); await wait(200);
  await click('[data-act="ob-next"]'); await wait(200);
  assert(!!(await page.$('[data-act="ob-bortle"]')), 'no sky pick means no progress');
  await click('[data-act="ob-bortle"][data-b="4"]'); await wait(150);
  await click('[data-act="ob-next"]'); await wait(200);
  await doubleTap(page, '[data-act="ob-done"]');
  await wait(900);
  r = await raw(page);
  assert(r.places.length === 1, 'double tap on finish makes one place, got ' + r.places.length);
  assert(r.places[0].name === 'My sky' && r.places[0].bortle === 4, 'typed coordinates without a city get a default name');
  await shot('05-onboard-done');
  log('errors:', errors.length);
};
