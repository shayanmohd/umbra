/* Measures text against the background it actually sits on, compositing translucent layers and
   taking the lightest stop of any gradient (the worst case for light text). WCAG AA: 4.5 for
   text under 24px, 3.0 for larger text and for control boundaries. Both palettes. */
const L = require('./review-lib');
const SEL = [
  '.placebtn i', '.tab:not(.is-on) span', '.tab.is-on span', '.h1', '.lede', '.h2', '.hero-t .of', '.verdict',
  '.hero-ring .val', '.part .lab', '.part .pct', '.part .sub', '.note', '.tiny', '.striprow div', '.striprow b',
  '.row .when', '.row .when b', '.row .t b', '.row .t i', '.row .r', '.row .r.quiet', '.btn', '.btn.ghost',
  '.chip', '.chip.on', '.badge', '.badge.quiet', '.empty b', '.empty span', '.lifeitem b', '.lifeitem i',
  '.lifeitem .cnt', '.cols dt', '.cols dd', '.cols h4', '.kv dt', '.kv dd', '.field label', '.pick b', '.pick i',
  '.toggle .t b', '.toggle .t i', '.err', '.toast', '.sheet-head b', '.pagebar b', '.grp', '.prose', '.method p',
  '.card h3', '.placehead .tiny', '.skel'
];
module.exports = async ({ page, shot, wait, click, type, errors, log }) => {
  const rec = L.v100();
  await L.seed(page, rec, { native: true, now: L.DEC }); await wait(900);
  const results = {};
  const measure = async (where) => {
    const rows = await page.evaluate((sels) => {
      const lum = ([r, g, b]) => { const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
      const parse = s => { const m = s && s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(',').map(Number); return { c: p.slice(0, 3), a: p.length > 3 ? p[3] : 1 }; };
      const allColours = s => (s.match(/rgba?\([^)]+\)/g) || []).map(parse).filter(Boolean);
      const over = (top, under) => top.c.map((v, i) => v * top.a + under[i] * (1 - top.a));
      const bgOf = el => {
        // collect layers from the root down to the element
        const chain = []; for (let e = el; e; e = e.parentElement) chain.unshift(e);
        let bases = [[7, 11, 21]];
        const root = getComputedStyle(document.documentElement).backgroundColor; const rp = parse(root); if (rp && rp.a > 0) bases = [rp.c];
        for (const e of chain) {
          const cs = getComputedStyle(e);
          const layers = [];
          const bc = parse(cs.backgroundColor); if (bc && bc.a > 0) layers.push(bc);
          if (cs.backgroundImage && cs.backgroundImage !== 'none' && /gradient/.test(cs.backgroundImage) && !/radial-gradient\([^)]*px/.test(cs.backgroundImage))
            for (const g of allColours(cs.backgroundImage)) if (g.a > 0) layers.push(g);
          if (!layers.length) continue;
          const next = [];
          for (const b of bases) for (const l of layers) next.push(over(l, b));
          bases = next.slice(0, 12);
        }
        return bases;
      };
      const out = [];
      for (const s of sels) {
        const el = [...document.querySelectorAll(s)].find(e => e.offsetParent !== null || getComputedStyle(e).position === 'fixed');
        if (!el) continue;
        const cs = getComputedStyle(el);
        const fg = parse(cs.color); if (!fg) continue;
        const size = parseFloat(cs.fontSize), bold = parseInt(cs.fontWeight, 10) >= 700;
        const large = size >= 24 || (bold && size >= 18.66);
        let worst = 99;
        for (const b of bgOf(el)) { const l1 = lum(over(fg, b)), l2 = lum(b); const c = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); worst = Math.min(worst, c); }
        out.push({ s, ratio: +worst.toFixed(2), size, large, need: large ? 3 : 4.5, text: (el.textContent || '').trim().slice(0, 24) });
      }
      // placeholders
      const inp = document.querySelector('.field input[type=text], .field textarea');
      if (inp && inp.offsetParent) {
        const ph = getComputedStyle(inp, '::placeholder'); const fg = parse(ph.color);
        if (fg) { let worst = 99; for (const b of bgOf(inp)) { const l1 = lum(over(fg, b)), l2 = lum(b); worst = Math.min(worst, (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)); } out.push({ s: '::placeholder', ratio: +worst.toFixed(2), size: 16, large: false, need: 4.5, text: inp.placeholder }); }
      }
      return out;
    }, SEL);
    for (const r of rows) { const k = where + ' ' + r.s; if (!results[k] || results[k].ratio > r.ratio) results[k] = r; }
  };
  const tour = async (mode) => {
    await click('.tab[data-view="tonight"]'); await wait(500); await measure(mode + '/tonight');
    await click('.tab[data-view="events"]'); await page.waitForFunction(() => document.querySelectorAll('#eventsBody .row').length > 3, { timeout: 30000 }); await wait(400); await measure(mode + '/events');
    await click('#eventsBody .row'); await wait(450); await measure(mode + '/event'); await page.evaluate(() => App.back()); await wait(120);
    await click('.tab[data-view="places"]'); await wait(400); await measure(mode + '/places');
    await click('[data-act="addplace"]'); await wait(350); await measure(mode + '/sheet'); await page.evaluate(() => App.back()); await wait(120);
    await click('.tab[data-view="log"]'); await wait(400); await measure(mode + '/log');
    await click('#setBtn'); await wait(700); await measure(mode + '/settings');
    await click('[data-act="method"]'); await wait(400); await measure(mode + '/method'); await page.evaluate(() => App.back()); await page.evaluate(() => App.back()); await wait(120);
    await page.evaluate(() => App.toast('Saved to Downloads')); await wait(120); await measure(mode + '/toast');
    // an inline error and the empty states
    await click('.tab[data-view="places"]'); await wait(300); await click('[data-act="addplace"]'); await wait(300); await click('[data-act="saveplace"]'); await wait(200); await measure(mode + '/error'); await page.evaluate(() => App.back()); await wait(120);
  };
  await tour('night');
  await page.evaluate(() => { Store.set('red', 'on'); App.applyRed(); }); await wait(200);
  await tour('red');
  // empty states with a fresh record
  await L.seed(page, { places: [{ id: 'p', name: 'Home', lat: 57.7, lon: 12, bortle: 6 }], homeId: 'p', log: [], reminders: {}, settings: { clock24: true, red: 'off', alerts: { on: false, min: 7.5, hour: 18, eclipses: true, digest: true }, seenIntro: true }, firstRun: 1 }, { native: true, now: L.DEC }); await wait(800);
  await click('.tab[data-view="log"]'); await wait(400); await measure('night/log-empty');

  const rows = Object.entries(results).sort((a, b) => a[1].ratio - b[1].ratio);
  const fails = rows.filter(([k, r]) => r.ratio < r.need);
  for (const [k, r] of rows.slice(0, 40)) log((r.ratio < r.need ? 'FAIL ' : 'ok   ') + r.ratio.toFixed(2) + ' (need ' + r.need + ') ' + k + '  "' + r.text + '"');
  log('measured', rows.length, 'pairs, failing:', fails.length);
  L.assert(!fails.length, 'contrast failures: ' + fails.map(([k, r]) => k + '=' + r.ratio).join(', '));
  log('errors:', errors.length);
};
