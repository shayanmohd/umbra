/* How long the heavy computations take, so jank is measured rather than guessed. */
const { seed, v100Record } = require('./lib');
module.exports = async ({ page, log, wait }) => {
  await seed(page, v100Record());
  await wait(600);
  const t = await page.evaluate(() => {
    const out = {};
    const time = (name, fn) => { const a = performance.now(); const r = fn(); out[name] = Math.round(performance.now() - a); return r; };
    const home = Store.home();
    time('night x1', () => Sky.night(home, Date.now()));
    time('tonight x1', () => Sky.tonight(home, Date.now()));
    time('happenings+score x1', () => { const n = Sky.night(home, Date.now()); Sky.score(n, Sky.happenings(n)); });
    time('plan (45 nights)', () => Notify.plan());
    time('ceiling (42 nights)', () => Notify.ceiling(42));
    time('feed (365 days)', () => Sky.feed(home, Date.now() - 6 * 3600000, 365));
    time('eclipses 120d', () => Astro.eclipses(Astro.jdFromMs(Date.now()), Astro.jdFromMs(Date.now() + 120 * 86400000), home.lat, home.lon));
    return out;
  });
  for (const k in t) log(k.padEnd(24), t[k] + ' ms');
};
