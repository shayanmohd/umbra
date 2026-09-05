/* Umbra. One localStorage record on this device holds every byte of state.
   Nothing is uploaded, because the app has no way to reach a network.        */
const Store = (() => {
  const KEY = 'umbra.v1';

  const DEFAULTS = {
    places: [],
    homeId: null,
    compareId: null,
    log: [],                 // { id, at, nightOf, placeId, phenomena[], note, ctx{} }
    reminders: {},           // event key -> true
    settings: {
      clock24: true,
      red: 'off',            // off | on | auto
      alerts: {
        on: false,
        min: 7.5,            // the score at which a night is worth telling you about
        hour: 18,            // when the evening heads up lands, on the place's clock
        eclipses: true,
        digest: true
      },
      seenIntro: false
    },
    firstRun: null
  };

  let db = load();

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return clone(DEFAULTS);
      const d = JSON.parse(raw);
      const s = Object.assign(clone(DEFAULTS.settings), d.settings || {});
      s.alerts = Object.assign(clone(DEFAULTS.settings.alerts), (d.settings || {}).alerts || {});
      return {
        places: Array.isArray(d.places) ? d.places.filter(validPlace) : [],
        homeId: d.homeId || null,
        compareId: d.compareId || null,
        log: Array.isArray(d.log) ? d.log : [],
        reminders: d.reminders && typeof d.reminders === 'object' ? d.reminders : {},
        settings: s,
        firstRun: d.firstRun || null
      };
    } catch (e) { return clone(DEFAULTS); }
  }
  function validPlace(p) {
    return p && typeof p.lat === 'number' && typeof p.lon === 'number' &&
           isFinite(p.lat) && isFinite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {} }

  const uid = p => p + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);

  /* ---------- places ---------- */
  const places = () => db.places.slice();
  const place = id => db.places.find(p => p.id === id) || null;
  function home() { return place(db.homeId) || db.places[0] || null; }
  function addPlace(o) {
    const p = { id: uid('pl'), name: (o.name || 'Unnamed place').slice(0, 40),
                lat: +(+o.lat).toFixed(4), lon: +(+o.lon).toFixed(4),
                bortle: Math.min(9, Math.max(1, Math.round(o.bortle || 6))) };
    db.places.push(p);
    if (!db.homeId) db.homeId = p.id;
    if (!db.firstRun) db.firstRun = Date.now();
    save();
    return p;
  }
  function patchPlace(id, o) { const p = place(id); if (!p) return; Object.assign(p, o); save(); }
  function removePlace(id) {
    db.places = db.places.filter(p => p.id !== id);
    if (db.homeId === id) db.homeId = db.places[0] ? db.places[0].id : null;
    if (db.compareId === id) db.compareId = null;
    save();
  }
  function setHome(id) { db.homeId = id; save(); }
  function setCompare(id) { db.compareId = id === db.compareId ? null : id; save(); }
  const compare = () => place(db.compareId);

  /* ---------- the log and the life list ---------- */
  const log = () => db.log.slice().sort((a, b) => b.at - a.at);
  function addEntry(o) {
    const e = { id: uid('lg'), at: o.at || Date.now(), nightOf: o.nightOf || null,
                placeId: o.placeId || db.homeId, phenomena: (o.phenomena || []).slice(0, 12),
                note: (o.note || '').slice(0, 600), ctx: o.ctx || {} };
    db.log.push(e);
    if (!db.firstRun) db.firstRun = Date.now();
    save();
    return e;
  }
  function patchEntry(id, o) { const e = db.log.find(x => x.id === id); if (!e) return; Object.assign(e, o); save(); }
  function removeEntry(id) { db.log = db.log.filter(e => e.id !== id); save(); }

  /** Every phenomenon you have logged, with the first time and the count. */
  function ticks() {
    const out = {};
    for (const e of db.log) for (const ph of e.phenomena) {
      const t = out[ph] || (out[ph] = { count: 0, first: e.at, last: e.at });
      t.count++;
      t.first = Math.min(t.first, e.at);
      t.last = Math.max(t.last, e.at);
    }
    return out;
  }
  function stats() {
    const t = ticks();
    const total = Object.keys(Data.LIFE_INDEX).length;
    const got = Object.keys(t).length;
    const year = new Date().getFullYear();
    const nights = new Set(db.log.filter(e => new Date(e.at).getFullYear() === year)
      .map(e => new Date(e.nightOf || e.at).toDateString())).size;
    return { got, total, nights, entries: db.log.length };
  }

  /* ---------- reminders ---------- */
  const reminded = k => !!db.reminders[k];
  function toggleReminder(k) { if (db.reminders[k]) delete db.reminders[k]; else db.reminders[k] = true; save(); return !!db.reminders[k]; }

  /* ---------- settings ---------- */
  const settings = () => db.settings;
  function set(k, v) { db.settings[k] = v; save(); }
  function setAlert(k, v) { db.settings.alerts[k] = v; save(); }

  /* ---------- export ---------- */
  function exportJson() {
    return JSON.stringify({
      app: 'Umbra', version: 1, exported: new Date().toISOString(),
      note: 'Written on your device. Nothing was uploaded to produce this file.',
      places: db.places, log: db.log.map(e => ({ ...e, place: (place(e.placeId) || {}).name || null })),
      lifeList: ticks()
    }, null, 2);
  }
  function eraseAll() { db = clone(DEFAULTS); save(); }

  return { places, place, home, addPlace, patchPlace, removePlace, setHome, setCompare, compare,
           log, addEntry, patchEntry, removeEntry, ticks, stats,
           reminded, toggleReminder, settings, set, setAlert, exportJson, eraseAll,
           get raw() { return db; } };
})();
