/* Operations console: honest observations, independent transport and source health. */
(function () {
  'use strict';
  const C = window.OpsCore, $ = id => document.getElementById(id);
  const copy = {
    en: {skip:'Skip to observations',eyebrow:'Environmental monitoring',refresh:'Refresh',conditions:'Current conditions',lastValues:'Last received values · select a card to update the trend',spatial:'Spatial context',atlas:'Reported positions',atlasCaption:'Reported coordinates · north up · equal scale',freshness:'Data freshness',sources:'Observation sources',recent:'● Recent',delayed:'△ Delayed',silent:'× No data',cadence:'Recent <90 min · delayed 90 min–3 h · no data ≥3 h',mesh:'Mesh communications',offgrid:'Off-grid communications',nodes:'Mesh nodes',weatherVisuals:'Farm observations',weatherStation:'Agricultural weather',weatherSummary:'Wind, soil and environmental history',windObservation:'Wind observation',currentWind:'Current wind',receiveOnly:'Receive only',messages:'Received messages',meshCaption:'Use a mesh radio to transmit. This display receives messages.',history:'Observation history',trends:'Environmental trends',window:'Time window',viewReadings:'View readings',chartCaption:'Time in Lisbon · raw samples · gaps over 90 minutes remain visible',footer:'Readings are for monitoring. No hazard classification rules are configured.',simpleView:'Simple dashboard ↗',inspect:'Observation details',close:'Close',temp:'Air temperature',humidity:'Humidity',wind:'Wind speed',rain:'Rain intensity',soil:'Soil moisture',co2:'Carbon dioxide',pressure:'Pressure',light:'Illuminance',soilTemp:'Soil temperature',ec:'Soil conductivity',demo:'Demonstration',liveMode:'Live feed',connected:'● Browser connected',connecting:'○ Connecting',reconnecting:'△ Reconnecting',mqttOn:'● MQTT connected',mqttOff:'× MQTT disconnected',mqttDemo:'MQTT isolated',demoNotice:'Demonstration · synthetic observations and coordinates. No connection to the farm.',apiError:'Latest observations are unavailable. Previously received values remain visible.',historyError:'History did not update. Showing the latest available samples.',wsError:'Live updates paused. Showing the latest received values while reconnecting.',unknown:'No reading',live:'Recent',stale:'Delayed',down:'No data',never:'Never received',now:'Just received',ago:'ago',sourcesRecent:'sources reporting recently',noSources:'No sensor uplinks received.',noPositions:'No positions reported.',located:'located',unlocated:'without coordinates',selectNode:'Select a node to inspect its last reported position.',noMesh:'No mesh nodes received.',noMessages:'No messages received since the display started.',heard:'nodes heard',sample:'samples',noHistory:'No samples in this time window. Select another metric.',min:'Min',max:'Max',received:'Received',value:'Value',source:'Source',lastReceived:'Last received',positionReceived:'Position received',hops:'hops',externalPower:'External power',battery:'Battery',observations:'observations',waiting:'Waiting for observations',lisbon:'Lisbon',seen:'Last heard',noCoords:'No coordinates',raw:'Raw readings',snapshotOld:'Observations have not updated for more than 90 seconds.',inspectMore:'Additional observations',noPositionTime:'Position time unavailable',storageError:'New observations could not be saved.'},
    zh: {skip:'跳转到观测数据',eyebrow:'环境监测',refresh:'刷新',conditions:'当前环境',lastValues:'最近接收的读数 · 点击卡片切换趋势',spatial:'空间信息',atlas:'已上报位置',atlasCaption:'上报坐标 · 北向上 · 等比例',freshness:'数据时效',sources:'观测来源',recent:'● 最近',delayed:'△ 延迟',silent:'× 超时',cadence:'最近 <90 分钟 · 延迟 90 分钟–3 小时 · 超时 ≥3 小时',mesh:'Mesh 通讯',offgrid:'离网通讯',nodes:'Mesh 节点',weatherVisuals:'农场观测',weatherStation:'农业气象',weatherSummary:'风况、土壤与环境历史',windObservation:'风况观测',currentWind:'当前风况',receiveOnly:'仅接收',messages:'已接收消息',meshCaption:'本页仅接收消息；发送请使用 Mesh 电台。',history:'观测历史',trends:'环境趋势',window:'时间范围',viewReadings:'查看读数',chartCaption:'里斯本时间 · 原始采样 · 超过 90 分钟的空缺不连线',footer:'读数仅供监测；未设置灾害分级规则。',simpleView:'简版仪表盘 ↗',inspect:'查看观测详情',close:'关闭',temp:'空气温度',humidity:'湿度',wind:'风速',rain:'降雨强度',soil:'土壤水分',co2:'二氧化碳',pressure:'气压',light:'照度',soilTemp:'土壤温度',ec:'土壤电导率',demo:'演示模式',liveMode:'实时数据',connected:'● 浏览器已连接',connecting:'○ 正在连接',reconnecting:'△ 正在重连',mqttOn:'● MQTT 已连接',mqttOff:'× MQTT 已断开',mqttDemo:'MQTT 已隔离',demoNotice:'演示模式 · 观测值和坐标均为模拟数据，未连接农场。',apiError:'暂时无法获取最新观测，页面保留已收到的读数。',historyError:'历史数据未更新，显示最近可用采样。',wsError:'实时更新已暂停，正在重连；页面保留最近读数。',unknown:'无读数',live:'最近',stale:'延迟',down:'超时',never:'从未接收',now:'刚刚',ago:'前',sourcesRecent:'个来源最近有上报',noSources:'未收到传感器上行数据。',noPositions:'暂无上报位置。',located:'个已定位',unlocated:'个未定位',selectNode:'选择节点查看最近上报位置。',noMesh:'暂无 Mesh 节点。',noMessages:'页面启动后尚未收到消息。',heard:'个节点有数据',sample:'条采样',noHistory:'此时间段无采样数据，请切换指标。',min:'最低',max:'最高',received:'接收时间',value:'数值',source:'来源',lastReceived:'最近接收',positionReceived:'位置接收时间',hops:'跳',externalPower:'外接电源',battery:'电量',observations:'个观测值',waiting:'等待观测数据',lisbon:'里斯本',seen:'最近收到消息',noCoords:'无坐标',raw:'原始读数',snapshotOld:'观测数据已超过 90 秒未更新。',inspectMore:'更多观测项',noPositionTime:'位置时间缺失',storageError:'新观测暂时无法保存。'}
  };
  Object.assign(copy.en,{fieldInstruments:'Field instruments',northUp:'N ↑',windRose:'Wind rose · 48 h',windScale:'Direction frequency · colour shows wind speed',windEmpty:'No matching wind speed and direction samples.',range:'Range',change3h:'Change over 3 h',steady:'No change',trendOverview:'Trend overview',freshnessScale:'Time since receipt: 0–3 h',farmPlace:'Environmental monitoring',farmNote:'This is a self-hosted environmental monitoring dashboard. Connect it to your MQTT broker to display live weather, soil and mesh-radio readings from your own devices; this console only displays what those devices report.',farmMeshNote:'Mesh radios on your network can send text; incoming messages appear here.',aboutFarm:'About this dashboard',noMessages:'No messages received since the display started.'});
  Object.assign(copy.zh,{fieldInstruments:'现场仪表',northUp:'北 ↑',windRose:'风向玫瑰 · 48 小时',windScale:'方向频次 · 颜色表示风速',windEmpty:'暂无关联的风速与风向采样。',range:'范围',change3h:'3 小时变化',steady:'无变化',trendOverview:'趋势总览',freshnessScale:'接收距今：0–3 小时',farmPlace:'环境监测',farmNote:'这是一个自托管的环境监测仪表盘。连接到你的 MQTT broker，即可显示你自己设备上报的气象、土壤与 Mesh 电台读数；本控制台只显示这些设备上报的观测。',farmMeshNote:'你网络中的 Mesh 电台可以发信；收到的消息会显示在这里。',aboutFarm:'关于本仪表盘',noMessages:'页面启动后尚未收到消息。'});
  let lang = 'en';
  try { if (localStorage.getItem('farm-lang') === 'zh') lang = 'zh'; } catch (_) {}
  const t = key => window.FarmUI?.label(key,lang) || copy[lang][key] || key;
  const esc = str => String(str ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const metrics = {
    'weather.temp':{name:'temp',unit:C.fieldUnits['air temperature'],digits:1}, 'weather.hum':{name:'humidity',unit:C.fieldUnits['humidity'],digits:0},
    'weather.wind':{name:'wind',unit:C.fieldUnits['wind speed'],digits:1}, 'weather.rain_rate':{name:'rain',unit:C.fieldUnits['rain intensity'],digits:1},
    'soil.hum':{name:'soil',unit:C.fieldUnits['soil moisture'],digits:1}, 'weather.co2':{name:'co2',unit:C.fieldUnits['co2'],digits:0},
    'weather.pressure':{name:'pressure',unit:'hPa',digits:1,scale:.01}, 'weather.light':{name:'light',unit:C.fieldUnits['light'],digits:0},
    'weather.pm25':{name:'PM2.5',unit:C.fieldUnits['pm2.5'],digits:1}, 'weather.pm10':{name:'PM10',unit:C.fieldUnits['pm10'],digits:1},
    'soil.temp':{name:'soilTemp',unit:C.fieldUnits['soil temperature'],digits:1}, 'soil.ec':{name:'ec',unit:C.fieldUnits['soil ec'],digits:2}
  };
  const primary = ['weather.temp','weather.rain_rate','soil.hum','weather.co2'];
  const iconPaths = {
    'weather.temp':'<path d="M10 4a2 2 0 1 1 4 0v8.6a4 4 0 1 1-4 0Z"/><circle cx="12" cy="16.6" r="1.6" fill="currentColor" stroke="none"/>',
    'weather.hum':'<path d="M12 3.5s5.3 6 5.3 9.8a5.3 5.3 0 1 1-10.6 0c0-3.8 5.3-9.8 5.3-9.8Z"/>',
    'weather.wind':'<path d="M3 8h9a2.5 2.5 0 1 0-2.4-3.2M3 12h13a2.5 2.5 0 1 1-2.4 3.2M3 16h7"/>',
    'weather.rain_rate':'<path d="M7 14a4.5 4.5 0 1 1 .8-8.9A5.5 5.5 0 0 1 18.4 7 3.6 3.6 0 0 1 18 14Z"/><path d="M9 17.5 8 20M13 17.5 12 20M17 17.5 16 20"/>',
    'soil.hum':'<path d="M12 20v-7m0 0c0-3.3 2.6-5.7 6.5-5.7 0 3.3-2.6 5.7-6.5 5.7Zm0 0c0-3.3-2.6-5.7-6.5-5.7 0 3.3 2.6 5.7 6.5 5.7Z"/>',
    'weather.co2':'<path d="M7 16.5a4 4 0 1 1 .7-7.9A5.5 5.5 0 0 1 18.3 9.6 3.4 3.4 0 0 1 17.5 16.5Z"/>'
  };
  const icon = key=>iconPaths[key]?`<svg class="m-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${iconPaths[key]}</svg>`:'';
  let state = {}, meta = {}, health = {lora:[],meshtastic:[]}, mesh = {nodes:[]}, server = {};
  let history = {}, sparklines = {}, windHistory = [], chartKey = primary[0], hours = 24, selectedNode = null, detailKey = null;
  let receivedAt = 0, serverTime = 0, socketState = 'connecting', apiError = false, historyError = false, busy = false;
  let renderedMessages = '', historyEnd = 0;
  const now = () => serverTime ? serverTime + (performance.now() - receivedAt)/1000 : Date.now()/1000;
  const symbols = {live:'●',stale:'△',down:'×',unknown:'○'};
  const status = ts => C.status(ts, now(), health.thresholds);
  const format = (key,v) => C.finite(v) ? (v*(metrics[key]?.scale || 1)).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-GB', {minimumFractionDigits:metrics[key]?.digits || 0, maximumFractionDigits:metrics[key]?.digits || 0}) : '—';
  const date = ts => C.finite(ts) ? new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN':'en-GB',{timeZone:'Europe/Lisbon',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(ts*1000)) : t('never');
  function age(ts) {
    if (!C.finite(ts)) return t('never');
    const seconds=Math.max(0,now()-ts);
    if(seconds<60) return t('now');
    const number=seconds<3600?Math.floor(seconds/60):seconds<86400?Math.floor(seconds/3600):Math.floor(seconds/86400);
    const unit=seconds<3600?(lang==='zh'?'分钟':'m'):seconds<86400?(lang==='zh'?'小时':'h'):(lang==='zh'?'天':'d');
    return lang==='zh'?`${number}${unit}前`:`${number}${unit} ago`;
  }
  function content(id, html) {
    const el=$(id); if(el.innerHTML===html) return;
    const active=document.activeElement, key=el.contains(active)?active.dataset.focus:null, scroll=el.scrollTop;
    el.innerHTML=html; el.scrollTop=scroll;
    if(key) [...el.querySelectorAll('[data-focus]')].find(n=>n.dataset.focus===key)?.focus({preventScroll:true});
  }
  function bootMetrics() {
    $('readouts').innerHTML=primary.map(key=>`<button type="button" class="metric" data-metric="${key}"><span class="metric-name"></span><span class="metric-main"><span class="metric-value"></span><span class="metric-delta"></span></span><span class="metric-visual" aria-hidden="true"></span><span class="metric-range"></span><span class="secondary"></span><span class="stamp"></span></button>`).join('');
    $('readouts').addEventListener('click', e=>{const button=e.target.closest('[data-metric]');if(button)selectTrend(button.dataset.metric,true);});
    $('trend-tabs').innerHTML=Object.keys(metrics).slice(0,6).map(key=>`<button type="button" data-key="${key}"></button>`).join('');
    $('trend-tabs').addEventListener('click',e=>{const chip=e.target.closest('[data-key]');if(chip)selectTrend(chip.dataset.key,false);});
  }
  function metricPoints(key) {
    const source=C.series(sparklines[key]);
    return source.length?source:C.series(history[key]);
  }
  function sparkSvg(key, points, type='line') {
    const ordered=C.series(points); if(!ordered.length)return '<span class="viz-empty">—</span>';
    const W=180,H=46,left=2,right=178,top=4,bottom=42,start=ordered[0][0],end=Math.max(start+1,ordered.at(-1)[0]);
    const ext=C.extent(ordered), rawMin=ext[0],rawMax=ext[1],pad=(rawMax-rawMin||1)*.08,min=rawMin-pad,max=rawMax+pad;
    const x=ts=>left+(ts-start)/(end-start)*(right-left),y=v=>bottom-(v-min)/(max-min)*(bottom-top);
    if(type==='bars')return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${ordered.map((p,i)=>{const next=ordered[i+1]?.[0]||p[0]+Math.max(900,(end-start)/ordered.length),w=Math.max(1,Math.min(7,x(next)-x(p[0])-1)),h=Math.max(1,bottom-y(Math.max(0,p[1])));return `<rect x="${x(p[0]).toFixed(1)}" y="${(bottom-h).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}"/>`;}).join('')}</svg>`;
    let paths='';for(const group of C.segments(ordered))paths+=`<path d="${group.map((p,i)=>(i?'L':'M')+x(p[0]).toFixed(1)+' '+y(p[1]).toFixed(1)).join(' ')}"/>`;
    const last=ordered.at(-1);return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><line x1="2" x2="178" y1="42" y2="42"/>${paths}<circle cx="${x(last[0]).toFixed(1)}" cy="${y(last[1]).toFixed(1)}" r="2.5"/></svg>`;
  }
  function gaugeSvg(key) {
    if(key==='soil.hum'){
      const moisture=C.finite(state[key])?Math.max(0,Math.min(100,state[key])):0,temp=C.finite(state['soil.temp'])?Math.max(0,Math.min(40,state['soil.temp'])):0;
      return `<svg class="dual-gauge" viewBox="0 0 180 54"><path class="gauge-bg" d="M22 45 A68 68 0 0 1 158 45"/><path class="gauge-value" pathLength="100" stroke-dasharray="${moisture} 100" d="M22 45 A68 68 0 0 1 158 45"/><path class="gauge-inner-bg" d="M39 45 A51 51 0 0 1 141 45"/><path class="gauge-inner" pathLength="100" stroke-dasharray="${temp/40*100} 100" d="M39 45 A51 51 0 0 1 141 45"/><text x="90" y="42" text-anchor="middle">${format('soil.temp',state['soil.temp'])}°C</text></svg>`;
    }
    const limits=key==='weather.co2'?[350,1200]:[0,100],v=state[key],pct=C.finite(v)?Math.max(0,Math.min(100,(v-limits[0])/(limits[1]-limits[0])*100)):0;
    return `<div class="range-gauge"><i style="width:${pct.toFixed(1)}%"></i><span>${limits[0]}</span><span>${limits[1]}</span></div>`;
  }
  function metricVisual(key, points) {
    if(key==='weather.wind'){
      const deg=state['weather.wind_dir'],turn=C.finite(deg)?deg:0;
      return `<div class="wind-mini"><svg viewBox="0 0 54 54"><circle cx="27" cy="27" r="22"/><path transform="rotate(${turn} 27 27)" d="M27 7l5 21-5-4-5 4z"/><text x="27" y="13">N</text></svg>${sparkSvg(key,points)}</div>`;
    }
    if(key==='weather.rain_rate')return sparkSvg(key,points,'bars');
    if(key==='soil.hum'||key==='weather.co2')return gaugeSvg(key);
    return sparkSvg(key,points);
  }
  function renderMetrics() {
    for(const button of $('readouts').children){
      const key=button.dataset.metric, m=metrics[key], ts=meta[key]?.last_received, st=status(ts);
      button.className='metric '+st+(key===chartKey?' selected':'');
      button.setAttribute('aria-pressed',String(key===chartKey));
      button.querySelector('.metric-name').innerHTML=`<span class="metric-label">${icon(key)}${esc(t(m.name))}</span><span aria-hidden="true">↗</span>`;
      button.querySelector('.metric-value').innerHTML=`${format(key,state[key])}<small>${m.unit}</small>`;
      const points=metricPoints(key), ext=C.extent(points),delta=C.change(points);
      button.querySelector('.metric-visual').innerHTML=metricVisual(key,points);
      button.querySelector('.metric-range').textContent=ext?`${t('range')} ${format(key,ext[0])}–${format(key,ext[1])} ${m.unit}`:`${t('range')} —`;
      const deltaEl=button.querySelector('.metric-delta');
      deltaEl.textContent=C.finite(delta)?`${delta>0?'↑':delta<0?'↓':'→'} ${format(key,Math.abs(delta))} ${m.unit}`:'—';
      deltaEl.title=t('change3h');
      const secondary = key==='weather.temp'?`${t('humidity')} ${format('weather.hum',state['weather.hum'])}%`
        : key==='weather.wind'?`${C.direction(state['weather.wind_dir'])} · ${C.finite(state['weather.wind_dir'])?Math.round(state['weather.wind_dir'])+'°':'—'}`
        : key==='weather.rain_rate'?(lang==='zh'?'瞬时强度 · 非累计雨量':'Instantaneous · not accumulated')
        : key==='soil.hum'?`${t('soilTemp')} ${format('soil.temp',state['soil.temp'])}°C`
        : `PM2.5 ${format('weather.pm25',state['weather.pm25'])} µg/m³`;
      const secondaryKey={'weather.temp':'weather.hum','weather.wind':'weather.wind_dir','soil.hum':'soil.temp','weather.co2':'weather.pm25'}[key];
      const secondaryStatus=secondaryKey?status(meta[secondaryKey]?.last_received):null;
      button.querySelector('.secondary').textContent=secondary+(secondaryStatus && secondaryStatus!=='live'?' · '+symbols[secondaryStatus]+' '+t(secondaryStatus):'');
      button.querySelector('.secondary').title=secondaryKey?`${t('lastReceived')}: ${date(meta[secondaryKey]?.last_received)}`:'';
      const stamp=button.querySelector('.stamp'); stamp.className='stamp '+st;
      stamp.textContent=`${symbols[st]} ${t(st)} · ${age(ts)}`;
      button.setAttribute('aria-label',`${t(m.name)} ${format(key,state[key])} ${m.unit}, ${t(st)}, ${age(ts)}`);
    }
  }
  function renderSystem() {
    $('mode').hidden=true;
    $('mode').textContent=t('demo');
    const notices=[];
    if(apiError) notices.push(t('apiError'));
    else if(receivedAt && performance.now()-receivedAt>90000) notices.push(t('snapshotOld'));
    if(historyError)notices.push(t('historyError'));
    if(server.storage_error)notices.push(t('storageError'));
    if(socketState==='closed')notices.push(t('wsError'));
    $('notice').className='notice '+(apiError||server.storage_error?'error':'delayed');
    $('notice').hidden=!notices.length;$('notice').textContent=(apiError||server.storage_error?'× ':'')+notices.join(' ');
  }
  function polar(cx,cy,r,deg){const a=(deg-90)*Math.PI/180;return[cx+r*Math.cos(a),cy+r*Math.sin(a)];}
  function wedge(cx,cy,r0,r1,a0,a1){const p0=polar(cx,cy,r1,a0),p1=polar(cx,cy,r1,a1),p2=polar(cx,cy,r0,a1),p3=polar(cx,cy,r0,a0);return `M${p0[0].toFixed(1)} ${p0[1].toFixed(1)}A${r1} ${r1} 0 0 1 ${p1[0].toFixed(1)} ${p1[1].toFixed(1)}L${p2[0].toFixed(1)} ${p2[1].toFixed(1)}A${r0} ${r0} 0 0 0 ${p3[0].toFixed(1)} ${p3[1].toFixed(1)}Z`;}
  function renderWindRose(){
    const chart=C.windBins(windHistory),cx=90,cy=90,R=58,colors=['#F0BE68','#D4D66F','#72DFEB','#4CB9D5','#758DE2','#A887E7','#F28D84'],labels=['0–2','2–4','4–6','6–8','8–10','10–12','12+'];
    const ts=meta['weather.wind']?.last_received, st=status(ts), points=metricPoints('weather.wind'), ext=C.extent(points), delta=C.change(points);
    $('wind-samples').textContent=`n=${chart.total}`;$('wind-empty').hidden=chart.total>0;$('wind-empty').textContent=t('windEmpty');
    $('wind-current-speed').textContent=format('weather.wind',state['weather.wind']);
    $('wind-current-direction').textContent=C.finite(state['weather.wind_dir'])?`${C.direction(state['weather.wind_dir'])} · ${Math.round(state['weather.wind_dir'])}°`:'—';
    $('wind-current-delta').textContent=C.finite(delta)?`${delta>0?'↑':delta<0?'↓':'→'} ${format('weather.wind',Math.abs(delta))} m/s`:t('steady');
    $('wind-current-delta').title=t('change3h');
    $('wind-current-visual').innerHTML=sparkSvg('weather.wind',points);
    $('wind-current-range').textContent=ext?`${t('range')} ${format('weather.wind',ext[0])}–${format('weather.wind',ext[1])} m/s`:`${t('range')} —`;
    const stamp=$('wind-current-stamp'); stamp.className='stamp '+st; stamp.textContent=`${symbols[st]} ${t(st)} · ${age(ts)}`;
    document.querySelector('.wind-station').classList.toggle('selected',chartKey==='weather.wind');
    $('wind-select').setAttribute('aria-pressed',String(chartKey==='weather.wind'));
    $('wind-select').setAttribute('aria-label',`${t('wind')} ${format('weather.wind',state['weather.wind'])} m/s, ${t(st)}, ${age(ts)}`);
    let svg='';
    for(let i=1;i<=4;i++)svg+=`<circle class="rose-grid" cx="${cx}" cy="${cy}" r="${R*i/4}"/>`;
    for(let i=0;i<16;i++){const p=polar(cx,cy,R+13,i*22.5),major=i%4===0;svg+=`<line class="rose-grid" x1="${cx}" y1="${cy}" x2="${polar(cx,cy,R,i*22.5-11.25).map(n=>n.toFixed(1)).join('" y2="')}"/><text class="rose-label ${major?'major':''}" x="${p[0].toFixed(1)}" y="${(p[1]+3).toFixed(1)}">${['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'][i]}</text>`;}
    if(chart.max)chart.sectors.forEach((sector,i)=>{let r0=0;sector.counts.forEach((count,b)=>{if(!count)return;const r1=r0+count/chart.max*R;svg+=`<path class="rose-wedge" fill="${colors[b]}" d="${wedge(cx,cy,r0,r1,i*22.5-10.5,i*22.5+10.5)}"><title>${labels[b]} m/s · ${count} ${t('sample')}</title></path>`;r0=r1;});});
    const current=state['weather.wind_dir'];if(C.finite(current)){const a=polar(cx,cy,R-2,current),b=polar(cx,cy,9,current);svg+=`<line class="rose-needle" x1="${b[0]}" y1="${b[1]}" x2="${a[0]}" y2="${a[1]}"/><circle class="rose-current" cx="${a[0]}" cy="${a[1]}" r="3"/>`;}
    $('wind-rose').innerHTML=svg;
    $('wind-legend').innerHTML=labels.map((label,i)=>`<span><i style="background:${colors[i]}"></i>${label}</span>`).join('')+'<b>m/s</b>';
  }
  function renderAtlas() {
    const positions=C.project(mesh.nodes);
    $('positionCount').textContent=`${positions.length} ${t('located')} / ${mesh.nodes.length-positions.length} ${t('unlocated')}`;
    const plot=$('atlas'), width=Math.max(300,plot.clientWidth), height=Math.max(180,plot.clientHeight);
    plot.setAttribute('viewBox',`0 0 ${width} ${height}`);
    const xs=positions.map(n=>n.x), ys=positions.map(n=>n.y);
    const spanX=positions.length?Math.max(...xs)-Math.min(...xs):0, spanY=positions.length?Math.max(...ys)-Math.min(...ys):0;
    const frame={left:76,right:width-18,top:28,bottom:height-48};
    const scale=Math.min((frame.right-frame.left-70)/Math.max(spanX,1),(frame.bottom-frame.top-55)/Math.max(spanY,1),2);
    const px=x=>(frame.left+frame.right)/2+(x-300)*scale, py=y=>(frame.top+frame.bottom)/2+(y-140)*scale;
    const cl=10;
    let svg=`<path class="map-grid" d="M${frame.left} ${frame.top}H${frame.right}V${frame.bottom}H${frame.left}Z"/><path class="map-corner" d="M${frame.left} ${frame.top+cl}V${frame.top}H${frame.left+cl}M${frame.right-cl} ${frame.top}H${frame.right}V${frame.top+cl}M${frame.right} ${frame.bottom-cl}V${frame.bottom}H${frame.right-cl}M${frame.left+cl} ${frame.bottom}H${frame.left}V${frame.bottom-cl}"/>`;
    if(positions.length){
      const lats=positions.map(n=>n.lat),lons=positions.map(n=>n.lon),minLat=Math.min(...lats),maxLat=Math.max(...lats),minLon=Math.min(...lons),maxLon=Math.max(...lons);
      const minLonX=positions.find(n=>n.lon===minLon)?.x??300,maxLonX=positions.find(n=>n.lon===maxLon)?.x??300;
      const minLatY=positions.find(n=>n.lat===minLat)?.y??140,maxLatY=positions.find(n=>n.lat===maxLat)?.y??140;
      const ticks=(min,max)=>min===max?[min]:[min,(min+max)/2,max];
      const lonX=lon=>px(minLon===maxLon?300:minLonX+(lon-minLon)/(maxLon-minLon)*(maxLonX-minLonX));
      const latY=lat=>py(minLat===maxLat?140:minLatY+(lat-minLat)/(maxLat-minLat)*(maxLatY-minLatY));
      ticks(minLon,maxLon).forEach(lon=>{const x=lonX(lon);svg+=`<line class="map-axis" x1="${x}" x2="${x}" y1="${frame.top}" y2="${frame.bottom}"/><line class="map-tick" x1="${x}" x2="${x}" y1="${frame.top}" y2="${frame.top+5}"/><line class="map-tick" x1="${x}" x2="${x}" y1="${frame.bottom-5}" y2="${frame.bottom}"/><text class="map-axis-label" x="${x}" y="${frame.bottom+15}" text-anchor="middle">${lon.toFixed(5)}°</text>`;});
      ticks(minLat,maxLat).forEach(lat=>{const y=latY(lat);svg+=`<line class="map-axis" x1="${frame.left}" x2="${frame.right}" y1="${y}" y2="${y}"/><line class="map-tick" x1="${frame.left}" x2="${frame.left+5}" y1="${y}" y2="${y}"/><line class="map-tick" x1="${frame.right-5}" x2="${frame.right}" y1="${y}" y2="${y}"/><text class="map-axis-label" x="${frame.left-7}" y="${y+4}" text-anchor="end">${lat.toFixed(5)}°</text>`;});
      svg+=`<text class="map-axis-title" x="${(frame.left+frame.right)/2}" y="${height-6}" text-anchor="middle">LON</text><text class="map-axis-title" transform="translate(12 ${(frame.top+frame.bottom)/2}) rotate(-90)" text-anchor="middle">LAT</text>`;
    }
    svg+=`<path d="M${width-28} 55V33m-4 7 4-7 4 7" fill="none" stroke="var(--muted)"/><text class="map-text" x="${width-33}" y="22">N</text>`;
    positions.forEach(n=>{
      const st=status(n.position_ts), label=n.name || n.id, selected=selectedNode===n.id, align=n.x>300?'end':'start', tx=n.x>300?-13:13;
      const r=selected?9:7, c=r+4.5;
      svg+=`<g class="map-node ${st}${selected?' selected':''}" role="button" tabindex="0" data-node="${esc(n.id)}" data-focus="${esc(n.id)}" aria-label="${esc(label+', '+t(st))}" transform="translate(${px(n.x).toFixed(2)} ${py(n.y).toFixed(2)})"><title>${esc(label)} · ${n.lat.toFixed(5)}, ${n.lon.toFixed(5)} · ${age(n.position_ts)}</title><circle class="node-ring" r="${r}"/><path class="node-cross" d="M0 ${-c}V${-r-1}M0 ${r+1}V${c}M${-c} 0H${-r-1}M${r+1} 0H${c}"/><circle class="node-dot" r="1.8"/>${selected?`<text class="node-label" x="${tx}" y="-3" text-anchor="${align}">${esc(label)}</text><text class="node-age" x="${tx}" y="11" text-anchor="${align}">${esc(age(n.position_ts))}</text>`:''}</g>`;
    });
    content('atlas',svg);$('atlas-empty').hidden=positions.length>0;$('atlas-empty').textContent=t('noPositions');
    const node=mesh.nodes.find(n=>n.id===selectedNode);
    if(node) $('position-detail').innerHTML=`<b>${esc(node.name)}</b> · ${C.finite(node.lat)&&C.finite(node.lon)?`${node.lat.toFixed(5)}, ${node.lon.toFixed(5)} · ${t('positionReceived')}: ${age(node.position_ts)}`:t('noCoords')}`;
    else if(positions.length){const lats=positions.map(n=>n.lat),lons=positions.map(n=>n.lon);$('position-detail').textContent=`LAT ${Math.min(...lats).toFixed(5)}–${Math.max(...lats).toFixed(5)} · LON ${Math.min(...lons).toFixed(5)}–${Math.max(...lons).toFixed(5)}`;}
    else $('position-detail').textContent='';
  }
  function battery(n) {return n.battery===101?t('externalPower'):C.finite(n.battery)?`${Math.round(n.battery)}%`:'—';}
  function renderMesh() {
    $('mesh-summary').innerHTML=`<strong>${mesh.nodes.length}</strong> ${t('heard')} · ${mesh.nodes.filter(n=>status(n.last_heard_ts)==='live').length} ${t('live')}`;
    content('mesh-nodes',mesh.nodes.length?mesh.nodes.map(n=>{
      const st=status(n.last_heard_ts);
      const batteryGraphic=n.battery===101?`<span class="power-label">↯ ${t('externalPower')}</span>`:C.finite(n.battery)?`<span class="battery-rail" aria-label="${t('battery')} ${Math.round(n.battery)}%"><i style="width:${Math.max(0,Math.min(100,n.battery))}%"></i><b>${Math.round(n.battery)}%</b></span>`:'<span>—</span>';
      const hops=C.finite(n.hops)?`<span class="hop-marks" aria-label="${n.hops} ${t('hops')}">${Array.from({length:Math.min(5,n.hops+1)},(_,i)=>`<i class="${i<=n.hops?'on':''}"></i>`).join('')}<b>${n.hops}</b></span>`:'<span>—</span>';
      return `<div class="mesh-node ${st}${selectedNode===n.id?' selected':''}"><button data-node="${esc(n.id)}" data-focus="${esc(n.id)}" aria-pressed="${selectedNode===n.id}" aria-label="${esc(n.name+', '+t(st)+', '+t('battery')+' '+battery(n))}">${symbols[st]} ${esc(n.name)}<span class="mesh-node-state">${t(st)} · ${age(n.last_heard_ts)}</span></button><div class="node-instruments">${batteryGraphic}${hops}</div></div>`;
    }).join(''):`<p class="empty">${t('noMesh')}</p>`);
    const msgs=Array.isArray(state['mesh.msgs'])?state['mesh.msgs']:[];
    $('messageCount').textContent=String(msgs.length);
    const html=msgs.length?msgs.map(m=>`<article class="message"><div class="message-head"><strong>${esc(m.who)}</strong><span>${esc(C.finite(m.ts)?date(m.ts):m.meta)}</span></div><p>${esc(m.text)}</p></article>`).join(''):`<div class="empty-block"><p class="empty">${t('noMessages')}</p><p class="empty-note">${t('farmMeshNote')}</p></div>`;
    if(renderedMessages!==html){const box=$('messages'),bottom=box.scrollHeight-box.scrollTop-box.clientHeight<40;box.innerHTML=html;if(bottom)box.scrollTop=box.scrollHeight;renderedMessages=html;}
  }
  function chartSeries(key=chartKey) {return C.series(history[key],historyEnd-hours*3600,historyEnd);}
  function selectTrend(key,reveal){
    if(!metrics[key])return;
    chartKey=key;renderMetrics();renderWindRose();renderChart();
    if(reveal && window.innerWidth<1100)requestAnimationFrame(()=>$('trends').scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'}));
  }
  function renderChart() {
    [...$('trend-tabs').children].forEach(button=>{button.innerHTML=icon(button.dataset.key)+esc(t(metrics[button.dataset.key].name));button.setAttribute('aria-pressed',String(button.dataset.key===chartKey));});
    const points=chartSeries(), m=metrics[chartKey];
    $('chart-label').textContent=`${t(m.name)} · ${m.unit}`;
    $('chart-summary').textContent=points.length?`${points.length} ${t('sample')} · ${t('min')} ${format(chartKey,Math.min(...points.map(p=>p[1])))} · ${t('max')} ${format(chartKey,Math.max(...points.map(p=>p[1])))}`:t('waiting');
    $('chart-empty').hidden=points.length>0;$('chart-empty').textContent=t('noHistory');
    if(!points.length){$('trend-chart').innerHTML='';return;}
    const width=Math.max(300,$('trend-chart').clientWidth),height=Math.max(60,$('trend-chart').clientHeight);
    $('trend-chart').setAttribute('viewBox',`0 0 ${width} ${height}`);
    const start=historyEnd-hours*3600,left=46,right=width-8,top=10,bottom=height-24;
    let min=points.length?Math.min(...points.map(p=>p[1])):0, max=points.length?Math.max(...points.map(p=>p[1])):1;
    if(min===max){min-=1;max+=1;}
    const pad=(max-min)*.12;min-=pad;max+=pad;
    const x=ts=>left+(ts-start)/(hours*3600)*(right-left), y=v=>bottom-(v-min)/(max-min)*(bottom-top);
    let html='';
    for(let i=0;i<3;i++){const v=min+(max-min)*i/2,Y=y(v);html+=`<line class="chart-grid" x1="${left}" x2="${right}" y1="${Y}" y2="${Y}"/><text class="chart-text" x="36" y="${Y+4}" text-anchor="end">${format(chartKey,v)}</text>`;}
    const ticks=width<500?2:4;
    for(let i=0;i<=ticks;i++){const ts=start+i*hours*3600/ticks, label=new Intl.DateTimeFormat(lang==='zh'?'zh-CN':'en-GB',{timeZone:'Europe/Lisbon',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(ts*1000));html+=`<text class="chart-text" x="${x(ts)}" y="${height-4}" text-anchor="${i===0?'start':i===ticks?'end':'middle'}">${label}</text>`;}
    for(const group of C.segments(points)) html+=`<path class="chart-line" d="${group.map((p,i)=>(i?'L':'M')+x(p[0]).toFixed(1)+' '+y(p[1]).toFixed(1)).join(' ')}"/>`;
    for(const p of points)html+=`<circle class="chart-dot" cx="${x(p[0]).toFixed(1)}" cy="${y(p[1]).toFixed(1)}" r="2.5"><title>${esc(date(p[0]))}: ${format(chartKey,p[1])} ${m.unit}</title></circle>`;
    $('trend-chart').innerHTML=html;
  }
  function openDetail(key) {
    detailKey=key;renderDetail();if(!$('detail').open)$('detail').showModal();
  }
  function renderDetail() {
    if(!detailKey)return;
    const key=detailKey,m=metrics[key], data=meta[key]||{}, points=chartSeries(key).slice().reverse();
    $('detail-title').textContent=t(m.name);
    const extra = Object.entries(metrics).filter(([k])=>k.startsWith(key.split('.')[0]+'.')&&k!==key);
    $('detail-body').innerHTML=`<p class="detail-value">${format(key,state[key])} <small>${m.unit}</small></p><p class="detail-meta">${symbols[status(data.last_received)]} ${t(status(data.last_received))} · ${t('lastReceived')}: ${date(data.last_received)} (${age(data.last_received)})<br>${t('source')}: ${esc(data.source || '—')} · ${esc(data.field || '—')}</p><details><summary>${t('inspectMore')}</summary><table class="detail-table"><tbody>${extra.map(([k,v])=>`<tr><td>${t(v.name)}</td><td>${format(k,state[k])} ${v.unit}<br><small>${t(status(meta[k]?.last_received))} · ${age(meta[k]?.last_received)}</small></td></tr>`).join('')}</tbody></table></details><h3 style="margin-top:20px">${t('raw')} · ${hours} h</h3>${points.length?`<table class="detail-table"><thead><tr><th>${t('received')} · ${t('lisbon')}</th><th>${t('value')} (${m.unit})</th></tr></thead><tbody>${points.map(p=>`<tr><td>${date(p[0])}</td><td>${format(key,p[1])}</td></tr>`).join('')}</tbody></table>`:`<p class="empty">${t('noHistory')}</p>`}`;
  }
  function render() {renderSystem();renderMetrics();renderAtlas();renderWindRose();renderMesh();}
  function applyLang() {
    document.documentElement.lang=lang==='zh'?'zh-CN':'en';
    document.querySelectorAll('[data-i18n]').forEach(el=>el.textContent=t(el.dataset.i18n));
    $('langToggle').textContent=lang==='en'?'中文':'EN';$('langToggle').setAttribute('aria-label',lang==='en'?'切换到中文':'Switch to English');
    for(const [id,key] of [['mesh-nodes','nodes'],['messages','messages'],['trend-tabs','trends']])$(id).setAttribute('aria-label',t(key));
    document.querySelector('.site-note').setAttribute('aria-label',t('aboutFarm'));
    renderedMessages='';render();renderChart();if($('detail').open)renderDetail();tick();
  }
  async function json(path) {
    const response=await fetch((window.FARM_API_BASE||'')+path,{cache:'no-store',signal:AbortSignal.timeout(8000)});
    if(!response.ok)throw new Error('HTTP '+response.status);
    return response.json();
  }
  async function refresh() {
    if(busy)return;busy=true;$('refresh').disabled=true;$('window').disabled=true;
    try {
      const results=await Promise.allSettled([json('/api/overview'),json('/api/history?hours='+hours),json('/api/sparklines'),json('/api/wind')]);
      const overview=results[0];
      if(overview.status==='fulfilled' && C.validOverview(overview.value)) {
        const d=overview.value;
        for(const key of Object.keys(meta)){if((meta[key]?.last_received||0)>d.server.generated_at){d.metrics[key]=meta[key];d.state[key]=state[key];}}
        state=d.state;meta=d.metrics;health=d.health;mesh=d.mesh;server=d.server;
        serverTime=server.generated_at;receivedAt=performance.now();apiError=false;
      } else apiError=true;
      const h=results[1];
      if(h.status==='fulfilled' && h.value && typeof h.value==='object' && !Array.isArray(h.value)) {
        history=h.value;historyEnd=now();historyError=false;
      } else historyError=true;
      const sparks=results[2];if(sparks.status==='fulfilled'&&sparks.value&&typeof sparks.value==='object'&&!Array.isArray(sparks.value))sparklines=sparks.value;
      const wind=results[3];if(wind.status==='fulfilled'&&Array.isArray(wind.value?.wind))windHistory=wind.value.wind;
      render();renderChart();
    } finally {busy=false;$('refresh').disabled=false;$('window').disabled=false;}
  }
  let reconnectTimer, retry=1500;
  async function connect() {
    let ws;
    try {ws=new WebSocket(await window.farmSocketURL());}catch(_){socketState='closed';renderSystem();reconnectTimer=setTimeout(connect,retry);return;}
    ws.onopen=()=>{socketState='open';retry=1500;renderSystem();refresh();};
    ws.onmessage=event=>{
      try {
        const msg=JSON.parse(event.data);
        if((msg.type==='snapshot'||msg.type==='update') && msg.data && typeof msg.data==='object') {
          for(const [key,value] of Object.entries(msg.data))if(C.finite(value)||value===null||key==='mesh.msgs'&&Array.isArray(value))state[key]=value;
          if(msg.meta && typeof msg.meta==='object')Object.assign(meta,msg.meta);
          renderMetrics();renderWindRose();renderMesh();
        }
      }catch(_){/* Ignore malformed packets without losing the reconnect loop. */}
    };
    ws.onclose=()=>{socketState='closed';renderSystem();clearTimeout(reconnectTimer);reconnectTimer=setTimeout(connect,retry);retry=Math.min(retry*2,30000);};
    ws.onerror=()=>ws.close();
  }
  function tick(){
    $('clock').textContent=new Intl.DateTimeFormat(lang==='zh'?'zh-CN':'en-GB',{timeZone:'Europe/Lisbon',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date());
    $('date').textContent=new Intl.DateTimeFormat(lang==='zh'?'zh-CN':'en-GB',{timeZone:'Europe/Lisbon',day:'numeric',month:'short'}).format(new Date())+' · '+t('lisbon');
  }
  $('wind-select').addEventListener('click',()=>selectTrend('weather.wind',true));
  $('refresh').addEventListener('click',refresh);
  $('langToggle').addEventListener('click',()=>{lang=lang==='en'?'zh':'en';try{localStorage.setItem('farm-lang',lang);}catch(_){}applyLang();});
  $('window').addEventListener('change',()=>{hours=Number($('window').value);refresh();});
  $('viewReadings').addEventListener('click',()=>openDetail(chartKey));
  $('closeDetail').addEventListener('click',()=>$('detail').close());
  function selectNode(event){const node=event.target.closest('[data-node]');if(node){selectedNode=node.dataset.node;renderAtlas();renderMesh();}}
  $('atlas').addEventListener('click',selectNode);
  $('atlas').addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();selectNode(event);}});
  $('mesh-nodes').addEventListener('click',selectNode);
  bootMetrics();historyEnd=now();applyLang();refresh();connect();
  new ResizeObserver(()=>{renderChart();renderAtlas();renderWindRose();}).observe($('trend-chart').parentElement);
  setInterval(refresh,30000);
  setInterval(()=>{tick();render();},15000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
})();
