/* Sensor details and system diagnostics; shared secondary-workbench controller. */
(function () {
  'use strict';
  const kind=document.body?.dataset.workbench;
  if(!kind)return;
  const C=window.OpsCore, $=id=>document.getElementById(id);
  const copy={
    en:{skip:'Skip to workspace',refresh:'Refresh',devices:'Devices',selectDevice:'Select a device',back:'Back to devices',deviceHint:'Select a device to view all decoded fields.',historyNote:'Dated samples only · 24 h mapped history and recent uplinks · legacy time-only records omitted.',receiptNote:'Bridge receipt times · Lisbon',readOnly:'Receive only',sourceHealth:'Data freshness',healthNote:'A connected browser does not mean sensors are reporting. Each source has its own last received time.',meshGap:'Meshtastic RSSI, SNR and frame counts are not supplied by the current API. — means unavailable.',rawUplinks:'Raw LoRa uplinks',pause:'Pause updates',resume:'Resume updates',filter:'Device / topic filter',limit:'Display limit',rawNote:'Expand a packet to view its original JSON. Pausing freezes this list; reception continues.',live:'Recent',stale:'Delayed',down:'No data',unknown:'Unknown',never:'Time unavailable',emptyDevices:'No decoded devices received. Check System diagnostics.',emptyFields:'No decoded fields for this device.',emptyRaw:'No matching uplinks. Check the filter and data freshness.',choose:'Choose a device from the list on the left.',fields:'fields',unitUnknown:'Unit not supplied',noTrend:'No dated samples available.',received:'Received',samples:'dated samples',browser:'Browser',bridge:'Bridge',mqtt:'MQTT',connected:'Connected',connecting:'Connecting',offline:'Disconnected',unavailable:'Unavailable',responding:'Responding',waiting:'Waiting',isolated:'Isolated',apiError:'API unavailable or invalid response. Retaining the last valid data. Retry with Refresh.',wsError:'Live connection disconnected. HTTP refresh continues every 30 s; reconnecting automatically.',demo:'Demonstration',demoNote:'Synthetic observations · no connection to the farm.',liveMode:'Live feed',lastResponse:'Last Bridge response',storageError:'Bridge reports a storage error.',noSources:'No sources received.',name:'Source',state:'State',lastSeen:'Last seen',frameCounter:'Frame counter',frames:'Frames',paused:'Updates paused',shown:'shown',buffered:'buffered',missingRawTime:'Legacy time (date/timezone unavailable)',cadence:'Recent <90 min · delayed 90 min–3 h · no data ≥3 h',clock:'Lisbon',noSampleTime:'Field receipt time unavailable; device status is tracked separately.',unknownField:'Decoded field',feed:'Admin stream'},
    zh:{skip:'跳转到工作台',refresh:'刷新',devices:'设备',selectDevice:'选择设备',back:'返回设备列表',deviceHint:'选择设备查看所有已解码字段。',historyNote:'仅绘制带日期采样 · 近 24 小时已映射字段与最近上行 · 省略仅有时分秒的旧记录。',receiptNote:'Bridge 接收时间 · 里斯本',readOnly:'仅接收',sourceHealth:'数据源时效',healthNote:'浏览器已连接不代表传感器正在上报。每个来源单独显示最近接收时间。',meshGap:'当前 API 未提供 Meshtastic 的 RSSI、SNR 与帧计数。“—” 表示未提供。',rawUplinks:'LoRa 原始上行',pause:'暂停更新',resume:'恢复更新',filter:'筛选设备 / 主题',limit:'显示条数',rawNote:'展开报文可查看原始 JSON。暂停仅冻结当前列表，后台仍持续接收。',live:'最近',stale:'延迟',down:'超时',unknown:'未知',never:'时间不可用',emptyDevices:'暂无已解码设备，请检查系统诊断。',emptyFields:'此设备暂无已解码字段。',emptyRaw:'未找到匹配报文，请检查筛选条件及数据源时效。',choose:'请从左侧列表选择设备。',fields:'个字段',unitUnknown:'未标明单位',noTrend:'暂无带日期的采样。',received:'接收于',samples:'条带日期采样',browser:'浏览器',bridge:'Bridge',mqtt:'MQTT',connected:'已连接',connecting:'连接中',offline:'已断开',unavailable:'无响应',responding:'响应正常',waiting:'等待响应',isolated:'已隔离',apiError:'接口不可用或响应格式错误，保留最近有效数据。请点击刷新重试。',wsError:'实时连接已断开。每 30 秒通过 HTTP 刷新，正在自动重连。',demo:'演示模式',demoNote:'观测值为模拟数据，未连接农场。',liveMode:'实时接收',lastResponse:'Bridge 最近响应',storageError:'Bridge 报告存储错误。',noSources:'尚未收到来源数据。',name:'来源',state:'状态',lastSeen:'最近接收',frameCounter:'帧计数',frames:'帧数',paused:'已暂停更新',shown:'条显示',buffered:'条缓存',missingRawTime:'历史格式时间（缺少日期与时区）',cadence:'最近 <90 分钟 · 延迟 90 分钟–3 小时 · 超时 ≥3 小时',clock:'里斯本',noSampleTime:'字段接收时间未知；设备状态单独统计。',unknownField:'解码字段',feed:'诊断数据流'}
  };
  const fieldNames={
    'air temperature':'空气温度','humidity':'湿度','wind speed':'风速','wind direction':'风向',
    'rain intensity':'降雨强度','soil moisture':'土壤水分','co2':'二氧化碳','barometric pressure':'气压',
    'light':'照度','soil temperature':'土壤温度','soil ec':'土壤电导率','water temperature':'水温',
    'level':'液位','latitude':'纬度','longitude':'经度','battery':'电池','event status':'事件状态'
  };
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const symbols={live:'●',stale:'△',down:'×',unknown:'○'};
  const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
  const rawKey=e=>JSON.stringify([e.dev_eui,e.received_at,e.ts,e.fcnt,e.topic]);
  let lang='en';try{if(localStorage.getItem('farm-lang')==='zh')lang='zh';}catch(_){}
  const t=key=>window.FarmUI.label(key,lang)||copy[lang][key]||key;
  const model={overview:null,fields:Object.create(null),history:{},raw:[],devices:[],socket:'connecting',socketAt:null,responseAt:0,serverTime:0,clockAt:0,failures:new Set(),revision:0};
  const now=()=>model.serverTime?model.serverTime+(performance.now()-model.clockAt)/1000:Date.now()/1000;
  const status=ts=>C.status(ts,now(),model.overview?.health?.thresholds);
  const date=ts=>C.finite(ts)?new Intl.DateTimeFormat(lang==='zh'?'zh-CN':'en-GB',{timeZone:'Europe/Lisbon',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(ts*1000)):t('never');
  function age(ts){
    if(!C.finite(ts))return t('never');const s=Math.max(0,Math.floor(now()-ts));
    const n=s<60?s:s<3600?Math.floor(s/60):s<86400?Math.floor(s/3600):Math.floor(s/86400);
    const unit=lang==='zh'?(s<60?'秒':s<3600?'分钟':s<86400?'小时':'天'):(s<60?'s':s<3600?'m':s<86400?'h':'d');
    return lang==='zh'?`${n}${unit}前`:`${n}${unit} ago`;
  }
  function stateText(ts){const s=status(ts);return `<span class="wb-state ${s}">${symbols[s]} ${t(s)} · ${age(ts)}</span>`;}
  const renderedHTML=new WeakMap();
  function replace(id,html){
    const el=$(id);if(renderedHTML.get(el)===html)return;
    renderedHTML.set(el,html);
    const focus=el.contains(document.activeElement)?document.activeElement.dataset.focus:null;
    const top=el.scrollTop,left=el.scrollLeft;
    const opened=new Set([...el.querySelectorAll('details[open]')].map(e=>e.dataset.packet));
    el.innerHTML=html;
    for(const d of el.querySelectorAll('details'))d.open=opened.has(d.dataset.packet);
    if(focus)([...el.querySelectorAll('[data-focus]')].find(e=>e.dataset.focus===focus)||el).focus({preventScroll:true});
    el.scrollTop=top;el.scrollLeft=left;
  }
  $('wb-header').innerHTML=`<div class="identity"><h1>Farm <span>Ops</span></h1></div><nav aria-label="Main">${['operations','data','admin'].map(k=>`<a href="/${k==='operations'?'ops':k}" data-wb="${k}" ${kind===k?'aria-current="page"':''}></a>`).join('')}</nav><div class="header-tools"><button id="wb-language" type="button"></button><div class="clockbox"><time id="wb-clock"></time><span id="wb-clock-zone"></span></div></div>`;
  let selected=null,lastSelected=null,paused=false,frozen=[],filter='',limit=20;
  function renderTransport(){
    const server=model.overview?.server, ageResponse=model.responseAt?(performance.now()-model.responseAt)/1000:Infinity;
    const bad=model.failures.size>0, expired=ageResponse>90||model.failures.has('overview');
    $('wb-mode').textContent=server?t(server.mode==='demo'?'demo':'liveMode'):t('waiting');
    const set=(id,key,state,word,extra='')=>{const e=$(id);e.className='wb-state '+state;e.textContent=`${symbols[state]} ${t(key)} · ${t(word)}${extra}`;};
    set('wb-browser','browser',model.socket==='open'?'live':model.socket==='connecting'?'unknown':'down',model.socket==='open'?'connected':model.socket==='connecting'?'connecting':'offline',model.socketAt?' · '+age(model.socketAt):'');
    set('wb-bridge','bridge',model.failures.has('overview')?'down':!model.responseAt?'unknown':expired?'down':'live',model.failures.has('overview')?'unavailable':!model.responseAt?'waiting':expired?'unavailable':'responding',model.responseAt?' · '+age(model.serverTime):'');
    set('wb-mqtt','mqtt',!server||server.mode==='demo'?'unknown':server.mqtt_connected?'live':'down',!server?'unknown':server.mode==='demo'?'isolated':server.mqtt_connected?'connected':'offline',server&&server.mode!=='demo'?' · '+t('lastSeen')+' '+age(server.mqtt_last_message):'');
    $('wb-bridge').title=t('lastResponse')+': '+date(model.serverTime||null);
    $('wb-mqtt').title=t('lastSeen')+': '+date(server?.mqtt_last_message);
    const notices=[];
    if(bad)notices.push(t('apiError')+' ['+[...model.failures].join(', ')+']');
    if(model.socket==='closed')notices.push(t('wsError'));
    if(server?.storage_error)notices.push(t('storageError'));
    if(server?.mode==='demo')notices.push(t('demoNote'));
    $('wb-notice').hidden=!notices.length;$('wb-notice').className='notice '+(bad||server?.storage_error?'error':model.socket==='closed'?'delayed':'demo');
    $('wb-notice').textContent=(bad?'× ':'')+notices.join(' ');
    $('wb-clock').textContent=new Intl.DateTimeFormat(lang==='zh'?'zh-CN':'en-GB',{timeZone:'Europe/Lisbon',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date());
    $('wb-clock-zone').textContent=t('clock');
  }
  function fieldChart(points){
    if(!points.length)return `<p class="empty">${t('noTrend')}</p>`;
    // Actual epoch seconds determine horizontal position. Unequal intervals stay unequal.
    const W=320,H=100,L=62,R=310,T=9,B=70;
    let start=points[0][0],end=points.at(-1)[0];if(start===end){start-=30;end+=30;}
    let low=Math.min(...points.map(p=>p[1])),high=Math.max(...points.map(p=>p[1]));if(low===high){low-=1;high+=1;}
    const x=ts=>L+(ts-start)/(end-start)*(R-L),y=v=>B-(v-low)/(high-low)*(B-T);
    const fmt=n=>n.toLocaleString(lang==='zh'?'zh-CN':'en-GB',{maximumFractionDigits:1});
    const clock=ts=>new Intl.DateTimeFormat(lang==='zh'?'zh-CN':'en-GB',{timeZone:'Europe/Lisbon',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(ts*1000));
    let s=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(date(points[0][0])+' — '+date(points.at(-1)[0]))}"><path class="chart-grid" d="M${L} ${T}H${R}M${L} ${B}H${R}"/><text class="chart-text" x="56" y="14" text-anchor="end">${fmt(high)}</text><text class="chart-text" x="56" y="73" text-anchor="end">${fmt(low)}</text>`;
    for(const group of C.segments(points))s+=`<path class="chart-line" d="${group.map((p,i)=>(i?'L':'M')+x(p[0]).toFixed(2)+' '+y(p[1]).toFixed(2)).join(' ')}"/>`;
    for(const p of points)s+=`<circle class="chart-dot" cx="${x(p[0])}" cy="${y(p[1])}" r="2"><title>${esc(date(p[0]))}: ${fmt(p[1])}</title></circle>`;
    return s+`<text class="chart-text" x="${L}" y="95">${clock(points[0][0])}</text><text class="chart-text" x="${R}" y="95" text-anchor="end">${clock(points.at(-1)[0])}</text></svg>`;
  }
  function renderData(){
    const entries=Object.entries(model.fields),health=model.overview?.health?.lora||[];
    $('device-count').textContent=entries.length;
    replace('device-list',entries.length?entries.map(([id,d])=>{const h=health.find(s=>s.id===id);return `<button type="button" class="device-choice" data-device="${esc(id)}" data-focus="${esc(id)}" aria-pressed="${selected===id}"><strong>${esc(d.name||id)}</strong><small>${esc(id)} · ${Object.keys(d.fields).length} ${t('fields')}</small>${stateText(h?.last_seen)}</button>`;}).join(''):`<p class="empty">${t('emptyDevices')}</p>`);
    const dev=model.fields[selected];
    $('device-back').disabled=!selected;
    $('device-title').textContent=dev?dev.name||selected:t('selectDevice');
    $('device-subtitle').textContent=dev?selected+' · '+Object.keys(dev.fields).length+' '+t('fields'):'';
    if(!dev){replace('field-list',`<p class="empty">${t(selected?'emptyFields':'choose')}</p>`);return;}
    replace('field-list',Object.entries(dev.fields).map(([key,f])=>{
      const points=C.fieldSeries(selected,key,f,model.overview,model.history,model.raw),ts=C.fieldReceipt(selected,key,f,model.overview,points),st=status(ts);
      const label=lang==='zh'?(Object.hasOwn(fieldNames,key)?fieldNames[key]:key):key;
      const unit=C.fieldUnits[key]||t('unitUnknown');
      const value=C.finite(f.latest)?f.latest.toLocaleString(lang==='zh'?'zh-CN':'en-GB',{maximumFractionDigits:3}):'—';
      return `<article class="field-card ${st}" tabindex="0" data-focus="${esc(key)}"><h3>${esc(label)}</h3><p class="field-key">${esc(key)}</p><p class="field-value">${value}<small>${esc(unit)}</small></p>${stateText(ts)}<p class="field-receipt">${C.finite(ts)?t('received')+' '+date(ts):t('noSampleTime')}</p><div class="field-trend">${fieldChart(points)}</div><p class="field-chart-note">${points.length} ${t('samples')}${points.length?' · '+date(points[0][0])+' → '+date(points.at(-1)[0]):''}</p></article>`;
    }).join('')||`<p class="empty">${t('emptyFields')}</p>`);
  }
  function healthTable(sources,mesh){
    if(!sources.length)return `<p class="empty">${t('noSources')}</p>`;
    const rank={down:0,unknown:1,stale:2,live:3};
    return `<table class="wb-table"><thead><tr><th>${t('name')}</th><th>${t('state')}</th><th>${t('lastSeen')}</th><th>RSSI</th><th>SNR</th><th>${t('frames')}</th></tr></thead><tbody>`+sources.slice().sort((a,b)=>rank[status(a.last_seen)]-rank[status(b.last_seen)]).map(h=>{
      const matches=model.devices.filter(d=>d.name===h.name);
      const d=mesh?{}:model.devices.find(d=>d.dev_eui===h.id)||(matches.length===1?matches[0]:{});
      return `<tr><td>${esc(h.name||h.id)}<small>${esc(h.id)}</small></td><td>${stateText(h.last_seen)}</td><td>${date(h.last_seen)}</td><td>${C.finite(d.rssi)?d.rssi+' dBm':'—'}</td><td>${C.finite(d.snr)?d.snr+' dB':'—'}</td><td>${C.finite(d.frames)?d.frames:'—'}</td></tr>`;
    }).join('')+'</tbody></table>';
  }
  function renderRaw(){
    const list=paused?frozen:model.raw;
    const matching=list.filter(e=>(String(e.device)+' '+String(e.dev_eui)+' '+String(e.topic)).toLowerCase().includes(filter.toLowerCase()));
    const shown=matching.slice(0,limit);
    $('raw-summary').textContent=`${paused?'Ⅱ '+t('paused')+' · ':''}${shown.length} ${t('shown')} / ${list.length} ${t('buffered')}`;
    $('raw-pause').textContent=t(paused?'resume':'pause');$('raw-pause').setAttribute('aria-pressed',String(paused));
    replace('raw-list',shown.length?shown.map(e=>{
      const key=rawKey(e),stamp=C.finite(e.received_at)?date(e.received_at):t('missingRawTime')+': '+(e.ts||'—');
      return `<details class="raw-packet" data-packet="${esc(key)}"><summary data-focus="${esc(key)}">${esc(e.device||e.dev_eui||'—')}<small>${esc(stamp)} · ${t('frameCounter')}: ${esc(e.fcnt??'—')} · RSSI ${esc(e.rssi??'—')} dBm · SNR ${esc(e.snr??'—')} dB</small><small>${esc(e.topic||'—')}</small></summary><pre tabindex="0" data-focus="${esc('raw:'+key)}">${esc(JSON.stringify(e.raw??e.object??{},null,2))}</pre></details>`;
    }).join(''):`<p class="empty">${t('emptyRaw')}</p>`);
  }
  function renderAdmin(){
    const health=model.overview?.health||{lora:[],meshtastic:[]};
    const all=[...health.lora,...health.meshtastic];
    $('health-summary').textContent=`${all.filter(h=>status(h.last_seen)==='live').length}/${all.length} ${t('live')}`;
    replace('diag-lora',healthTable(health.lora,false));replace('diag-mesh',healthTable(health.meshtastic,true));renderRaw();
  }
  function render(){renderTransport();if(kind==='data')renderData();else renderAdmin();}
  function applyLang(){
    document.documentElement.lang=lang==='zh'?'zh-CN':'en';document.title=t(kind)+' · Farm Ops';
    document.querySelectorAll('[data-wb]').forEach(el=>el.textContent=t(el.dataset.wb));
    $('wb-language').textContent=lang==='en'?'中文':'EN';$('wb-language').setAttribute('aria-label',lang==='en'?'切换到中文':'Switch to English');
    $('wb-header').querySelector('nav').setAttribute('aria-label',lang==='zh'?'主导航':'Main navigation');
    for(const id of kind==='data'?['device-list','field-list']:['diag-lora','diag-mesh','raw-list'])$(id).setAttribute('aria-label',id==='device-list'?t('devices'):id==='field-list'?t('fields'):id==='raw-list'?t('rawUplinks'):id==='diag-lora'?'LoRa':'Meshtastic');
    render();
  }
  function storeFields(d){model.fields=Object.create(null);for(const [id,dev] of Object.entries(d))model.fields[id]={name:dev.name,fields:Object.assign(Object.create(null),dev.fields)};}
  function mergeRaw(list){model.raw=[...new Map([...model.raw,...list].map(e=>[rawKey(e),e])).values()].sort((a,b)=>(b.received_at||0)-(a.received_at||0)).slice(0,200);}
  function acceptRaw(e){
    if(!object(e)||typeof e.dev_eui!=='string'||!C.finite(e.received_at)||!object(e.decoded))return;
    const alreadySeen=model.raw.some(packet=>rawKey(packet)===rawKey(e));
    model.revision++;mergeRaw([e]);
    const dev=model.fields[e.dev_eui]||(model.fields[e.dev_eui]={name:e.device||e.dev_eui,fields:Object.create(null)});
    for(const [key,value] of Object.entries(e.decoded))if(C.finite(value)){
      const f=dev.fields[key]||(dev.fields[key]={latest:null,history:[]});f.latest=value;
      f.history=[...f.history,[e.received_at,value]].slice(-200);
    }
    let d=model.devices.find(d=>d.dev_eui===e.dev_eui);
    if(!d){d={dev_eui:e.dev_eui,frames:0};model.devices.push(d);}
    Object.assign(d,{name:e.device,rssi:e.rssi,snr:e.snr,last_seen_ts:e.received_at,frames:(d.frames||0)+(alreadySeen?0:1)});
    const health=model.overview?.health?.lora;
    if(health){let h=health.find(h=>h.id===e.dev_eui);if(!h){h={id:e.dev_eui};health.push(h);}Object.assign(h,{name:e.device||e.dev_eui,last_seen:e.received_at});}
    render();
  }
  const validRaw=d=>object(d)&&Array.isArray(d.devices)&&d.devices.every(object)&&Array.isArray(d.raw)&&d.raw.every(object);
  let busy=false;
  async function refresh(){
    if(busy)return;busy=true;$('wb-refresh').disabled=true;
    const revision=model.revision;
    const paths=kind==='data'?['overview','fields','history?hours=24','raw']:['overview','raw'];
    const results=await Promise.allSettled(paths.map(async path=>{
      const r=await fetch((window.FARM_API_BASE||'')+'/api/'+path,{cache:'no-store',signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error(r.status);return r.json();
    }));
    results.forEach((r,i)=>{
      const path=paths[i],d=r.value;
      const valid=r.status==='fulfilled'&&(path==='overview'?C.validOverview(d):path==='fields'?C.validFields(d):path==='raw'?validRaw(d):object(d)&&Object.values(d).every(Array.isArray));
      if(!valid){model.failures.add(path);return;}model.failures.delete(path);
      if(path==='overview'){model.overview=d;model.serverTime=d.server.generated_at;model.clockAt=performance.now();model.responseAt=performance.now();}
      else if(path==='fields'&&revision===model.revision)storeFields(d);
      else if(path==='raw'){if(revision===model.revision){model.raw=d.raw.slice(0,200);model.devices=d.devices;}else mergeRaw(d.raw);}
      else if(path.startsWith('history'))model.history=d;
    });
    // A packet received while HTTP was in flight must not regress source health.
    for(const e of model.raw){const h=model.overview?.health?.lora.find(h=>h.id===e.dev_eui);if(h&&C.finite(e.received_at)&&e.received_at>(h.last_seen||0))h.last_seen=e.received_at;}
    render();busy=false;$('wb-refresh').disabled=false;
  }
  let retry=1500;
  async function connect(){
    let ws;try{ws=new WebSocket(await window.farmSocketURL(true));}catch(_){model.socket='closed';renderTransport();setTimeout(connect,retry);return;}
    ws.onopen=()=>{model.socket='open';model.socketAt=now();retry=1500;renderTransport();};
    ws.onmessage=event=>{try{const msg=JSON.parse(event.data);
      if(msg.type==='admin_snapshot'&&object(msg.data)){
        // HTTP overview is the authoritative source for Bridge/MQTT state.
        if(C.validFields(msg.data.fields))storeFields(msg.data.fields);
        if(validRaw(msg.data)){model.devices=msg.data.devices;mergeRaw(msg.data.raw);}render();
      }else if(msg.type==='raw')acceptRaw(msg.data);
    }catch(_){/* Malformed packets cannot erase the last valid view. */}};
    ws.onclose=()=>{model.socket='closed';model.socketAt=now();renderTransport();setTimeout(connect,retry);retry=Math.min(retry*2,30000);};ws.onerror=()=>ws.close();
  }
  $('wb-language').addEventListener('click',()=>{lang=lang==='en'?'zh':'en';try{localStorage.setItem('farm-lang',lang);}catch(_){}applyLang();});
  $('wb-refresh').addEventListener('click',refresh);
  if(kind==='data'){
    $('device-list').addEventListener('click',e=>{const button=e.target.closest('[data-device]');if(!button)return;selected=button.dataset.device;lastSelected=selected;renderData();$('field-list').scrollTop=0;$('device-title').focus();});
    $('device-back').addEventListener('click',()=>{selected=null;renderData();([...$('device-list').querySelectorAll('[data-device]')].find(e=>e.dataset.device===lastSelected)||$('device-list')).focus();});
  }else{
    $('raw-pause').addEventListener('click',()=>{paused=!paused;if(paused)frozen=model.raw.slice();renderRaw();});
    $('raw-filter').addEventListener('input',e=>{filter=e.target.value;renderRaw();});
    $('raw-limit').addEventListener('change',e=>{limit=Number(e.target.value);renderRaw();});
  }
  applyLang();refresh();connect();setInterval(refresh,30000);setInterval(render,15000);
})();
