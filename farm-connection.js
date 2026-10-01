/* Preserve explicit integrations and HTTPS /ws while discovering custom WS ports. */
(function () {
  'use strict';
  let config;
  window.farmSocketURL = async function (admin = false) {
    let base = window.FARM_WS_URL;
    if (!base && location.protocol === 'https:') base = 'wss://' + location.host + '/ws';
    if (!base) {
      try {
        if (!config) config = fetch((window.FARM_API_BASE || '') + '/api/config', {signal: AbortSignal.timeout(5000)}).then(r => {
          if (!r.ok) throw new Error('config unavailable');
          return r.json();
        });
        const c = await config;
        const port = Number.isInteger(c.ws_port) && c.ws_port > 0 && c.ws_port <= 65535 ? c.ws_port : 8765;
        base = 'ws://' + location.hostname + ':' + port;
      } catch (_) { config = null; base = 'ws://' + location.hostname + ':8765'; }
    }
    if (admin) {
      const url = new URL(base, location.href);
      if (!url.pathname.replace(/\/$/, '').endsWith('/admin')) url.pathname = url.pathname.replace(/\/$/, '').replace(/\/ws$/, '') + '/ws/admin';
      return url.href;
    }
    return base;
  };
})();

/* Shared bilingual navigation labels. */
(function () {
  const labels = {
    en:{operations:'Operations',data:'Sensor details',admin:'System diagnostics'},
    zh:{operations:'现场监控',data:'传感器明细',admin:'系统诊断'}
  };
  window.FarmUI = {label:(key,lang)=>labels[lang]?.[key]};
})();
