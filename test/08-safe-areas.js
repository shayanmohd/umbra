/* Every screen with a 48px status bar and a 34px navigation bar. Nothing may sit under either. */
const { seed, assert, v100Record, DEC } = require('./lib');
module.exports = async ({ page, shot, wait, click, errors, log }) => {
  const SAT = 48, SAB = 34, H = 844;
  await seed(page, v100Record(), { native: true, now: DEC, insets: [SAT, SAB] });
  await wait(900);

  /* Any element with visible text whose box crosses into a bar is a failure. */
  const check = async (label) => {
    const bad = await page.evaluate((SAT, SAB, H) => {
      const out = [];
      const vis = el => { const s = getComputedStyle(el); return s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0.05; };
      for (const el of document.querySelectorAll('button, input, textarea, h1, h3, p, b, i, span, canvas, label')) {
        if (!vis(el) || el.closest('[hidden]')) continue;
        if (!(el.innerText || '').trim() && el.tagName !== 'CANVAS' && el.tagName !== 'INPUT' && el.tagName !== 'BUTTON') continue;
        let r = el.getBoundingClientRect();
        if (r.height < 4 || r.width < 4) continue;
        // What is actually visible: the rect clipped by every scrolling ancestor.
        let top = r.top, bottom = r.bottom, n = el.parentElement;
        while (n && n !== document.body) {
          const o = getComputedStyle(n).overflowY;
          if (o === 'auto' || o === 'scroll' || o === 'hidden') { const c = n.getBoundingClientRect(); top = Math.max(top, c.top); bottom = Math.min(bottom, c.bottom); }
          n = n.parentElement;
        }
        if (bottom - top < 2) continue;
        // Only care about things pinned near the edges; scrolled content passes behind fixed bars by design.
        const fixed = (() => { let n = el; while (n && n !== document.body) { const p = getComputedStyle(n).position; if (p === 'fixed' || p === 'sticky') return n; n = n.parentElement; } return null; })();
        if (top < SAT && bottom > 0 && fixed) out.push('top: ' + el.tagName + ' "' + (el.innerText || el.id || '').slice(0, 30) + '" at ' + Math.round(top));
        if (bottom > H - SAB && top < H && fixed) out.push('bottom: ' + el.tagName + ' "' + (el.innerText || el.id || '').slice(0, 30) + '" at ' + Math.round(bottom));
      }
      return out;
    }, SAT, SAB, H);
    if (bad.length) log(label, 'UNDER A BAR:', bad.join(' ; '));
    assert(!bad.length, label + ': nothing under the bars');
  };

  await shot('08-tonight'); await check('tonight');
  await click('.tab[data-view="events"]');
  await page.waitForFunction(() => document.querySelectorAll('#eventsBody .row').length > 3, { timeout: 20000 });
  await wait(300);
  await shot('08-events'); await check('events');
  await click('#eventsBody .row'); await wait(500);
  await shot('08-event-page'); await check('event page');
  await page.evaluate(() => window.App.back());
  await click('.tab[data-view="places"]'); await wait(400);
  await shot('08-places'); await check('places');
  await click('[data-act="addplace"]'); await wait(300);
  await shot('08-sheet'); await check('place sheet');
  await page.evaluate(() => window.App.back());
  await click('.tab[data-view="log"]'); await wait(300);
  await shot('08-log'); await check('log');
  await click('#logBody [data-act="log-new"]'); await wait(300);
  await page.evaluate(() => { const b = document.querySelector('.sheet-panel'); b.scrollTop = 9999; });
  await wait(200);
  await shot('08-log-sheet-bottom'); await check('log sheet');
  await page.evaluate(() => window.App.back());
  await click('#setBtn'); await wait(500);
  await shot('08-settings'); await check('settings');
  await page.evaluate(() => { const b = document.querySelector('#page .pagescroll'); b.scrollTop = 99999; });
  await wait(200);
  await shot('08-settings-bottom'); await check('settings bottom');
  await page.evaluate(() => window.App.back());
  await page.evaluate(() => window.App.toast('A toast, above the bar'));
  await wait(150);
  await shot('08-toast'); await check('toast');

  await seed(page, null, { native: true, insets: [SAT, SAB] });
  await wait(300);
  await shot('08-onboard'); await check('onboarding');
  log('errors:', errors.length);
};
