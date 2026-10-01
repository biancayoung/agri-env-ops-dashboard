"""Local-only fixture, selected by bridge --demo. No network publishers or disk DB."""
import math
import time
import bridge as b


def sample(i):
    return {"air temperature": round(23 + 4 * math.sin(i / 6), 1),
            "humidity": round(61 - 12 * math.sin(i / 6), 1),
            "wind speed": round(2.8 + 1.4 * math.sin(i / 3), 1),
            "wind direction": (285 + i * 3) % 360,
            "rain intensity": round(max(0, math.sin(i / 4) - .65) * 4, 1),
            "co2": round(425 + 12 * math.sin(i / 4)), "barometric pressure": 101320,
            "light": 24600, "pm2.5": 7, "pm10": 13,
            "soil temperature": 20.4, "soil moisture": round(44 - i / 30, 1), "soil ec": 0.8}


def seed():
    now = time.time()
    rows = []
    # Use the decoder's existing source mapping; no duplicate device inventory.
    for i in range(48):
        ts = now - (48 - i) * 1800
        for key, (eui, field) in b.SPARK_SOURCES.items():
            if key == 'weather.rain_rate': continue
            # A deliberate gap proves the chart does not interpolate outages.
            if 19 <= i <= 24: continue
            rows.append((ts, eui, field, sample(i)[field]))
    with b._DB_LOCK:
        b._db.executemany('INSERT INTO readings(ts,dev_eui,field,value) VALUES(?,?,?,?)', rows)
        b._db.commit()
    b.load_state_from_db()
    weather = b.SPARK_SOURCES['weather.temp'][0]
    soil = b.SPARK_SOURCES['soil.temp'][0]
    b.DEVICES[weather]['name'] = 'Demo · Weather station'
    b.DEVICES[soil]['name'] = 'Demo · Soil sensor'
    b.DEVICES['fixture-stale'] = dict(name='Demo · Delayed sensor', last_seen_ts=now-7200, frames=3)
    b.DEVICES['fixture-down'] = dict(name='Demo · Quiet sensor', last_seen_ts=now-15000, frames=2)
    # These are synthetic coordinates, labelled as demonstration throughout the UI.
    for i, name in enumerate(['Demo · North', 'Demo · East', 'Demo · Mobile', 'Demo · Unlocated']):
        nid = f'demo-{i}'
        b.handle_mesh('msh/demo', {'type':'nodeinfo', 'from':nid,
                      'payload':{'longname':name, 'battery':[101,76,18,0][i], 'hops':i}})
        if i < 3:
            b.handle_mesh('msh/demo', {'type':'position', 'from':nid,
                          'payload':{'latitude':37.0+i*.001, 'longitude':-8.0+[0,.003,.001][i]}})
    b.MESH_NODES['demo-1']['last_heard_ts'] = now-6000
    b.MESH_NODES['demo-1']['position_ts'] = now-6000
    b.MESH_NODES['demo-3']['last_heard_ts'] = now-14400
    for i, text in enumerate(['Demonstration feed. These are synthetic observations.',
                              'Position received from the mobile node.',
                              'A delayed node stays visible for investigation.']):
        b.handle_mesh('msh/demo', {'type':'text','from':'demo-0','id':f'demo-msg-{i}', 'payload':{'text':text}})


def run():
    i = 48
    while True:
        time.sleep(15)
        values = sample(48 + (i - 48) / 120)
        for eui, channels in b.DEVICE_CHANNELS.items():
            if eui not in {src[0] for src in b.SPARK_SOURCES.values()}: continue
            measurements = [{'measurementId':mid,'measurementValue':values[field]}
                            for mid, field in channels.items() if field in values]
            b.process_message('application/demo/device/fixture/event/up', {
                'deviceInfo':{'devEui':eui, 'deviceName':b.DEVICES[eui]['name']},
                'fCnt':i, 'object':{'messages':[measurements]}, 'rxInfo':[{'rssi':-89,'snr':7.2}]})
        i += 1
