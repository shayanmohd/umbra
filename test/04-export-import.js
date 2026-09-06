/* Export through Native.saveFile and through the browser download, then import it back. */
const { seed, raw, assert, v100Record, DEC, KEY } = require('./lib');
module.exports = async ({ page, shot, wait, click, text, errors, log }) => {

  /* Native path. */
  await seed(page, v100Record(), { native: true, now: DEC });
  await wait(600);
  await click('.tab[data-view="log"]');
  await wait(300);
  await click('[data-act="export"]');
  await wait(300);
  const saved = await page.evaluate(() => window.__native.saved);
  assert(saved.length === 1, 'one file handed to the shell');
  assert(saved[0].mime === 'application/json' && /^umbra-log-\d{4}-\d\d-\d\d\.json$/.test(saved[0].name), 'name and mime: ' + saved[0].name);
  const nativeJson = Buffer.from(saved[0].b64, 'base64').toString('utf8');
  const exp = JSON.parse(nativeJson);
  assert(exp.app === 'Umbra' && exp.places.length === 2 && exp.log.length === 2, 'export carries places and log');
  assert(exp.log[0].place === 'The field at Onnered' || exp.log[1].place === 'The field at Onnered', 'export names the place on each entry');
  assert(exp.lifeList.tle && exp.lifeList.peak, 'export carries the life list');
  assert(/Saved/.test(await text('#toast')), 'toast confirms the save');
  await shot('04-export-native');

  /* Browser path: capture the anchor click and read the blob. */
  await seed(page, v100Record(), { native: false, now: DEC });
  await wait(600);
  await page.evaluate(() => {
    window.__dl = [];
    HTMLAnchorElement.prototype.click = function () {
      const a = this;
      window.__dl.push(fetch(a.href).then(r => r.text()).then(t => ({ name: a.download, text: t })));
    };
  });
  await click('#setBtn');
  await wait(700);
  await click('[data-act="export"]');
  await wait(600);
  const dl = await page.evaluate(() => Promise.all(window.__dl));
  assert(dl.length === 1 && dl[0].name.endsWith('.json'), 'browser download produced a json file');
  const browserJson = JSON.parse(dl[0].text);
  assert(browserJson.log.length === 2 && browserJson.places.length === 2, 'browser export complete');
  assert(JSON.stringify(browserJson.places) === JSON.stringify(exp.places), 'both paths export the same places');
  assert(/Downloaded/.test(await text('#toast')), 'toast confirms the download');

  /* Import: wipe, then bring the file back. */
  await seed(page, v100Record({ places: [{ id: 'plx', name: 'Oslo', lat: 59.91, lon: 10.75, bortle: 7 }], homeId: 'plx', compareId: null, log: [], reminders: {} }), { native: false, now: DEC });
  await wait(600);
  assert((await raw(page)).log.length === 0, 'starting from an empty log');
  await click('#setBtn');
  await wait(700);
  assert(!!(await page.$('[data-act="import"]')), 'an import control exists in Settings');
  await click('[data-act="import"]');
  await wait(200);
  const input = await page.$('#importFile');
  assert(input, 'import uses a file input');
  // Hand it the native export as a file.
  const fs = require('fs'), path = require('path');
  const tmp = path.join(require('os').tmpdir(), 'umbra-export-test.json');
  fs.writeFileSync(tmp, nativeJson);
  await input.uploadFile(tmp);
  await wait(800);
  await shot('04-import-done');
  const after = await raw(page);
  assert(after.log.length === 2, 'both entries imported, got ' + after.log.length);
  assert(after.places.length === 3, 'imported places added beside the existing one, got ' + after.places.length);
  assert(after.homeId === 'plx', 'import does not steal the home place');
  assert(/2 entries|imported/i.test(await page.$eval('#pageBody', e => e.innerText)), 'inline confirmation of what was imported');
  // Importing the same file again adds nothing.
  await click('[data-act="import"]');
  await wait(200);
  await (await page.$('#importFile')).uploadFile(tmp);
  await wait(800);
  const again = await raw(page);
  assert(again.log.length === 2 && again.places.length === 3, 'a second import is idempotent');
  // Life list picks up the imported entries.
  await page.evaluate(() => window.App.back());
  await click('.tab[data-view="log"]');
  await wait(300);
  assert(/Total lunar eclipse/.test(await text('#logBody')), 'imported entries show in the log');

  // A wrong file is refused inline, not with an alert.
  const badf = path.join(require('os').tmpdir(), 'umbra-bad.json');
  fs.writeFileSync(badf, '{"hello": "world"}');
  await click('#setBtn');
  await wait(700);
  await click('[data-act="import"]');
  await wait(200);
  await (await page.$('#importFile')).uploadFile(badf);
  await wait(600);
  await shot('04-import-bad');
  assert(/not an Umbra export|could not read/i.test(await page.$eval('#pageBody', e => e.innerText)), 'bad file refused inline');
  assert((await raw(page)).log.length === 2, 'bad file changed nothing');
  log('errors:', errors.length);
};
