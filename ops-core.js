/* Pure observation math, shared by the browser and Node's built-in tests. */
(function (root) {
  'use strict';
  const finite = v => typeof v === 'number' && Number.isFinite(v);
  function status(ts, now, thresholds = {live_s: 5400, stale_s: 10800}) {
    if (!finite(ts)) return 'unknown';
    const age = Math.max(0, now - ts);
    return age < thresholds.live_s ? 'live' : age < thresholds.stale_s ? 'stale' : 'down';
  }
  function series(points, since = -Infinity, until = Infinity) {
    return (Array.isArray(points) ? points : []).filter(p => Array.isArray(p) && finite(p[0]) && finite(p[1]) && p[0] >= since && p[0] <= until).sort((a,b) => a[0]-b[0]);
  }
  function segments(points, gap = 5400) {
    const groups = [];
    for (const point of series(points)) {
      const last = groups.at(-1);
      if (!last || point[0] - last.at(-1)[0] > gap) groups.push([point]);
      else last.push(point);
    }
    return groups;
  }
  function extent(points) {
    const values = series(points).map(p => p[1]);
    return values.length ? [Math.min(...values), Math.max(...values)] : null;
  }
  function change(points, lookback = 10800, tolerance = 2700) {
    const ordered = series(points);
    if (ordered.length < 2) return null;
    const latest = ordered.at(-1), target = latest[0] - lookback;
    const candidate = ordered.reduce((best, point) =>
      Math.abs(point[0] - target) < Math.abs(best[0] - target) ? point : best, ordered[0]);
    return Math.abs(candidate[0] - target) <= tolerance ? latest[1] - candidate[1] : null;
  }
  function windBins(rows, speedEdges = [0,2,4,6,8,10,12]) {
    const sectors = Array.from({length:16}, () => ({counts:Array(speedEdges.length).fill(0), total:0}));
    let total = 0;
    for (const row of Array.isArray(rows) ? rows : []) {
      if (!Array.isArray(row) || !finite(row[1]) || !finite(row[2])) continue;
      const sector = Math.round((((row[2] % 360) + 360) % 360) / 22.5) % 16;
      let bin = 0;
      for (let i=0;i<speedEdges.length;i++) if (row[1] >= speedEdges[i]) bin=i;
      sectors[sector].counts[bin]++; sectors[sector].total++; total++;
    }
    return {sectors,total,max:Math.max(0,...sectors.map(s=>s.total)),speedEdges:[...speedEdges]};
  }
  function direction(deg) {
    return finite(deg) ? ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'][Math.round(((deg % 360)+360)%360/22.5)%16] : '—';
  }
  function project(nodes) {
    const valid = nodes.filter(n => finite(n.lat) && finite(n.lon) && Math.abs(n.lat) <= 90 && Math.abs(n.lon) <= 180);
    if (!valid.length) return [];
    const lat = valid.reduce((s,n)=>s+n.lat,0)/valid.length;
    const lon = valid[0].lon;
    const meters = valid.map(n=>({...n, x: (((n.lon-lon+540)%360)-180)*111320*Math.cos(lat*Math.PI/180), y: -(n.lat-lat)*111320}));
    const xs=meters.map(n=>n.x), ys=meters.map(n=>n.y);
    const centerX=(Math.min(...xs)+Math.max(...xs))/2, centerY=(Math.min(...ys)+Math.max(...ys))/2;
    const scale=Math.max((Math.max(...xs)-Math.min(...xs))/430, (Math.max(...ys)-Math.min(...ys))/200, 1);
    return meters.map(n=>({...n, x:300+(n.x-centerX)/scale, y:140+(n.y-centerY)/scale}));
  }
  function validOverview(d) {
    const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
    return !!d && typeof d.state === 'object' && d.state !== null && !Array.isArray(d.state)
      && typeof d.metrics === 'object' && d.metrics !== null && !Array.isArray(d.metrics)
      && Array.isArray(d.health?.lora) && Array.isArray(d.health?.meshtastic)
      && Array.isArray(d.mesh?.nodes) && finite(d.server?.generated_at)
      && Object.values(d.metrics).every(object)
      && d.health.lora.every(object) && d.health.meshtastic.every(object) && d.mesh.nodes.every(object);
  }
  // Field units describe decoded values, never inferred device-specific channels.
  const fieldUnits = Object.freeze(Object.assign(Object.create(null), {
    'air temperature':'°C', 'humidity':'%', 'wind speed':'m/s', 'wind direction':'°',
    'rain intensity':'mm/h', 'soil moisture':'%', 'co2':'ppm', 'barometric pressure':'Pa',
    'light':'lux', 'pm2.5':'µg/m³', 'pm10':'µg/m³', 'soil temperature':'°C', 'soil ec':'dS/m'
  }));
  function fieldSeries(id, key, field, overview, history, raw) {
    const mapped = [];
    for (const [slot, m] of Object.entries(overview?.metrics || {})) {
      if (m.source === id && m.field === key) mapped.push(...series(history[slot]));
    }
    const tail = series(field?.history);
    for (const packet of raw) {
      if (packet.dev_eui === id && finite(packet.received_at) && finite(packet.decoded?.[key]))
        tail.push([packet.received_at, packet.decoded[key]]);
    }
    // DB and raw receipt clocks differ slightly for the same packet. Use DB
    // history first, then only new live tail points; do not double-count both.
    const latestMapped=mapped.length?Math.max(...mapped.map(p=>p[0])):-Infinity;
    const points=[...mapped,...tail.filter(p=>p[0]>latestMapped)];
    // Time-only HH:MM:SS entries are deliberately rejected by series().
    return [...new Map(points.sort((a,b)=>a[0]-b[0]).map(p=>[p[0],p])).values()];
  }
  function fieldReceipt(id, key, field, overview, points) {
    const times = [];
    for (const [slot,m] of Object.entries(overview?.metrics || {})) {
      if (m.source === id && m.field === key && overview.state?.[slot] === field.latest && finite(m.last_received)) times.push(m.last_received);
    }
    const last=points.at(-1);
    if (last && last[1] === field.latest) times.push(last[0]);
    return times.length ? Math.max(...times) : null;
  }
  function validFields(d) {
    const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
    return object(d) && Object.values(d).every(dev=>object(dev) && object(dev.fields)
      && Object.values(dev.fields).every(f=>object(f) && (f.latest === null || finite(f.latest)) && Array.isArray(f.history)));
  }
  const api = {finite, status, series, segments, extent, change, windBins, direction, project, validOverview, fieldUnits, fieldSeries, fieldReceipt, validFields};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OpsCore = api;
})(globalThis);
