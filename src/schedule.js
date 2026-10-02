/*SCHED-START*/
// Pure scheduling core. Days are integers (UTC days since epoch).
const DAY = 86400000;
const TEAM = 2; // durations are planned for two people working full time on this project
const toDay = s => { const [y, m, d] = String(s).split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / DAY); };
const fromDay = n => new Date(n * DAY).toISOString().slice(0, 10);
const monthKey = n => fromDay(n).slice(0, 7);
const dow = n => new Date(n * DAY).getUTCDay();
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const EPS = 1e-9;
const HORIZON = 365 * 5;

// Other projects active in a month (from/to are 'YYYY-MM', inclusive).
const otherIn = (plan, key) => (plan.otherWork || []).filter(o => o.from <= key && key <= o.to);
// Share of time this project gets in a month: the month's ceiling minus other projects.
const monthShare = (plan, key) => clamp((plan.months[key] ?? plan.defaultShare) - otherIn(plan, key).reduce((s, o) => s + o.percent, 0), 0, 100);

// task.weeks = calendar weeks the task takes at 100%, i.e. with both people on every
// project day (plan.weekdays, e.g. [5] = Fridays only). Each project day advances the
// work by (share of time this month) × (people present / 2). Other days, weekends and
// company closures advance nothing. Past months use what was entered for them, so a
// share corrected afterwards (e.g. September was really 60%) moves the plan.
function computeSchedule(plan, today) {
  const wdays = new Set(plan.weekdays && plan.weekdays.length ? plan.weekdays : [1, 2, 3, 4, 5]);
  const perWeek = wdays.size;
  const share = d => monthShare(plan, monthKey(d)) / 100;
  const closures = plan.closures.map(c => [toDay(c.start), toDay(c.end)]).filter(r => r[1] >= r[0]);
  const off = plan.people.map(p => p.timeOff.map(t => [toDay(t.start), toDay(t.end)]).filter(r => r[1] >= r[0]));
  const byId = new Map(plan.tasks.map(t => [t.id, t]));
  const dated = plan.tasks.filter(t => t.start.type === 'date').map(t => toDay(t.start.date));
  const origin = dated.length ? Math.min(...dated) : today;
  const H = HORIZON, tIdx = today - origin;
  const inR = (rs, d) => rs.some(r => d >= r[0] && d <= r[1]);

  const working = new Uint8Array(H), closed = new Uint8Array(H);
  const base = { r: new Float64Array(H), c: new Float64Array(H + 1) };
  const team = { r: new Float64Array(H), c: new Float64Array(H + 1) };
  const away = new Uint8Array(H);
  for (let i = 0; i < H; i++) {
    const d = origin + i, wd = dow(d);
    closed[i] = inR(closures, d) ? 1 : 0;
    working[i] = wdays.has(wd) && !closed[i] ? 1 : 0;
    let v = 0;
    if (working[i]) {
      const present = off.filter(rs => !inR(rs, d)).length;
      away[i] = TEAM - Math.min(TEAM, present);
      v = share(d) * Math.min(TEAM, present) / TEAM;
    }
    base.r[i] = working[i]; base.c[i + 1] = base.c[i] + working[i];
    team.r[i] = v; team.c[i + 1] = team.c[i] + v;
  }

  const snap = (cv, i) => { i = clamp(i, 0, H - 1); while (i < H - 1 && cv.r[i] <= 0) i++; return i; };
  const atWork = (cv, W) => {
    let lo = 0, hi = H - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (cv.c[m] >= W - EPS) hi = m; else lo = m + 1; }
    return snap(cv, lo);
  };
  const walk = (cv, s, w) => {
    if (w <= EPS) return { end: s, ok: true };
    const target = cv.c[s] + w;
    let lo = s, hi = H;
    while (lo < hi) { const m = (lo + hi) >> 1; if (cv.c[m + 1] >= target - EPS) hi = m; else lo = m + 1; }
    return lo >= H ? { end: H - 1, ok: false } : { end: lo, ok: true };
  };

  const res = new Map(), visiting = new Set();
  function resolve(t) {
    if (res.has(t.id)) return res.get(t.id);
    if (visiting.has(t.id)) return null;
    visiting.add(t.id);
    let pred = null, bS, aS;
    if (t.start.type === 'after' && t.start.taskId !== t.id && byId.has(t.start.taskId)) pred = resolve(byId.get(t.start.taskId));
    if (pred) { bS = snap(base, pred.bEi + 1); aS = snap(team, pred.aEi + 1); }
    else {
      const raw = t.start.type === 'date' ? toDay(t.start.date) - origin : 0;
      bS = snap(base, raw);
      aS = atWork(team, base.c[bS]);
    }
    const w = Math.max(0, +t.weeks || 0) * perWeek;
    const b = walk(base, bS, w), a = walk(team, aS, w);
    const segs = [];
    let cur = null, prevW = -1;
    for (let i = aS; i <= a.end; i++) {
      if (!working[i]) continue;
      if (away[i]) { if (cur && cur[1] === prevW) cur[1] = i; else { cur = [i, i]; segs.push(cur); } }
      prevW = i;
    }
    const out = {
      id: t.id, bEi: b.end, aEi: a.end,
      bStart: origin + bS, bEnd: origin + b.end, aStart: origin + aS, aEnd: origin + a.end,
      overflow: !a.ok, milestone: w <= EPS, segs: segs.map(([x, y]) => [origin + x, origin + y]),
    };
    visiting.delete(t.id);
    res.set(t.id, out);
    return out;
  }
  plan.tasks.forEach(resolve);
  const tasks = plan.tasks.map(t => res.get(t.id)).filter(Boolean);
  const idx = d => clamp(d - origin, 0, H - 1);
  return {
    origin, tasks, byId: res,
    projectedEnd: tasks.length ? Math.max(...tasks.map(t => t.aEnd)) : today,
    baselineEnd: tasks.length ? Math.max(...tasks.map(t => t.bEnd)) : today,
    perWeek,
    isWorking: d => wdays.has(dow(d)) && !inR(closures, d),
    // first project day after d (bars run up to it, so a Friday task fills its week)
    nextWorking: d => { for (let k = 1; k <= 7; k++) if (wdays.has(dow(d + k)) && !inR(closures, d + k)) return d + k; return d + 7; },
    baselineDayFor: d => origin + atWork(base, team.c[idx(d)]),
    weeksBetween: (s, e) => (e < s ? 0 : (team.c[idx(e) + 1] - team.c[idx(s)]) / perWeek),
  };
}
/*SCHED-END*/
if (typeof module !== 'undefined') module.exports = { computeSchedule, toDay, fromDay };
