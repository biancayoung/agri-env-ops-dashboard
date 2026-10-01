"""Contract tests use memory SQLite and temporary loopback servers, never farm.db."""
import asyncio
import json
import sqlite3
import socket
import subprocess
import sys
import tempfile
from pathlib import Path
import threading
import time
import unittest
from unittest.mock import patch
from urllib.request import Request, urlopen
from urllib.error import HTTPError

import bridge as b
from websockets.asyncio.client import connect
from websockets.asyncio.server import serve


class BridgeTests(unittest.TestCase):
    def setUp(self):
        b.init_db(':memory:')
        b.STATE.update({key: [] if key=='mesh.msgs' else None for key in b.STATE})
        for value in (b.DEVICES,b.FIELDS,b.METRIC_TS,b.MESH_NODES,b.MESH_SEEN_SET,b.SEEN_TIMES): value.clear()
        b.RAW_LOG.clear(); b.MESH_MSGS.clear(); b.MESH_SEEN.clear()
        self.weather=b.SPARK_SOURCES['weather.temp'][0]
        self.soil=b.SPARK_SOURCES['soil.temp'][0]

    def tearDown(self):
        b._db.close()
        b._db = None

    def packet(self, values=None, eui=None, counter=1):
        return {'deviceInfo':{'devEui':eui or self.weather,'deviceName':'Fixture station'},
                'fCnt':counter,'object':{'messages':[[{'measurementId':k,'measurementValue':v} for k,v in (values or {1:25}).items()]]},
                'rxInfo':[{'rssi':-90,'snr':7}]}

    def test_ingestion_rain_alias_and_unchanged_freshness(self):
        with patch.object(b.time,'time',return_value=10000):
            self.assertTrue(b.process_message('application/fixture/event/up',self.packet({1:25,7:1.2})))
        with patch.object(b.time,'time',return_value=20000):
            self.assertTrue(b.process_message('application/fixture/event/up',self.packet({1:25},counter=2)))
        self.assertEqual(b.STATE['weather.rain_rate'],1.2)
        self.assertEqual(b.STATE['weather.rain_24h'],1.2)
        self.assertEqual(b.METRIC_TS['weather.temp'],20000)
        self.assertEqual(b.METRIC_TS['weather.rain_rate'],10000)
        self.assertEqual(b.RAW_LOG[0]['decoded'],{'air temperature':25})

    def test_source_isolation_and_restart_freshness(self):
        other=next(e for e, channels in b.DEVICE_CHANNELS.items() if e!=self.weather and channels.get(2)=='air temperature')
        with patch.object(b.time,'time',return_value=10000):
            b.db_store(self.weather,{'air temperature':21})
            b.db_store(other,{'air temperature':99})
        b.load_state_from_db()
        self.assertEqual(b.STATE['weather.temp'],21)
        self.assertEqual(b.METRIC_TS['weather.temp'],10000)
        self.assertEqual(b.db_sparklines()['weather.temp'],[[10000,21]])
        self.assertIn(self.weather,b.fields_payload())
        self.assertEqual(b.health_payload()['lora'][0]['status'],'down')

    def test_bad_envelopes_do_not_break_next_message(self):
        for msg in [None,[],{'deviceInfo':[]},{'deviceInfo':{'devEui':[]}},
                    self.packet({1:float('nan')}),self.packet({1:float('inf')}),
                    dict(self.packet(),rxInfo=['invalid']),dict(self.packet(),fCnt=[]),
                    dict(self.packet(),fCnt=True),dict(self.packet(),fCnt=-1),
                    dict(self.packet(),deviceInfo={'devEui':self.weather,'deviceName':{}}),
                    {'type':'text','from':[],'payload':{'text':'hello'}},
                    {'type':'text','payload':[]}, {'type':'text','payload':{'text':{}}}]:
            topic='msh/fixture' if isinstance(msg,dict) and 'type' in msg else 'application/fixture'
            self.assertFalse(b.process_message(topic,msg))
        self.assertTrue(b.process_message('application/fixture',self.packet()))
        json.dumps(b.overview_payload(),allow_nan=False)

    def test_storage_failure_does_not_stop_ingestion(self):
        with patch.object(b,'db_store',side_effect=sqlite3.OperationalError('fixture disk full')):
            self.assertFalse(b.process_message('application/fixture',self.packet()))
        self.assertTrue(b.RUNTIME['storage_error'])
        self.assertEqual(len(b.RAW_LOG), 0)
        self.assertEqual(b.DEVICES, {})
        self.assertEqual(b.FIELDS, {})
        self.assertIsNone(b.STATE['weather.temp'])
        # The same frame can retry after storage recovery.
        self.assertTrue(b.process_message('application/fixture',self.packet()))
        self.assertFalse(b.process_message('application/fixture',self.packet()))
        self.assertEqual(b._db.execute('SELECT COUNT(*) FROM readings').fetchone()[0], 1)
        self.assertFalse(b.RUNTIME['storage_error'])
        self.assertEqual(b.STATE['weather.temp'],25)

    def test_storage_transaction_rolls_back_partial_frame(self):
        b._db.execute("CREATE TRIGGER reject_fixture BEFORE INSERT ON readings "
                      "WHEN NEW.field='humidity' BEGIN SELECT RAISE(ABORT, 'fixture failure'); END")
        self.assertFalse(b.process_message('application/fixture',self.packet({1:23,2:50})))
        self.assertEqual(b._db.execute('SELECT COUNT(*) FROM readings').fetchone()[0],0)
        b._db.execute('DROP TRIGGER reject_fixture')
        self.assertTrue(b.process_message('application/fixture',self.packet({1:23,2:50})))
        self.assertEqual(b._db.execute('SELECT COUNT(*) FROM readings').fetchone()[0],2)

    def test_one_receipt_timestamp_across_all_views(self):
        self.assertTrue(b.process_message('application/fixture', self.packet()))
        ts = b.RAW_LOG[0]['received_at']
        self.assertEqual(b.METRIC_TS['weather.temp'],ts)
        self.assertEqual(b.DEVICES[self.weather]['last_seen_ts'],ts)
        self.assertEqual(b.db_sparklines()['weather.temp'][0][0],ts)

    def test_mesh_payload_sender_scopes_packet_id(self):
        for sender in ('one','two'):
            b.process_message('msh/fixture',{'type':'text','id':9,'payload':{'from':sender,'text':'Hi'}})
        self.assertEqual(len(b.MESH_MSGS),2)

    def test_metadata_only_frame_does_not_claim_storage_recovery(self):
        b.RUNTIME['storage_error']=True
        packet=self.packet(); packet['object']={}
        self.assertTrue(b.process_message('application/fixture',packet))
        self.assertTrue(b.RUNTIME['storage_error'])
        self.assertTrue(b.process_message('application/fixture',self.packet(counter=2)))
        self.assertFalse(b.RUNTIME['storage_error'])

    def test_existing_schema_disk_restart_and_backup(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'fixture.sqlite'
            with sqlite3.connect(path) as legacy:
                legacy.execute('CREATE TABLE readings (id INTEGER PRIMARY KEY AUTOINCREMENT, '
                               'ts REAL NOT NULL, dev_eui TEXT NOT NULL, field TEXT NOT NULL, value REAL NOT NULL)')
                legacy.execute('INSERT INTO readings(ts,dev_eui,field,value) VALUES(?,?,?,?)',
                               (10000,self.weather,'air temperature',21))
            b.init_db(path)
            b.load_state_from_db()
            self.assertEqual(b.METRIC_TS['weather.temp'],10000)
            self.assertEqual(b.STATE['weather.temp'],21)
            with patch.object(b.time,'time',return_value=20000):
                self.assertTrue(b.process_message('application/fixture',self.packet({1:22})))
            b.init_db(path)
            b.DEVICES.clear(); b.FIELDS.clear(); b.METRIC_TS.clear()
            b.load_state_from_db()
            self.assertEqual(b.METRIC_TS['weather.temp'],20000)
            self.assertEqual(b.fields_payload()[self.weather]['fields']['air temperature']['latest'],22)
            with sqlite3.connect(':memory:') as backup:
                b._db.backup(backup)
                self.assertEqual(backup.execute('PRAGMA integrity_check').fetchone()[0],'ok')
                self.assertEqual(backup.execute('SELECT COUNT(*) FROM readings').fetchone()[0],2)
            b.init_db(':memory:')

    def test_split_frames_do_not_refresh_absent_channels(self):
        b.process_message('application/fixture',self.packet({1:23},counter=1))
        ts=b.METRIC_TS['weather.temp']
        b.process_message('application/fixture',self.packet({2:50},counter=2))
        self.assertEqual(b.METRIC_TS['weather.temp'],ts)
        self.assertEqual(b.STATE['weather.hum'],50)

    def test_dedup_expires_after_counter_reuse(self):
        packet=self.packet()
        with patch.object(b.time,'monotonic',return_value=0): self.assertFalse(b.is_duplicate(packet))
        with patch.object(b.time,'monotonic',return_value=60): self.assertTrue(b.is_duplicate(packet))
        with patch.object(b.time,'monotonic',return_value=301): self.assertFalse(b.is_duplicate(packet))

    def test_mesh_zero_scaled_coordinates_and_position_age(self):
        b.process_message('msh/fixture',{'type':'position','from':'test','payload':{'latitude_i':0,'longitude_i':12000000}})
        node=b.mesh_payload()['nodes'][0]
        self.assertEqual((node['lat'],node['lon']),(0,1.2))
        ts=node['position_ts']
        b.process_message('msh/fixture',{'type':'telemetry','from':'test','hops_away':0,'payload':{'device_metrics':{'battery_level':0}}})
        node=b.mesh_payload()['nodes'][0]
        self.assertEqual(node['battery'],0)
        self.assertEqual(node['hops'],0)
        self.assertEqual(node['position_ts'],ts)
        b.process_message('msh/fixture',{'type':'position','from':'test','payload':{'latitude':200,'longitude':0}})
        self.assertEqual(b.mesh_payload()['nodes'][0]['lat'],0)

    def test_mesh_packet_id_scoped_to_sender(self):
        for sender in ('one','two'):
            for _ in range(2): b.process_message('msh/fixture',{'type':'text','from':sender,'id':8,'payload':{'text':'Same message'}})
        self.assertEqual(len(b.MESH_MSGS),2)

    def test_downsampling_keeps_first_and_latest(self):
        ts=time.time()
        with b._DB_LOCK:
            b._db.executemany('INSERT INTO readings(ts,dev_eui,field,value) VALUES(?,?,?,?)',
                             [(ts-1000+i,self.weather,'air temperature',i) for i in range(800)])
            b._db.commit()
        data=b.db_history(max_points=10)['weather.temp']
        self.assertEqual(len(data),10)
        self.assertEqual((data[0][1],data[-1][1]),(0,799))

    def test_http_routes_errors_and_private_files(self):
        server=b.ThreadingHTTPServer(('127.0.0.1',0),b.Handler)
        worker=threading.Thread(target=server.serve_forever,daemon=True);worker.start()
        base='http://127.0.0.1:'+str(server.server_port)
        def request(path,method='GET'):
            try:
                with urlopen(Request(base+path,method=method),timeout=3) as r: return r.status,r.read(),r.headers
            except HTTPError as e: return e.code,e.read(),e.headers
        try:
            for path in ('/','/a','/b','/ops','/ops?lang=en','/admin','/data','/api/raw','/api/fields','/api/health','/api/mesh','/api/wind','/api/history','/api/sparklines','/api/overview','/api/config'):
                for method in ('GET','HEAD'):
                    status,body,headers=request(path,method)
                    self.assertEqual(status,200,(path,method))
                    if method=='HEAD':self.assertEqual(body,b'')
                    elif path.startswith('/api/'):json.loads(body)
            for path in ('/farm.db','/.env','/.git/config','/.agent-local/mission-pack.md','/bridge.py','/%2eenv','/../bridge.py','/api/healthsuffix','/.artifacts/preview.log'):
                self.assertEqual(request(path)[0],404,path)
                self.assertEqual(request(path,'HEAD')[0],404,path)
            for query in ('0','169','-1','oops','1.5'):
                self.assertEqual(request('/api/history?hours='+query)[0],400)
            self.assertEqual(request('/api/history?hours=48')[0],200)
            self.assertEqual(request('/api/health')[2]['Cache-Control'],'no-store')
            with patch.object(b,'db_history',side_effect=sqlite3.OperationalError('fixture')):
                self.assertEqual(request('/api/history')[0],503)
            with patch.object(b.Path,'is_symlink',return_value=True):
                self.assertEqual(request('/ops')[0],404)
        finally:
            server.shutdown();server.server_close();worker.join()

    def test_demo_occupied_socket_fails_without_touching_db(self):
        with socket.socket() as occupied, tempfile.TemporaryDirectory() as folder:
            occupied.bind(('127.0.0.1',0)); occupied.listen()
            with socket.socket() as available:
                available.bind(('127.0.0.1',0)); http_port=available.getsockname()[1]
            db=Path(folder)/'untouched.db'
            db.write_bytes(b'not a database: demo must never open this')
            result=subprocess.run([sys.executable,str(b.ROOT/'bridge.py'),'--demo',
                                   '--db',str(db),'--http-port',str(http_port),
                                   '--ws-port',str(occupied.getsockname()[1])],
                                  capture_output=True,text=True,timeout=15)
            self.assertNotEqual(result.returncode,0)
            self.assertIn('WebSocket listener could not start',result.stderr)
            self.assertEqual(db.read_bytes(),b'not a database: demo must never open this')
            self.assertEqual(list(Path(folder).iterdir()),[db])

    def test_websocket_legacy_clients_and_freshness(self):
        async def exercise():
            b.LOOP=asyncio.get_running_loop()
            async with serve(b.ws_handler,'127.0.0.1',0) as server:
                port=server.sockets[0].getsockname()[1]
                async with connect(f'ws://127.0.0.1:{port}',proxy=None) as dashboard, connect(f'ws://127.0.0.1:{port}/ws/admin',proxy=None) as admin:
                    snap=json.loads(await asyncio.wait_for(dashboard.recv(),2))
                    self.assertEqual(snap['type'],'snapshot');self.assertIn('weather.temp',snap['data']);self.assertIn('meta',snap)
                    self.assertEqual(json.loads(await asyncio.wait_for(admin.recv(),2))['type'],'admin_snapshot')
                    await dashboard.send(json.dumps({'type':'update','data':{'weather.temp':999}}))
                    await dashboard.ping()
                    self.assertIsNone(b.STATE['weather.temp'])
                    b.process_message('application/fixture',self.packet({1:24}))
                    update=json.loads(await asyncio.wait_for(dashboard.recv(),2))
                    self.assertEqual(update['data']['weather.temp'],24)
                    self.assertIn('last_received',update['meta']['weather.temp'])
                    raw=json.loads(await asyncio.wait_for(admin.recv(),2))
                    self.assertEqual(raw['type'],'raw');self.assertEqual(raw['data']['decoded']['air temperature'],24)
            b.LOOP=None
        asyncio.run(exercise())

if __name__=='__main__':unittest.main()
