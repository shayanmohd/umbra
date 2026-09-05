/* Umbra's alert engine. It runs here, on the phone, against the same ephemeris the screens use.

   The rule the whole thing rests on: an alert has to be worth the interruption. Umbra sends an
   evening heads up on nights that clear the score you set, one warning per eclipse you can
   actually see, and a Sunday digest. It never sends anything at 3am, because it cannot see the
   weather and a wake up it cannot stand behind is worse than silence.                        */
const Notify = (() => {
  const DAY = 86400000, HOUR = 3600000, MIN = 60000;
  const MAX = 64, HORIZON = 45;      // days computed ahead

  const native = () => (typeof window !== 'undefined' && window.Native && window.Native.scheduleNotifications) ? window.Native : null;

  function allowed() {
    const n = native();
    if (!n || !n.notificationsAllowed) return false;
    try { return !!n.notificationsAllowed(); } catch (e) { return false; }
  }
  function request() {
    const n = native();
    if (n && n.requestNotificationPermission) { try { n.requestNotificationPermission(); } catch (e) {} }
  }

  /** At `hour` on the place's clock, on the day that starts at anchor t0. */
  function atHour(t0, place, hour) {
    const off = Sky.offsetFor(place, t0).ms;
    const local = t0 + off;
    const day = Math.floor(local / DAY) * DAY;
    return day + hour * HOUR - off;
  }

  /** Builds the plan. Pure, so it can be shown on screen before it is handed to the system. */
  function plan(now) {
    now = now || Date.now();
    const s = Store.settings(), a = s.alerts;
    const home = Store.home();
    const out = [];
    if (!home || !a.on) return out;

    const nights = [];
    for (let d = 0; d < HORIZON; d++) {
      const t = now + d * DAY;
      const n = Sky.night(home, t);
      if (nights.some(x => x.n.t0 === n.t0)) continue;
      const hap = Sky.happenings(n);
      nights.push({ n, hap, score: Sky.score(n, hap) });
    }

    for (const row of nights) {
      const fire = atHour(row.n.t0, home, a.hour);
      if (fire < now + 5 * MIN) continue;
      if (row.score.value < a.min) continue;
      const top = row.score.top;
      out.push({ at: fire, kind: 'night', score: row.score.value,
        title: 'Tonight scores ' + row.score.value.toFixed(1) + ' from ' + home.name,
        body: row.score.verdict + ' ' + (top ? top.title + ', best around ' + clock(row.score.bestAt, home) + '.' : '')
              + ' Clouds are the one thing Umbra cannot see.' });
    }

    if (a.eclipses) {
      for (const e of Astro.eclipses(Astro.jdFromMs(now), Astro.jdFromMs(now + 120 * DAY), home.lat, home.lon)) {
        if (!e.local) continue;
        const at = Astro.msFromJd(e.jd);
        const solar = e.kind === 'solar';
        const start = e.local.start ? Astro.msFromJd(e.local.start) : at;
        const fire = Math.max(now + 5 * MIN, start - 45 * MIN);
        if (fire > now) {
          out.push({ at: fire, kind: 'eclipse', score: 10,
            title: (solar ? 'Solar' : 'Lunar') + ' eclipse from ' + home.name + ' in 45 minutes',
            body: solar
              ? e.local.type + ', ' + Math.round(e.local.obscuration * 100) + ' per cent covered at most. Never look at the Sun without a proper filter.'
              : e.local.type + ', with the Moon ' + Math.round(e.local.moonAlt) + ' degrees up. No equipment needed.' });
        }
        const heads = at - 3 * DAY;
        if (heads > now + HOUR) {
          out.push({ at: atHour(Sky.anchorFor(heads, home), home, a.hour), kind: 'eclipse-heads', score: 9,
            title: 'Eclipse in three days', body: e.local.type + ' ' + (solar ? 'solar' : 'lunar') +
              ' eclipse, visible from ' + home.name + '. Worth deciding now where you will stand.' });
        }
      }
    }

    /* The Sunday digest only goes out when the week actually holds something: a named event,
       or a night clearly better than the ordinary. A weekly note that says nothing is how
       an app teaches people to ignore it. */
    if (a.digest) {
      const off = Sky.offsetFor(home, now).ms;
      const today = Math.floor((now + off) / DAY);
      const dow = new Date((today * DAY)).getUTCDay();
      for (let w = 0; w < 6; w++) {
        const sunday = today + ((7 - dow) % 7) + w * 7;
        const fire = sunday * DAY + 18 * HOUR - off;
        if (fire < now + HOUR) continue;
        const week = nights.filter(r => {
          const d = Math.floor((r.n.t0 + off) / DAY);
          return d >= sunday && d < sunday + 7;
        });
        if (!week.length) continue;
        const best = week.slice().sort((x, y) => y.score.value - x.score.value)[0];
        const note = Sky.notable(week.slice().sort((x, y) => x.n.t0 - y.n.t0));
        if (!note && best.score.value < Math.max(5.5, a.min - 1.5)) continue;
        const lead = note
          ? note.why + ' on ' + dateShort(note.row.n.t0, home) + '. '
          : '';
        out.push({ at: fire, kind: 'digest', score: 2,
          title: 'The week ahead from ' + home.name,
          body: lead + 'Best night looks like ' + dateShort(best.n.t0, home) + ', scoring ' +
                best.score.value.toFixed(1) + ' with ' + hoursShort(best.n.darkHours) + ' of darkness.' });
      }
    }

    // One a day at most, the loudest wins, and never more than the system will hold.
    const byDay = {};
    for (const o of out.sort((x, y) => y.score - x.score || x.at - y.at)) {
      const k = Math.floor((o.at + Sky.offsetFor(home, o.at).ms) / DAY);
      if (byDay[k]) continue;
      byDay[k] = o;
    }
    return Object.values(byDay).sort((x, y) => x.at - y.at).slice(0, MAX);
  }

  const hoursShort = h => h <= 0 ? 'no real darkness' : h < 1 ? Math.round(h * 60) + ' minutes' : h.toFixed(1) + ' hours';

  function clock(t, place) {
    const off = Sky.offsetFor(place, t).ms;
    const d = new Date(t + off);
    const h = d.getUTCHours(), m = String(d.getUTCMinutes()).padStart(2, '0');
    if (Store.settings().clock24) return String(h).padStart(2, '0') + ':' + m;
    const ap = h < 12 ? 'am' : 'pm', h12 = h % 12 === 0 ? 12 : h % 12;
    return h12 + ':' + m + ' ' + ap;
  }
  function dateShort(t, place) {
    const off = Sky.offsetFor(place, t).ms;
    const d = new Date(t + off);
    return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getUTCDay()] +
           ' ' + d.getUTCDate();
  }

  /** Recompute and hand the whole schedule to the system. Safe to call on every open. */
  function sync() {
    const n = native();
    const list = plan();
    if (!n) return list;
    try {
      if (!list.length) { n.cancelNotifications && n.cancelNotifications(); return list; }
      n.scheduleNotifications(JSON.stringify(list.map((o, i) => ({
        id: i, at: Math.round(o.at), title: o.title, body: o.body
      }))));
    } catch (e) {}
    return list;
  }
  function cancel() { const n = native(); if (n && n.cancelNotifications) { try { n.cancelNotifications(); } catch (e) {} } }

  /** The best night in the window, so Settings can calibrate the threshold honestly. */
  function ceiling(days) {
    const home = Store.home();
    if (!home) return null;
    let best = null;
    for (let d = 0; d < (days || 42); d++) {
      const n = Sky.night(home, Date.now() + d * DAY);
      if (best && best.t0 === n.t0) continue;
      const hap = Sky.happenings(n);
      const s = Sky.score(n, hap);
      if (!best || s.value > best.value) best = { value: s.value, t0: n.t0, top: s.top };
    }
    return best;
  }

  return { plan, sync, cancel, allowed, request, clock, dateShort, ceiling };
})();
