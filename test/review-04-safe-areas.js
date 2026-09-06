/* --sat: 48px and --sab: 34px on every screen: nothing sits under either bar. */
const L = require('./review-lib');
module.exports = async ({ page, shot, wait, click, errors, log }) => {
  const rec = L.v100();
  const H = 844, SAT = 48, SAB = 34;
  const probe = () => page.evaluate(() => {
    const H = innerHeight;
    const rb = e => { const b = e.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom) }; };
    const out = {};
    const app = document.getElementById('app'), pg = document.getElementById('page'), ob = document.getElementById('onboard'), sh = document.getElementById('sheet');
    if (!app.hidden) {
      out.placeTop = rb(document.getElementById('placeBtn')).top;
      out.setBtnTop = rb(document.getElementById('setBtn')).top;
      out.tabBottom = Math.max(...[...document.querySelectorAll('.tab')].map(t => rb(t).bottom));
      const v = document.querySelector('.view:not([hidden])');
      out.viewTop = rb(v).top; out.viewBottom = rb(v).bottom;
      out.topbarBottom = rb(document.getElementById('topbar')).bottom;
      const sticky = v.querySelector('.filterbar'); if (sticky) out.filterTop = rb(sticky).top;
    }
    if (!pg.hidden) {
      out.backTop = rb(document.getElementById('pageBack')).top;
      out.pageScrollBottom = rb(pg.querySelector('.pagescroll')).bottom;
      out.pageScrollTop = rb(pg.querySelector('.pagescroll')).top;
    }
    if (!ob.hidden) {
      out.obFirstTop = rb(ob.querySelector('#onboardBody').firstElementChild).top;
      out.obScrollBottom = rb(ob.querySelector('.pagescroll')).bottom;
    }
    if (!sh.hidden) {
      const p = sh.querySelector('.sheet-panel'); out.sheetBottom = rb(p).bottom;
      const last = sh.querySelector('.sheet-body').lastElementChild; out.sheetLastBottom = rb(last).bottom;
      out.sheetAtEnd = p.scrollTop + p.clientHeight >= p.scrollHeight - 2;
    }
    const t = document.getElementById('toast'); if (!t.hidden) out.toastBottom = rb(t).bottom;
    return out;
  });
  const check = async (name) => {
    const m = await probe();
    log(name, JSON.stringify(m));
    if (m.placeTop != null) { L.assert(m.placeTop >= SAT, name + ': place button under the status bar'); L.assert(m.setBtnTop >= SAT, name + ': settings button under the status bar'); }
    if (m.tabBottom != null) L.assert(m.tabBottom <= H - SAB, name + ': tab buttons under the navigation bar');
    if (m.viewBottom != null) L.assert(m.viewBottom <= H - SAB - 50 && m.viewTop >= SAT + 50, name + ': scroll view overlaps a bar');
    if (m.filterTop != null) L.assert(m.filterTop >= SAT + 50, name + ': filter bar under the top bar');
    if (m.backTop != null) { L.assert(m.backTop >= SAT, name + ': Back button under the status bar'); L.assert(m.pageScrollBottom <= H - SAB, name + ': page scroll runs under the navigation bar'); }
    if (m.obFirstTop != null) { L.assert(m.obFirstTop >= SAT, name + ': onboarding under the status bar'); L.assert(m.obScrollBottom <= H - SAB, name + ': onboarding under the navigation bar'); }
    if (m.sheetBottom != null) { L.assert(m.sheetBottom <= H - SAB, name + ': sheet panel under the navigation bar'); if (m.sheetAtEnd) L.assert(m.sheetLastBottom <= H - SAB, name + ': sheet content under the navigation bar'); }
    if (m.toastBottom != null) L.assert(m.toastBottom <= H - SAB - 50, name + ': toast under the tab bar');
    await shot('r04-' + name);
  };
  const toEnd = sel => page.evaluate(s => { const e = document.querySelector(s); e.scrollTop = e.scrollHeight; }, sel);

  await L.seed(page, rec, { native: true, now: L.DEC, insets: [SAT, SAB] }); await wait(900);
  await check('tonight');
  await toEnd('#v-tonight'); await wait(200); await check('tonight-end');
  await click('.tab[data-view="events"]');
  await wait(60); await check('events-loading');
  await page.waitForFunction(() => document.querySelectorAll('#eventsBody .row').length > 3, { timeout: 30000 }); await wait(400);
  await check('events');
  await click('#eventsBody .row'); await wait(450); await check('event-page');
  await toEnd('#page .pagescroll'); await wait(200); await check('event-page-end');
  await click('#pageBody [data-act="log-new"]'); await wait(350); await check('sheet-over-page');
  await page.evaluate(() => App.back()); await page.evaluate(() => App.back()); await wait(200);
  await click('.tab[data-view="places"]'); await wait(400); await check('places');
  await click('[data-act="addplace"]'); await wait(350); await check('sheet-place');
  await page.evaluate(() => { const p = document.querySelector('.sheet-panel'); p.scrollTop = p.scrollHeight; }); await wait(200); await check('sheet-place-end');
  await page.evaluate(() => App.back()); await wait(200);
  await click('.tab[data-view="log"]'); await wait(400); await check('log');
  await click('[data-act="entry"]'); await wait(350); await check('sheet-entry');
  await page.evaluate(() => { const p = document.querySelector('.sheet-panel'); p.scrollTop = p.scrollHeight; }); await wait(200); await check('sheet-entry-end');
  await page.evaluate(() => App.back()); await wait(200);
  await click('#setBtn'); await wait(700); await check('settings');
  await toEnd('#page .pagescroll'); await wait(200); await check('settings-end');
  await click('[data-act="method"]'); await wait(400); await check('method');
  await page.evaluate(() => App.back()); await page.evaluate(() => App.back()); await wait(200);
  await page.evaluate(() => App.toast('Saved to Downloads')); await wait(150); await check('toast');
  await click('#redBtn'); await wait(400); await check('red');
  await click('#redBtn'); await wait(200);

  await L.seed(page, null, { native: true, insets: [SAT, SAB] }); await wait(300);
  await check('onboard-0');
  await toEnd('#onboard .pagescroll'); await wait(200); await check('onboard-0-end');
  await page.$eval('#obLat', e => e.value = '57.7'); await page.$eval('#obLon', e => e.value = '12');
  await click('[data-act="ob-next"]'); await wait(250); await check('onboard-1');
  await click('[data-act="ob-bortle"][data-b="6"]'); await wait(150); await click('[data-act="ob-next"]'); await wait(250); await check('onboard-2');
  log('errors:', errors.length);
};
