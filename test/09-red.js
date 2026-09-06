/* Red light mode on every screen, plus the automatic switch after dusk. Both palettes must read. */
const { seed, assert, v100Record, DEC } = require('./lib');
module.exports = async ({ page, shot, wait, click, errors, log }) => {
  await seed(page, v100Record({ settings: { clock24: true, red: 'on', alerts: { on: true, min: 6.5, minSet: true, hour: 18, eclipses: true, digest: true }, seenIntro: true } }), { native: true, now: DEC });
  await wait(900);
  assert((await page.$eval('html', e => e.dataset.red)) === 'on', 'red mode on from settings');
  const bg = await page.$eval('html', e => getComputedStyle(e).getPropertyValue('--bg').trim());
  assert(!/^#0{6}$|^#000$/i.test(bg), 'red mode does not use pure black, got ' + bg);
  await shot('09-red-tonight');
  await click('.tab[data-view="events"]');
  await page.waitForFunction(() => document.querySelectorAll('#eventsBody .row').length > 3, { timeout: 20000 });
  await wait(300);
  await shot('09-red-events');
  await click('#eventsBody .row'); await wait(500);
  await shot('09-red-event');
  await page.evaluate(() => window.App.back());
  await click('.tab[data-view="log"]'); await wait(300);
  await shot('09-red-log');
  await click('#setBtn'); await wait(700);
  await shot('09-red-settings');
  await page.evaluate(() => window.App.back());
  await click('.tab[data-view="places"]'); await wait(300);
  await click('[data-act="addplace"]'); await wait(300);
  await shot('09-red-sheet');
  await page.evaluate(() => window.App.back());

  // Toggle from the top bar and back.
  await click('#redBtn'); await wait(300);
  assert((await page.$eval('html', e => e.dataset.red)) === 'off', 'top bar toggles red off');
  await click('#redBtn'); await wait(300);
  assert((await page.$eval('html', e => e.dataset.red)) === 'on', 'and on again');

  // Automatic: 20:40 in December in Gothenburg is well after dusk.
  await seed(page, v100Record({ settings: { clock24: true, red: 'auto', alerts: { on: false, min: 6.5, hour: 18, eclipses: true, digest: true }, seenIntro: true } }), { native: true, now: DEC });
  await wait(600);
  assert((await page.$eval('html', e => e.dataset.red)) === 'on', 'auto red is on after dusk');
  // And at midday it is off.
  await seed(page, v100Record({ settings: { clock24: true, red: 'auto', alerts: { on: false, min: 6.5, hour: 18, eclipses: true, digest: true }, seenIntro: true } }), { native: true, now: new Date('2026-12-13T12:00:00+01:00').getTime() });
  await wait(600);
  assert((await page.$eval('html', e => e.dataset.red)) === 'off', 'auto red is off at midday');
  await shot('09-day-tonight');
  log('errors:', errors.length);
};
