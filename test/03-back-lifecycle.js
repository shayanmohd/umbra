/* The Back gesture on every nested screen, and the pause and resume hooks. */
const { seed, assert, v100Record, DEC } = require('./lib');
module.exports = async ({ page, shot, wait, click, errors, log }) => {
  await seed(page, v100Record(), { native: true, now: DEC });
  await wait(800);
  const back = () => page.evaluate(() => window.App.back());
  const visible = sel => page.$eval(sel, e => !e.hidden);

  // Root: nothing to consume.
  assert((await back()) === false, 'back at the root returns false');

  // Each tab returns to Tonight.
  for (const v of ['events', 'places', 'log']) {
    await click('.tab[data-view="' + v + '"]');
    await wait(300);
    assert((await back()) === true, 'back from ' + v + ' consumed');
    assert(await visible('#v-tonight'), 'landed on tonight from ' + v);
  }

  // Pages: happening, target sheet, tomorrow, settings, method, event detail.
  await click('[data-act="happening"]');
  await wait(300);
  assert(await visible('#page'), 'happening page open');
  assert((await back()) === true && !(await visible('#page')), 'back closes the happening page');

  await click('[data-act="target"]');
  await wait(300);
  assert(await visible('#sheet'), 'target sheet open');
  assert((await back()) === true && !(await visible('#sheet')), 'back closes the target sheet');

  await click('[data-act="tomorrow"]');
  await wait(400);
  assert((await back()) === true && !(await visible('#page')), 'back closes tomorrow');

  await click('#setBtn');
  await wait(700);
  await click('[data-act="method"]');
  await wait(400);
  assert((await back()) === true && await visible('#page'), 'back from method returns to a page');
  // The page under it is still Settings.
  assert(/alerts/i.test(await page.$eval('#pageBody', e => e.innerText)), 'settings page restored under method');
  assert((await back()) === true && !(await visible('#page')), 'back closes settings');
  assert(await visible('#v-tonight'), 'tonight visible after settings closes');

  // A sheet on top of a page: back closes the sheet first, then the page.
  await click('#setBtn');
  await wait(700);
  await click('[data-act="erase"]');
  await wait(200);
  assert(await visible('#sheet'), 'erase sheet open over settings');
  assert((await back()) === true && !(await visible('#sheet')) && await visible('#page'), 'back closes the sheet, keeps the page');
  assert((await back()) === true && !(await visible('#page')), 'then closes the page');

  // Event detail from a non root tab: back goes page, then tab, then root.
  await click('.tab[data-view="events"]');
  await page.waitForFunction(() => document.querySelectorAll('#eventsBody .row').length > 3, { timeout: 20000 });
  await click('#eventsBody .row');
  await wait(400);
  await click('#pageBody [data-act="log-new"]');
  await wait(200);
  assert(await visible('#sheet') && await visible('#page'), 'log sheet over the event page');
  assert((await back()) === true, 'sheet closed');
  assert((await back()) === true && !(await visible('#page')), 'event page closed');
  assert(await visible('#v-events'), 'still on events');
  assert((await back()) === true && await visible('#v-tonight'), 'back to tonight');
  assert((await back()) === false, 'root again');

  // Pause and resume must not throw and must leave the screen intact.
  await page.evaluate(() => { window.App.onPause(); });
  await wait(100);
  await page.evaluate(() => { window.App.onResume(); });
  await wait(800);
  assert(await visible('#v-tonight'), 'tonight still there after resume');
  assert(/out of ten/i.test(await page.$eval('#tonightBody', e => e.innerText)), 'tonight re-rendered after resume');
  // Resume recomputes the schedule.
  const before = await page.evaluate(() => window.__native.scheduled && window.__native.scheduled.length);
  assert(before > 0, 'schedule present after resume');
  // Pause while a page is open, resume, page still open.
  await click('#setBtn');
  await wait(300);
  await page.evaluate(() => { window.App.onPause(); window.App.onResume(); });
  await wait(500);
  assert(await visible('#page'), 'open page survives a pause and resume');
  await back();

  // Onboarding: back on step 1 goes to step 0 and returns true, on step 0 returns false.
  await seed(page, null, { native: false });
  await wait(300);
  assert((await back()) === false, 'onboarding step 0: back not consumed');
  await page.type('#obCity', 'oslo');
  await wait(200);
  await click('#obHits .pick');
  await click('[data-act="ob-next"]');
  await wait(200);
  assert((await back()) === true, 'onboarding step 1: back consumed');
  assert((await page.$eval('#obLat', e => e.value)) !== '', 'coordinates still there after back');
  await shot('03-onboard-back');
  log('errors:', errors.length);
};
