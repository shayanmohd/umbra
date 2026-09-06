/* The reviewer's own contrast sweep. Rather than a list of selectors, this walks every element
   that actually paints text on the screen, composites the translucent layers above it down to
   the page background (taking the lightest stop of any gradient, the worst case for light text
   on a dark ground), and measures every one. It also reads the rendered text of every screen
   back and fails on an em dash, an en dash or an exclamation mark in copy a user can see. */
const L = require('./review-lib');

const SWEEP = `(() => {
  const parse = s => { const m = s && s.match(/rgba?\\(([^)]+)\\)/); if (!m) return null; const p = m[1].split(',').map(Number); return { c: p.slice(0, 3), a: p.length > 3 ? p[3] : 1 }; };
  const allColours = s => (s.match(/rgba?\\([^)]+\\)/g) || []).map(parse).filter(Boolean);
  const over = (top, under) => top.c.map((v, i) => v * top.a + under[i] * (1 - top.a));
  const lum = ([r, g, b]) => { const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const bgOf = el => {
    const chain = []; for (let e = el; e; e = e.parentElement) chain.unshift(e);
    const rp = parse(getComputedStyle(document.documentElement).backgroundColor);
    let bases = [rp && rp.a > 0 ? rp.c : [0, 0, 0]];
    for (const e of chain) {
      const cs = getComputedStyle(e);
      const layers = [];
      const bc = parse(cs.backgroundColor); if (bc && bc.a > 0) layers.push(bc);
      if (cs.backgroundImage && cs.backgroundImage !== 'none' && /gradient/.test(cs.backgroundImage))
        for (const g of allColours(cs.backgroundImage)) if (g.a > 0) layers.push(g);
      if (!layers.length) continue;
      const next = [];
      for (const b of bases) for (const l of layers) next.push(over(l, b));
      bases = next.slice(0, 16);
    }
    return bases;
  };
  const path = el => { const p = []; for (let e = el; e && e.tagName !== 'BODY'; e = e.parentElement) p.unshift(e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\\s+/).join('.') : '')); return p.slice(-3).join(' > '); };
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest('[hidden]') || el.tagName === 'SVG' || el.tagName === 'CANVAS') continue;
    const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length);
    if (!own) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || +cs.opacity === 0) continue;
    const fg = parse(cs.color); if (!fg || fg.a === 0) continue;
    const size = parseFloat(cs.fontSize), bold = parseInt(cs.fontWeight, 10) >= 700;
    const large = size >= 24 || (bold && size >= 18.66);
    let worst = 99;
    for (const b of bgOf(el)) { const l1 = lum(over(fg, b)), l2 = lum(b); worst = Math.min(worst, (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)); }
    out.push({ p: path(el), ratio: Math.round(worst * 100) / 100, size: size, need: large ? 3 : 4.5,
               text: (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 30) });
  }
  // placeholders, which no text node reaches
  for (const inp of document.querySelectorAll('input[placeholder], textarea[placeholder]')) {
    const r = inp.getBoundingClientRect(); if (r.width < 2 || inp.value) continue;
    const fg = parse(getComputedStyle(inp, '::placeholder').color); if (!fg) continue;
    let worst = 99;
    for (const b of bgOf(inp)) { const l1 = lum(over(fg, b)), l2 = lum(b); worst = Math.min(worst, (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)); }
    out.push({ p: 'placeholder ' + (inp.id || ''), ratio: Math.round(worst * 100) / 100, size: parseFloat(getComputedStyle(inp).fontSize), need: 4.5, text: inp.placeholder });
  }
  return out;
})()`;

module.exports = async ({ page, wait, text, click, errors, log }) => {
  const rec = L.v100();
  const worst = {};
  const copy = {};

  const sweep = async (where) => {
    const rows = await page.evaluate(SWEEP);
    for (const r of rows) {
      const k = r.p + ' | ' + r.text;
      if (!worst[k] || worst[k].ratio > r.ratio) worst[k] = Object.assign({ where }, r);
    }
    const t = (await text('body')) || '';
    copy[where] = t;
  };

  const tour = async (mode) => {
    await click('.tab[data-view="tonight"]'); await wait(600); await sweep(mode + '/tonight');
    await page.evaluate(() => { document.querySelector('#v-tonight').scrollTop = 1400; }); await wait(300); await sweep(mode + '/tonight-low');
    await click('[data-act="happening"]'); await wait(400); await sweep(mode + '/happening'); await page.evaluate(() => App.back()); await wait(150);
    if (await page.$('[data-act="target"]')) { await click('[data-act="target"]'); await wait(350); await sweep(mode + '/target'); await page.evaluate(() => App.back()); await wait(150); }
    await click('[data-act="tomorrow"]'); await wait(500); await sweep(mode + '/tomorrow'); await page.evaluate(() => App.back()); await wait(150);
    await click('.tab[data-view="events"]');
    await page.waitForFunction(() => document.querySelectorAll('#eventsBody .row').length > 3, { timeout: 30000 }); await wait(400);
    await sweep(mode + '/events');
    for (const f of ['shower', 'eclipse', 'planet', 'moon', 'all']) {
      await click('[data-act="filter"][data-id="' + f + '"]'); await wait(300);
      await click('#eventsBody .row'); await wait(500); await sweep(mode + '/event-' + f);
      await page.evaluate(() => { const s = document.querySelector('.pagescroll'); s.scrollTop = s.scrollHeight; }); await wait(250);
      await sweep(mode + '/event-' + f + '-low');
      await page.evaluate(() => App.back()); await wait(180);
    }
    await click('[data-act="filter"][data-id="hi"]'); await wait(250);
    await click('.tab[data-view="places"]'); await wait(500); await sweep(mode + '/places');
    await page.evaluate(() => { document.querySelector('#v-places').scrollTop = 700; }); await wait(300); await sweep(mode + '/places-low');
    await click('[data-act="addplace"]'); await wait(400); await sweep(mode + '/place-sheet');
    await click('[data-act="saveplace"]'); await wait(300); await sweep(mode + '/place-error');
    await page.type('#pCity', 'gothen'); await wait(300); await sweep(mode + '/city-hits');
    await page.evaluate(() => App.back()); await wait(200);
    await click('.tab[data-view="log"]'); await wait(500); await sweep(mode + '/log');
    await page.evaluate(() => { document.querySelector('#v-log').scrollTop = 900; }); await wait(300); await sweep(mode + '/log-low');
    await click('#logBody [data-act="log-new"]'); await wait(400); await sweep(mode + '/log-sheet');
    await click('[data-act="save-log"]'); await wait(300); await sweep(mode + '/log-error');
    await page.evaluate(() => App.back()); await wait(200);
    await click('[data-act="entry"]'); await wait(400); await sweep(mode + '/entry-sheet'); await page.evaluate(() => App.back()); await wait(200);
    await click('[data-act="life"]'); await wait(400); await sweep(mode + '/life-sheet'); await page.evaluate(() => App.back()); await wait(200);
    await click('#setBtn'); await wait(900);
    await page.waitForFunction(() => !/Working out/.test((document.querySelector('#ceilNote') || {}).textContent || ''), { timeout: 20000 });
    await sweep(mode + '/settings');
    await page.evaluate(() => { const s = document.querySelector('.pagescroll'); s.scrollTop = s.scrollHeight; }); await wait(300); await sweep(mode + '/settings-low');
    await click('[data-act="erase"]'); await wait(350); await sweep(mode + '/erase-sheet'); await page.evaluate(() => App.back()); await wait(200);
    await click('[data-act="method"]'); await wait(500); await sweep(mode + '/method');
    await page.evaluate(() => { const s = document.querySelector('.pagescroll'); s.scrollTop = s.scrollHeight; }); await wait(300); await sweep(mode + '/method-low');
    await page.evaluate(() => { App.back(); App.back(); }); await wait(250);
    await page.evaluate(() => App.toast('Saved to Downloads')); await wait(200); await sweep(mode + '/toast');
  };

  /* The fixture keeps red on auto, which at 20:40 in December is red. Both palettes are
     forced explicitly so neither tour silently measures the other one. */
  await L.seed(page, rec, { native: true, now: L.DEC }); await wait(1000);
  await page.evaluate(() => { Store.set('red', 'off'); App.applyRed(); }); await wait(300);
  await tour('night');
  await page.evaluate(() => { Store.set('red', 'on'); App.applyRed(); }); await wait(300);
  await tour('red');

  // The empty states and onboarding, which the seeded record never shows.
  await L.seed(page, { places: [{ id: 'p', name: 'Home', lat: 57.7, lon: 12, bortle: 6 }], homeId: 'p',
    log: [], reminders: {}, settings: { clock24: true, red: 'off', alerts: { on: false, min: 7.5, hour: 18, eclipses: true, digest: true }, seenIntro: true },
    firstRun: 1 }, { native: true, now: L.DEC }); await wait(900);
  await click('.tab[data-view="log"]'); await wait(500); await sweep('night/log-empty');
  await click('.tab[data-view="events"]');
  await page.waitForFunction(() => document.querySelectorAll('#eventsBody .row').length > 3, { timeout: 30000 });
  await click('[data-act="filter"][data-id="eclipse"]'); await wait(400); await sweep('night/events-eclipse');
  await L.seed(page, null, { native: true, now: L.DEC }); await wait(500);
  await sweep('night/onboard-0');
  await click('[data-act="ob-next"]'); await wait(300); await sweep('night/onboard-0-error');
  await page.$eval('#obLat', e => e.value = '57.7'); await page.$eval('#obLon', e => e.value = '12');
  await click('[data-act="ob-next"]'); await wait(350); await sweep('night/onboard-1');
  await click('[data-act="ob-bortle"][data-b="6"]'); await wait(200);
  await click('[data-act="ob-next"]'); await wait(350); await sweep('night/onboard-2');

  const rows = Object.values(worst).sort((a, b) => a.ratio - b.ratio);
  const fails = rows.filter(r => r.ratio < r.need);
  for (const r of rows.slice(0, 14))
    log((r.ratio < r.need ? 'FAIL ' : 'ok   ') + r.ratio.toFixed(2) + ' (need ' + r.need + ', ' + r.size + 'px) ' +
        r.where + ' ' + r.p + '  "' + r.text + '"');
  log('swept', rows.length, 'distinct text elements across', Object.keys(copy).length, 'screens; failing:', fails.length);
  L.assert(!fails.length, 'contrast below AA: ' +
    fails.slice(0, 8).map(r => r.where + ' ' + r.p + ' = ' + r.ratio).join(' | '));

  // Copy rules, read off the rendered screens rather than the source.
  const bad = [];
  for (const [where, t] of Object.entries(copy)) {
    for (const m of t.match(/[^\n]*[—–!][^\n]*/g) || []) bad.push(where + ': ' + m.trim().slice(0, 70));
  }
  L.assert(!bad.length, 'em dash, en dash or exclamation mark on screen: ' + bad.slice(0, 6).join(' | '));
  log('copy sweep clean across', Object.keys(copy).length, 'screens');
  log('errors:', errors.length);
};
