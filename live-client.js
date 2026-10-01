// Live data client: connects to the bridge WebSocket and fills data-src elements.
// Injected into the dashboard. No external libraries.
(function () {
  // WebSocket URL: over HTTPS (tailscale serve) the ws is proxied at /ws;
  // over plain HTTP (port 8000) connect directly to the bridge on :8765.
  var url = (location.protocol === 'https:')
    ? 'wss://' + location.host + '/ws'
    : (window.FARM_WS_URL || ('ws://' + location.hostname + ':8765'));
  var retry = 3000;

  // Format a raw value for a given data-src key.
  function fmt(key, v) {
    if (v === null || v === undefined) return '--';
    switch (key) {
      case 'weather.co2':  return Math.round(v);
      case 'weather.wind': return (+v).toFixed(1);
      case 'weather.temp': return (+v).toFixed(1);
      case 'weather.hum':  return Math.round(v);
      case 'weather.rain_24h': return (+v).toFixed(1);
      case 'weather.pressure': return Math.round(v / 100);      // Pa -> hPa
      case 'weather.light': return (v >= 1000 ? (v / 1000).toFixed(1) : Math.round(v)); // lux -> k lux
      case 'weather.pm25': return Math.round(v);
      case 'weather.pm10': return Math.round(v);
      case 'soil.temp':    return (+v).toFixed(1) + '°';
      case 'soil.hum':     return Math.round(v) + '%';
      case 'soil.ec':      return (+v).toFixed(1);
      case 'mesh.nodes':   return Math.round(v);
      default:             return String(v);
    }
  }

  function setEl(el, key, v) {
    var s = fmt(key, v);
    if (s === null) return;
    // Preserve a trailing unit element (<u>…</u>) if present.
    var u = el.querySelector('u');
    if (u) { el.firstChild.nodeValue = s; }
    else if (el.tagName === 'I' || el.tagName === 'B' && el.parentElement.classList.contains('hum')) {
      el.style.width = s; // soil humidity bar
    }
    else if (el.tagName.toLowerCase() !== 'path') { el.textContent = s; }
  }

  var soilState = {};
  function apply(data) {
    for (var key in data) {
      // wind direction (degrees) updates the cardinal text + the rose arrow.
      if (key === 'weather.wind_dir' && typeof data[key] === 'number') {
        if (window.setWindDirText) window.setWindDirText(data[key]);
        if (window.setWindRoseDir) window.setWindRoseDir(data[key]);
        else if (window.refreshWindRose) window.refreshWindRose();
        continue; // handled by the wind rose, not the generic filler
      }
      if (key === 'soil.temp' || key === 'soil.hum') {
        soilState[key] = data[key];
        if (window.drawSoil) window.drawSoil(soilState['soil.temp'], soilState['soil.hum']);
      }
      var els = document.querySelectorAll('[data-src="' + key + '"]');
      for (var i = 0; i < els.length; i++) setEl(els[i], key, data[key]);
      // mesh.msgs replaces the message list.
      if (key === 'mesh.msgs' && Array.isArray(data[key])) renderMsgs(data[key]);
      // soil humidity bar width.
      if (key === 'soil.hum') {
        var bar = document.querySelector('.hum .bar i');
        if (bar) bar.style.width = Math.round(data[key]) + '%';
      }
    }
  }

  function renderMsgs(list) {
    var box = document.querySelector('[data-src="mesh.msgs"]');
    if (!box) return;
    if (!list || !list.length) {
      box.innerHTML = '<div class="m sys"><div class="t">No messages received</div></div>';
      return;
    }
    box.innerHTML = list.map(function (m) {
      if (m.sys) return '<div class="m sys"><div class="t"></div></div>';
      var cls = m.me ? 'm me' : 'm';
      return '<div class="' + cls + '"><div class="who">' +
        esc(m.who) + ' <span>' + esc(m.meta || '') + '</span></div>' +
        '<div class="t">' + esc(m.text) + '</div></div>';
    }).join('');
    box.scrollTop = box.scrollHeight;
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function setLive(up) {
    var b = document.querySelector('.badge');
    if (b) { b.classList.toggle('off', !up); b.title=up?'Browser connected; check System diagnostics for data freshness':'Browser disconnected'; var label=b.querySelector('[data-i18n]'); if(label)label.textContent=document.documentElement.lang==='zh-CN'?(up?'已连接':'已断开'):(up?'Connected':'Disconnected'); }
  }

  async function connect() {
    url = await window.farmSocketURL();
    var ws;
    try { ws = new WebSocket(url); } catch (e) { return setTimeout(connect, retry); }
    ws.onopen = function () { setLive(true); };
    ws.onmessage = function (ev) {
      try {
        var msg = JSON.parse(ev.data);
        if (msg.data) apply(msg.data);
      } catch (e) {}
    };
    ws.onclose = function () { setLive(false); setTimeout(connect, retry); };
    ws.onerror = function () { try { ws.close(); } catch (e) {} };
  }
  connect();
})();
