/* Three things a real thumb hits that the other scripts step around.

   1. A toast sits over the bottom of the screen for two and a half seconds. Whatever is under
      it must still take a tap.
   2. Calibration measures a year in the background and lands seconds later. If Settings is open
      it must not throw away what the user is reading (an import result, an inline error).
   3. A place name or a note is whatever the user typed. One unbroken run of characters must
      wrap, on every screen that shows it, in a sheet and in a page. */
const L = require('./review-lib');
const fs = require('fs'), path = require('path');

module.exports = async ({ page, shot, wait, text, click, errors, log }) => {
  const V = s => L.vis(page, s);

  /* ---------- 1. the toast does not eat taps ---------- */
  await L.seed(page, L.v100(), { native: true, now: L.DEC }); await wait(900);
  await click('.tab[data-view="log"]'); await wait(500);
  await page.evaluate(() => App.toast('Saved to Downloads'));
  await wait(200);
  L.assert(!(await L.vis(page, '#toast') === false), 'toast is up');
  const under = await page.evaluate(() => {
    const t = document.querySelector('#toast').getBoundingClientRect();
    const el = document.elementFromPoint(t.left + t.width / 2, t.top + t.height / 2);
    return { tag: el.tagName, id: el.id, cls: typeof el.className === 'string' ? el.className : '' };
  });
  log('element under the middle of the toast:', JSON.stringify(under));
  L.assert(under.id !== 'toast', 'the toast does not take the hit at its own centre');
  await shot('r08-toast-over-log');

  // And in the real flow that found it: a toast from Export, then Continue on onboarding.
  await click('#logBody [data-act="export"]'); await wait(300);
  L.assert(await L.vis(page, '#toast'), 'export raised a toast');
  await click('#setBtn'); await wait(700);
  await click('[data-act="erase"]'); await wait(300);
  await click('[data-act="erase-yes"]'); await wait(500);
  L.assert(await V('#onboard'), 'erased back to onboarding');
  L.assert(await L.vis(page, '#toast'), 'the toast is still on screen over onboarding');
  await page.$eval('#obLat', e => e.value = '57.71'); await page.$eval('#obLon', e => e.value = '11.97');
  await click('[data-act="ob-next"]'); await wait(300);
  L.assert((await L.count(page, '[data-act="ob-bortle"]')) > 0,
    'Continue works with a toast sitting over it');
  await shot('r08-onboard-under-toast');
  await click('[data-act="ob-bortle"][data-b="6"]'); await wait(200);
  await click('[data-act="ob-next"]'); await wait(300);
  await click('[data-act="ob-done"]'); await wait(400);
  L.assert(await V('#app'), 'onboarding finished');

  /* ---------- 2. calibration lands without wiping Settings ---------- */
  // Straight into Settings while the year is still being measured.
  await click('#setBtn'); await wait(250);
  const beforeBar = await page.evaluate(() => Store.settings().alerts.min);
  await page.evaluate(() => { const n = document.querySelector('#importNote'); if (n) n.textContent = 'Imported 3 entries and 3 places.'; });
  await page.waitForFunction(() => Store.settings().alerts.tunedFor != null, { timeout: 30000 });
  await wait(500);
  const afterBar = await page.evaluate(() => Store.settings().alerts.min);
  const noteAfter = await text('#importNote');
  log('bar before calibration', beforeBar, 'after', afterBar, 'note kept:', JSON.stringify(noteAfter));
  L.assert(await V('#page') && /Alerts/i.test(await text('#pageBody')), 'Settings still open');
  L.assert(noteAfter === 'Imported 3 entries and 3 places.', 'calibration did not wipe what the page was showing');
  L.assert((await page.$eval('#minS', e => parseFloat(e.value))) === afterBar, 'the slider moved to the calibrated bar');
  L.assert((await text('#minV')).trim() === afterBar.toFixed(1), 'the label moved with it');
  await shot('r08-settings-calibrated');
  await page.evaluate(() => App.back()); await wait(250);

  /* ---------- 3. one unbroken run of characters wraps everywhere ---------- */
  const RUN = 'Q'.repeat(60);
  await L.seed(page, L.v100({
    places: [{ id: 'pl1', name: RUN.slice(0, 40), lat: 57.71, lon: 11.97, bortle: 6 },
             { id: 'pl2', name: 'W'.repeat(40), lat: 57.05, lon: 12.65, bortle: 4 }],
    homeId: 'pl1', compareId: 'pl2',
    log: [{ id: 'lg1', at: L.DEC - 86400000, nightOf: L.DEC - 86400000, placeId: 'pl1',
            phenomena: ['peak'], note: RUN + ' ' + RUN, ctx: { score: 8.1, lm: 6.3, moon: 0.11, bortle: 6, top: 'Perseids' } }],
    reminders: {}
  }), { native: true, now: L.DEC }); await wait(1200);

  const wide = async (where) => {
    const bad = await page.evaluate(() => {
      const out = [];
      if (document.documentElement.scrollWidth > innerWidth + 1) out.push('document ' + document.documentElement.scrollWidth);
      for (const e of document.querySelectorAll('body *')) {
        if (e.closest('[hidden]') || !e.getClientRects().length) continue;
        const cs = getComputedStyle(e);
        // anything that clips or scrolls on purpose (the ellipsised place name, the filter bar)
        if (cs.overflowX !== 'visible') continue;
        if (e.scrollWidth > e.clientWidth + 1 && e.clientWidth > 0)
          out.push(e.tagName.toLowerCase() + '.' + (typeof e.className === 'string' ? e.className.trim().split(/\s+/).join('.') : '') +
                   ' ' + e.scrollWidth + '>' + e.clientWidth);
      }
      return out;
    });
    L.assert(!bad.length, 'sideways overflow on ' + where + ': ' + bad.slice(0, 5).join('; '));
  };

  await wide('tonight with a 40 character name');
  await shot('r08-long-tonight');
  await click('.tab[data-view="places"]'); await wait(600); await wide('places');
  await page.evaluate(() => { document.querySelector('#v-places').scrollTop = 400; }); await wait(250);
  await shot('r08-long-places');
  await click('[data-act="delplace"][data-id="pl2"]'); await wait(400);
  await wide('remove sheet with a long name');
  await shot('r08-long-remove');
  await page.evaluate(() => App.back()); await wait(200);
  await click('.tab[data-view="log"]'); await wait(600); await wide('log');
  await page.evaluate(() => { const v = document.querySelector('#v-log'); v.scrollTop = v.scrollHeight; }); await wait(300);
  await wide('log entries');
  await shot('r08-long-log');
  await click('[data-act="entry"]'); await wait(400); await wide('entry sheet');
  await shot('r08-long-entry');
  await page.evaluate(() => App.back()); await wait(200);
  await click('.tab[data-view="events"]');
  await page.waitForFunction(() => document.querySelectorAll('#eventsBody .row').length > 3, { timeout: 30000 }); await wait(400);
  await wide('events lede with a long place name');
  await click('#eventsBody .row'); await wait(500); await wide('event page');
  await page.evaluate(() => App.back()); await wait(200);
  await click('#setBtn'); await wait(900);
  await page.waitForFunction(() => !/Working out/.test((document.querySelector('#ceilNote') || {}).textContent || ''), { timeout: 25000 });
  await wide('settings ceiling note with a long place name');
  await shot('r08-long-settings');
  log('errors:', errors.length);
};
