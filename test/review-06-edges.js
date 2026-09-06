/* Edges: double taps on every primary button, long and hostile inputs, export and import both
   ways, the notification schedule's limits, and a fast tour of every screen. */
const L = require('./review-lib');
module.exports = async ({ page, shot, wait, text, click, type, errors, log }) => {
  const rec = L.v100();
  await L.seed(page, rec, { native: true, now: L.DEC }); await wait(900);
  const V = s => L.vis(page, s);

  /* Double taps. */
  await L.dtap(page, '.tab[data-view="places"]'); await wait(400);
  L.assert(await V('#v-places'), 'double tap on a tab lands on it');
  await L.dtap(page, '[data-act="addplace"]'); await wait(400);
  L.assert(await V('#sheet') && (await L.count(page, '#sheetBody #pName')) === 1, 'double tap on Add opens one sheet');
  await page.$eval('#pName', e => e.value = 'Twice'); await page.$eval('#pLat', e => e.value = '58'); await page.$eval('#pLon', e => e.value = '12');
  await L.dtap(page, '[data-act="saveplace"]'); await wait(700);
  let r = await L.raw(page);
  L.assert(r.places.filter(p => p.name === 'Twice').length === 1, 'double tap on Save adds one place');
  L.assert(await V('#v-places'), 'second half of the double tap did not switch tabs');
  await L.dtap(page, '[data-act="compare"][data-id="' + r.places[2].id + '"]'); await wait(400);
  r = await L.raw(page);
  L.assert(r.compareId === r.places[2].id, 'double tap on Compare leaves it compared (got ' + r.compareId + ')');
  await L.dtap(page, '.tab[data-view="log"]'); await wait(400);
  await L.dtap(page, '#logBody [data-act="log-new"]'); await wait(400);
  L.assert(await V('#sheet') && (await L.count(page, '#lgNote')) === 1, 'double tap on Log opens one sheet');
  await click('[data-act="ph"][data-id="fire"]');
  await L.dtap(page, '[data-act="save-log"]'); await wait(700);
  r = await L.raw(page);
  L.assert(r.log.length === rec.log.length + 1, 'double tap on Save entry adds one entry');
  L.assert(await V('#v-log'), 'still on Log');
  await L.dtap(page, '[data-act="export"]'); await wait(500);
  const saved = await page.evaluate(() => window.__n.saved.length);
  L.assert(saved === 1, 'double tap on Export writes one file, wrote ' + saved);
  // Short sheets: the second tap lands on the backdrop and must not close what the first opened.
  await L.dtap(page, '[data-act="life"]'); await wait(400);
  L.assert(await V('#sheet') && /First seen|Not on your list/.test(await text('#sheetBody')), 'double tap on a life list item leaves its sheet open');
  await page.evaluate(() => App.back()); await wait(200);
  await click('.tab[data-view="tonight"]'); await wait(500);
  if (await page.$('[data-act="target"]')) {
    await L.dtap(page, '[data-act="target"]'); await wait(400);
    L.assert(await V('#sheet'), 'double tap on a target row leaves its sheet open');
    await page.evaluate(() => App.back()); await wait(200);
  }
  await click('.tab[data-view="events"]');
  await page.waitForFunction(() => document.querySelectorAll('#eventsBody .row').length > 3, { timeout: 30000 }); await wait(300);
  await L.dtap(page, '#eventsBody .row'); await wait(450);
  L.assert(await V('#page') && (await L.count(page, '#pageBody .h1')) === 1, 'double tap on a row opens one page');
  /* The first highlight on this date is the Geminids, which the 1.0.0 fixture already has a
     reminder on, so the right assertion is one flip per double tap, not one more reminder. */
  const rkey = await page.$eval('#pageBody [data-act="remind"]', e => e.dataset.key);
  const rem = () => page.evaluate(k => Store.reminded(k), rkey);
  const was = await rem();
  await L.dtap(page, '[data-act="remind"]'); await wait(600);
  L.assert((await rem()) === !was, 'double tap on Remind me flips it once (' + was + ' to ' + (await rem()) + ')');
  await wait(500);
  await L.dtap(page, '[data-act="remind"]'); await wait(600);
  L.assert((await rem()) === was, 'a second double tap flips it back once');
  L.assert(/^(Remind me|Reminder set)$/.test((await text('#pageBody [data-act=\"remind\"]')).trim()), 'the button label follows the state');
  await L.dtap(page, '#pageBack'); await wait(400);
  L.assert(!(await V('#page')) && (await V('#v-events')), 'double tap on Back closes one page and stays on Events');
  await click('#setBtn'); await wait(700);
  await L.dtap(page, '[data-act="toggle"][data-id="alerts-dig"]'); await wait(500);
  r = await L.raw(page);
  L.assert(r.settings.alerts.digest === !rec.settings.alerts.digest, 'double tap on a switch flips it once');
  await wait(400);
  await click('[data-act="toggle"][data-id="alerts-dig"]'); await wait(300);
  L.assert((await L.raw(page)).settings.alerts.digest === rec.settings.alerts.digest, 'a deliberate second tap later still flips it back');
  await click('[data-act="method"]'); await wait(500);
  await L.dtap(page, '#pageBack'); await wait(500);
  L.assert((await V('#page')) && /Alerts/i.test(await text('#pageBody')), 'double tap on Back over Method leaves Settings open');
  await page.evaluate(() => App.back()); await wait(300);

  /* Hostile inputs. */
  await click('.tab[data-view="places"]'); await wait(400);
  await click('[data-act="addplace"]'); await wait(300);
  const longName = 'Nordkoster'.repeat(4);
  await page.$eval('#pName', e => e.value = 'x'.repeat(80));
  await page.$eval('#pLat', e => e.value = '0'); await page.$eval('#pLon', e => e.value = '0');
  await click('[data-act="saveplace"]'); await wait(700);
  r = await L.raw(page);
  L.assert(r.places.some(p => p.name === 'x'.repeat(40) && p.lat === 0 && p.lon === 0), 'lat 0 lon 0 accepted, name cut to 40');
  await L.noOverflow(page, 'places with a 40 character name');
  await shot('r06-long-name');
  await click('[data-act="addplace"]'); await wait(300);
  for (const [la, lo] of [['abc', '1'], ['', ''], ['90.0001', '0'], ['0', '181'], ['NaN', '0'], ['1e400', '0']]) {
    await page.$eval('#pLat', (e, v) => e.value = v, la); await page.$eval('#pLon', (e, v) => e.value = v, lo);
    await click('[data-act="saveplace"]'); await wait(200);
    L.assert(await V('#sheet'), 'refused ' + la + ',' + lo);
  }
  await page.$eval('#pLat', e => e.value = '-90'); await page.$eval('#pLon', e => e.value = '-180');
  await page.$eval('#pName', e => e.value = '   ');
  await click('[data-act="saveplace"]'); await wait(700);
  r = await L.raw(page);
  L.assert(r.places.some(p => p.name === 'My sky' && p.lat === -90 && p.lon === -180), 'pole accepted with a default name');
  await click('.tab[data-view="tonight"]'); await wait(300);
  await page.evaluate(() => { Store.setHome(Store.places().find(p => p.lat === -90).id); App.renderTonight(); }); await wait(600);
  L.assert((await L.count(page, '#tonightBody .part')) === 4, 'the south pole in December renders');
  await shot('r06-pole');
  await page.evaluate(() => { Store.setHome('plabc123'); });

  await click('.tab[data-view="log"]'); await wait(400);
  await click('#logBody [data-act="log-new"]'); await wait(300);
  await page.$eval('#lgNote', e => e.value = 'Q'.repeat(900));
  await click('[data-act="save-log"]'); await wait(700);
  r = await L.raw(page);
  L.assert(r.log.some(e => e.note.length === 600), 'note cut to 600');
  await L.noOverflow(page, 'log with a long note');

  /* Export and import: the native path, then the browser download, then a round trip. */
  const exp = await page.evaluate(() => { const s = window.__n.saved[0]; return { name: s.name, mime: s.mime, json: decodeURIComponent(escape(atob(s.b64))) }; });
  const parsed = JSON.parse(exp.json);
  L.assert(exp.mime === 'application/json' && /^umbra-log-\d{4}-\d{2}-\d{2}\.json$/.test(exp.name), 'export file name and mime: ' + exp.name);
  L.assert(parsed.app === 'Umbra' && parsed.places.length >= 2 && parsed.log.length >= 2, 'export carries places and log');
  await page.evaluate(() => { delete window.Native; window.__dl = []; const oc = URL.createObjectURL; URL.createObjectURL = b => { const rd = new FileReader(); rd.onload = () => window.__dl.push(rd.result); rd.readAsText(b); return 'blob:fake'; }; HTMLAnchorElement.prototype.click = function () { window.__dlName = this.download; }; });
  await click('[data-act="export"]'); await wait(600);
  const dl = await page.evaluate(() => ({ n: window.__dl.length, name: window.__dlName, ok: window.__dl[0] && JSON.parse(window.__dl[0]).app === 'Umbra' }));
  L.assert(dl.n === 1 && dl.ok && /\.json$/.test(dl.name), 'browser download path works: ' + JSON.stringify(dl));
  const fs = require('fs'), path = require('path');
  const file = path.join(__dirname, 'shots', 'r06-export.json');
  fs.writeFileSync(file, exp.json);
  // Erase, then import that file through the real file input.
  await click('#setBtn'); await wait(600);
  await click('[data-act="erase"]'); await wait(300);
  await click('[data-act="erase-yes"]'); await wait(500);
  L.assert(await V('#onboard') && !(await L.raw(page)).places.length, 'erased back to onboarding');
  await page.$eval('#obLat', e => e.value = '57.71'); await page.$eval('#obLon', e => e.value = '11.97');
  await click('[data-act="ob-next"]'); await wait(200); await click('[data-act="ob-bortle"][data-b="6"]'); await wait(150);
  await click('[data-act="ob-next"]'); await wait(200); await click('[data-act="ob-done"]'); await wait(1200);
  await click('#setBtn'); await wait(600);
  const input = await page.$('#importFile');
  await input.uploadFile(file); await wait(900);
  const note = await text('#importNote');
  log('import note:', JSON.stringify(note), 'inline error:',
      JSON.stringify(await page.$eval('#pageBody', e => { const x = e.querySelector('.err'); return x ? x.textContent : null; })),
      'file bytes:', require('fs').statSync(file).size);
  r = await L.raw(page);
  L.assert(/Imported \d+ entr/.test(note), 'import reports what it did');
  L.assert(r.log.length === parsed.log.length && r.places.length >= parsed.places.length, 'round trip restored ' + r.log.length + ' entries and ' + r.places.length + ' places');
  await shot('r06-imported');
  // A bad file is refused inline.
  const bad = path.join(__dirname, 'shots', 'r06-bad.json'); fs.writeFileSync(bad, '{"app":"Other"}');
  await (await page.$('#importFile')).uploadFile(bad); await wait(500);
  L.assert(await page.$('#pageBody .err'), 'wrong file refused inline');
  await shot('r06-import-err');
  await page.evaluate(() => App.back()); await wait(300);

  /* Notifications: never more than 64, none in the past, recomputed on open. */
  await L.seed(page, Object.assign({}, rec, { settings: { clock24: true, red: 'off', alerts: { on: true, min: 5, minSet: true, hour: 18, eclipses: true, digest: true }, seenIntro: true } }), { native: true, now: L.DEC_PM }); await wait(1500);
  await page.waitForFunction(() => window.__n.sched && window.__n.sched.length > 0, { timeout: 20000 });
  let s = await page.evaluate(() => window.__n.sched);
  log('schedule with the bar at 5:', s.length, 'entries; first', new Date(s[0].at).toISOString(), 'last', new Date(s[s.length - 1].at).toISOString());
  L.assert(s.length <= 64, 'at most 64');
  L.assert(s.every(o => o.at > L.DEC_PM), 'none in the past');
  const days = new Set(s.map(o => Math.floor((o.at + L.GOT) / 86400000)));
  L.assert(days.size === s.length, 'one a day');
  L.assert(s.every(o => o.id >= 0 && o.id < 64 && typeof o.title === 'string' && typeof o.body === 'string'), 'shape the shell expects');
  const night = s.filter(o => { const h = new Date(o.at + L.GOT).getUTCHours(); return h < 6 || h > 22; });
  log('entries that fire between 22:00 and 06:00:', night.length, night.slice(0, 3).map(o => o.title + ' @ ' + new Date(o.at + L.GOT).toISOString().slice(11, 16)));
  L.assert(!/–|—|!/.test(s.map(o => o.title + o.body).join('')), 'no dashes or exclamation marks in notification copy');
  await click('#setBtn'); await wait(700);
  await click('[data-act="toggle"][data-id="alerts-on"]'); await wait(500);
  L.assert((await page.evaluate(() => window.__n.cancelled)) >= 1, 'turning alerts off cancels the schedule');
  await click('[data-act="toggle"][data-id="alerts-on"]'); await wait(800);
  s = await page.evaluate(() => window.__n.sched);
  L.assert(s && s.length > 0, 'turning alerts on schedules again');
  await page.evaluate(() => App.back()); await wait(200);

  /* A fast tour. */
  for (let i = 0; i < 12; i++) for (const v of ['events', 'places', 'log', 'tonight']) await page.evaluate(v => App.setView(v), v);
  await wait(600);
  await click('#setBtn'); await page.evaluate(() => App.back()); await click('#setBtn'); await wait(100); await page.evaluate(() => App.back());
  await wait(500);
  L.assert((await L.count(page, '#tonightBody .part')) === 4, 'Tonight intact after the tour');
  log('errors:', errors.length);
};
