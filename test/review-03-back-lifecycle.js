/* window.App.back() on every nested screen, false only at the root; onPause and onResume. */
const L = require('./review-lib');
module.exports = async ({ page, shot, wait, text, click, errors, log }) => {
  const rec = L.v100();
  await L.seed(page, rec, { native: true, now: L.DEC });
  await wait(900);
  const back = () => page.evaluate(() => window.App.back());
  const V = s => L.vis(page, s);

  L.assert((await back()) === false, 'root: back returns false');
  for (const v of ['events', 'places', 'log']) {
    await click('.tab[data-view="' + v + '"]'); await wait(350);
    L.assert((await back()) === true && (await V('#v-tonight')), 'back from ' + v + ' lands on Tonight');
  }
  // Tonight's pages and sheets.
  await click('[data-act="happening"]'); await wait(300);
  L.assert(await V('#page'), 'happening page open');
  L.assert((await back()) === true && !(await V('#page')), 'back closes happening');
  if (await page.$('[data-act="target"]')) {
    await click('[data-act="target"]'); await wait(300);
    L.assert((await back()) === true && !(await V('#sheet')), 'back closes target sheet');
  }
  await click('[data-act="tomorrow"]'); await wait(400);
  L.assert((await back()) === true && !(await V('#page')), 'back closes tomorrow');
  await click('#tonightBody [data-act="log-new"]'); await wait(300);
  L.assert(await V('#sheet'), 'log sheet from Tonight');
  L.assert((await back()) === true && !(await V('#sheet')), 'back closes the log sheet');

  // Settings, method above it, then a sheet above a page.
  await click('#setBtn'); await wait(600);
  await click('[data-act="method"]'); await wait(400);
  L.assert((await back()) === true && (await V('#page')) && /Alerts/i.test(await text('#pageBody')), 'back from method restores Settings');
  await click('[data-act="erase"]'); await wait(300);
  L.assert(await V('#sheet'), 'erase sheet over settings');
  L.assert((await back()) === true && !(await V('#sheet')) && (await V('#page')), 'back closes the sheet and keeps the page');
  L.assert((await back()) === true && !(await V('#page')), 'back closes settings');
  L.assert((await back()) === false, 'root again');

  // Events: detail page, and a log sheet from inside it.
  await click('.tab[data-view="events"]');
  await page.waitForFunction(() => document.querySelectorAll('#eventsBody .row').length > 3, { timeout: 30000 });
  await wait(300);
  await click('#eventsBody .row'); await wait(450);
  L.assert(await V('#page'), 'event page');
  await click('#pageBody [data-act="log-new"]'); await wait(300);
  L.assert((await back()) === true && (await V('#page')), 'sheet over event page closed first');
  L.assert((await back()) === true && !(await V('#page')) && (await V('#v-events')), 'event page closed, still on Events');
  L.assert((await back()) === true && (await V('#v-tonight')), 'Events to Tonight');

  // Places: add sheet, edit sheet, delete sheet.
  await click('.tab[data-view="places"]'); await wait(400);
  await click('[data-act="addplace"]'); await wait(300);
  L.assert((await back()) === true && !(await V('#sheet')), 'add place sheet');
  await click('[data-act="editplace"]'); await wait(300);
  L.assert((await back()) === true && !(await V('#sheet')), 'edit place sheet');
  await click('[data-act="delplace"]'); await wait(300);
  L.assert(await V('#sheet') && /no undo/.test(await text('#sheetBody')), 'delete confirmation sheet');
  L.assert((await back()) === true && !(await V('#sheet')), 'delete sheet closed, nothing removed');
  L.assert((await L.raw(page)).places.length === 2, 'both places still there');
  await back();

  // Log: entry sheet, life sheet.
  await click('.tab[data-view="log"]'); await wait(400);
  await click('[data-act="entry"]'); await wait(300);
  L.assert((await back()) === true && !(await V('#sheet')), 'entry sheet');
  await click('[data-act="life"]'); await wait(300);
  L.assert((await back()) === true && !(await V('#sheet')), 'life sheet');
  await back();

  // Pause and resume do not throw, and the screen still works afterwards.
  await page.evaluate(() => { window.App.onPause(); });
  await page.evaluate(() => { window.App.onResume(); }); await wait(600);
  L.assert((await L.count(page, '#tonightBody .part')) === 4, 'Tonight re-rendered on resume');
  const calls = await page.evaluate(() => window.__n.schedCalls);
  L.assert(calls >= 2, 'schedule recomputed on resume (' + calls + ' calls)');

  // Resume while on Events with no reminders: an event row must still open.
  const noRem = Object.assign({}, rec, { reminders: {} });
  await L.seed(page, noRem, { native: true, now: L.DEC }); await wait(900);
  await click('.tab[data-view="events"]');
  await page.waitForFunction(() => document.querySelectorAll('#eventsBody .row').length > 3, { timeout: 30000 });
  await wait(300);
  await page.evaluate(() => { window.App.onPause(); window.App.onResume(); }); await wait(1500);
  await page.waitForFunction(() => document.querySelectorAll('#eventsBody .row').length > 3, { timeout: 30000 });
  await click('#eventsBody .row'); await wait(500);
  L.assert(await V('#page'), 'an event row opens after resume');
  await shot('r03-after-resume');
  await back();

  // Onboarding: step 1 back is consumed, step 0 is the root.
  await L.seed(page, null, { native: true }); await wait(300);
  L.assert((await back()) === false, 'onboarding step 0 is the root');
  await page.$eval('#obLat', e => e.value = '57.7'); await page.$eval('#obLon', e => e.value = '12');
  await click('[data-act="ob-next"]'); await wait(250);
  L.assert((await back()) === true && (await page.$('#obLat')), 'onboarding step 1 back returns to step 0');
  await page.evaluate(() => { window.App.onPause(); window.App.onResume(); });
  L.assert(await V('#onboard'), 'resume during onboarding leaves it alone');
  log('errors:', errors.length);
};
