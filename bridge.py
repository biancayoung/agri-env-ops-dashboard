#!/usr/bin/env python3
"""
Farm screen bridge.

Serves the static dashboard over HTTP and pushes live values to the
browser over WebSocket. Subscribes to ChirpStack MQTT uplinks, digests
the LoRa payloads into the dashboard's data-src keys, and broadcasts
updates to every connected client.

Run:  python3 bridge.py [--http-port 8000] [--ws-port 8765] [--mqtt-host 127.0.0.1]
"""

import argparse
import asyncio
import collections
import json
import logging
import math
import os
import copy
from functools import wraps
from urllib.parse import urlsplit, unquote, parse_qs
import sqlite3
import threading
import time
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

import paho.mqtt.client as mqtt
from websockets.asyncio.server import serve

log = logging.getLogger("bridge")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

ROOT = Path(__file__).resolve().parent
STATE_LOCK = threading.RLock()
METRIC_TS = {}
RUNTIME = {"mode": "live", "mqtt_connected": False, "mqtt_last_message": None,
           "ws_port": 8765, "storage_error": False, "started_at": time.time()}


def locked(fn):
    @wraps(fn)
    def wrapped(*args, **kwargs):
        with STATE_LOCK:
            return fn(*args, **kwargs)
    return wrapped


def finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


# ---------------------------------------------------------------------------
# Live state: the dashboard's data-src keys and their current values.
# ---------------------------------------------------------------------------
STATE = {
    "weather.co2": None,
    "weather.wind": None,
    "weather.wind_dir": None,
    "weather.temp": None,
    "weather.hum": None,
    "weather.rain_24h": None,  # legacy alias: intensity, NOT an accumulated total
    "weather.rain_rate": None,
    "weather.pressure": None,
    "weather.light": None,
    "weather.pm25": None,
    "weather.pm10": None,
    "soil.temp": None,
    "soil.hum": None,
    "soil.ec": None,
    "mesh.msgs": [],
    "mesh.nodes": None,
}

# Connected WebSocket clients.
CLIENTS = set()
ADMIN_CLIENTS = set()  # admin page sockets: get raw uplinks too
LOOP = None  # asyncio event loop running the websocket server

# Recent raw uplinks (ring buffer) and per-device metadata for the admin page.
RAW_LOG = collections.deque(maxlen=200)
DEVICES = {}  # dev_eui -> {name, last_seen, rssi, snr, fcnt, frames}
# Per-device decoded field history: dev_eui -> field -> {"latest":v, "history":[(ts,v),...]}
FIELDS = {}
FIELD_HISTORY = 48  # points kept per field

# Meshtastic state.
MESH_NODES = {}  # node_id -> {name, last_heard, battery, lat, lon, hops}
MESH_MSGS = collections.deque(maxlen=50)  # recent chat messages
# Dedup ring buffer for mesh packets: two farm gateways hear the same
# Meshtastic packet and the farm relays both, so the same message arrives
# twice. The reliable key is the Meshtastic packet `id`; fall back to
# (sender, text) when a packet has no id.
MESH_SEEN = collections.deque(maxlen=500)
MESH_SEEN_SET = set()
SEEN_TIMES = {}


# ---------------------------------------------------------------------------
# Payload digestion for the real SenseCAP / ChirpStack v4 feed.
#
# object.messages is a LIST OF LISTS of {"measurementId","measurementValue"}.
# We flatten it, map measurementId -> friendly field per device, dedupe on
# deduplicationId, and keep the last value per channel (a device can split one
# report across two consecutive uplinks).
# ---------------------------------------------------------------------------

# measurementId -> friendly field name, per device EUI.
# Sources: farm prompt (SenseCAP S2100/S2105/T1000 dataloggers).
DEVICE_CHANNELS = {
    # Weather Station S1000 (via S2100)
    "2cf7f1c07320007c": {
        1: "air temperature", 2: "humidity", 3: "barometric pressure",
        4: "wind direction", 5: "wind speed", 6: "light", 7: "rain intensity",
        8: "pm2.5", 9: "pm10", 10: "co2",
    },
    # Greenhouse CO2/temp/humidity (S-CO2-03)
    "2cf7f1c07320007a": {1: "co2", 2: "air temperature", 3: "humidity"},
    # Soil sensor at the acai palm (S2105, native ids)
    "2cf7f1c072600206": {4102: "soil temperature", 4103: "soil moisture", 4108: "soil ec"},
    # Water Quality (Datalogger 02, RS485 probe)
    "2cf7f1c07320007d": {1: "water temperature", 2: "probe ch2", 3: "probe ch3", 4: "probe ch4"},
    # Lake level (Liquid Level Pressure Sensor)
    "2cf7f1c073200079": {1: "level"},
}
# T1000 chicken tracker uses string `type` names instead of numeric ids.
T1000_TYPES = {
    4198: "latitude", 4197: "longitude", 4097: "air temperature",
    4199: "light", 3000: "battery", 4200: "event status",
}

# Friendly field -> dashboard data-src key (for the weather/soil stations).
DASHBOARD_MAP = {
    ("2cf7f1c07320007c", "co2"): "weather.co2",
    ("2cf7f1c07320007c", "wind speed"): "weather.wind",
    ("2cf7f1c07320007c", "wind direction"): "weather.wind_dir",
    ("2cf7f1c07320007c", "air temperature"): "weather.temp",
    ("2cf7f1c07320007c", "humidity"): "weather.hum",
    ("2cf7f1c07320007c", "rain intensity"): "weather.rain_24h",
    ("2cf7f1c07320007c", "barometric pressure"): "weather.pressure",
    ("2cf7f1c07320007c", "light"): "weather.light",
    ("2cf7f1c07320007c", "pm2.5"): "weather.pm25",
    ("2cf7f1c07320007c", "pm10"): "weather.pm10",
    ("2cf7f1c072600206", "soil temperature"): "soil.temp",
    ("2cf7f1c072600206", "soil moisture"): "soil.hum",
    ("2cf7f1c072600206", "soil ec"): "soil.ec",
}


# ---------------------------------------------------------------------------
# SQLite persistence: every decoded field reading is stored so history (and
# the wind rose) survives restarts and can span days.
# ---------------------------------------------------------------------------
DB_PATH = ROOT / "farm.db"
_DB_LOCK = threading.RLock()
_db = None


def init_db(path=None):
    """Open runtime storage explicitly; importing this module never touches farm.db."""
    global _db, DB_PATH
    with _DB_LOCK:
        if _db is not None:
            _db.close()
        DB_PATH = path or DB_PATH
        _db = sqlite3.connect(str(DB_PATH), check_same_thread=False, timeout=10)
        _db.execute("PRAGMA journal_mode=WAL")
        _db.execute("CREATE TABLE IF NOT EXISTS readings (id INTEGER PRIMARY KEY AUTOINCREMENT,"
                    " ts REAL NOT NULL, dev_eui TEXT NOT NULL, field TEXT NOT NULL, value REAL NOT NULL)")
        _db.execute("CREATE INDEX IF NOT EXISTS idx_readings_field_ts ON readings(field, ts)")
        _db.execute("CREATE INDEX IF NOT EXISTS idx_readings_device_field_ts ON readings(dev_eui, field, ts)")
        _db.commit()


def db_store(dev_eui, fields, ts=None):
    """Persist one uplink's decoded numeric fields (single shared timestamp)."""
    ts = time.time() if ts is None else ts
    rows = [(ts, dev_eui, k, float(v))
            for k, v in fields.items() if finite(v)]
    if not rows:
        return
    with _DB_LOCK, _db:
        # The connection context rolls back partial executemany/commit failures.
        _db.executemany("INSERT INTO readings(ts, dev_eui, field, value) VALUES(?,?,?,?)", rows)


def db_wind_history(hours=48, limit=2000):
    """Return [(ts, speed, direction)] for the wind rose, oldest first."""
    since = time.time() - hours * 3600
    with _DB_LOCK:
        cur = _db.execute(
            "SELECT ts, field, value FROM readings"
            " WHERE dev_eui=? AND field IN ('wind speed','wind direction') AND ts>=?"
            " ORDER BY ts ASC LIMIT ?",
            (SPARK_SOURCES["weather.wind"][0], since, limit))
        rows = cur.fetchall()
    # pair speed + direction by timestamp (same uplink shares ts)
    by_ts = {}
    for ts, field, val in rows:
        by_ts.setdefault(ts, {})[field] = val
    out = []
    for ts in sorted(by_ts):
        d = by_ts[ts]
        if "wind speed" in d and "wind direction" in d:
            out.append([ts, d["wind speed"], d["wind direction"]])
    return out


# dashboard data-src key -> friendly field name in the readings table
# dashboard key -> (dev_eui, field). Derived from DASHBOARD_MAP so a slot can
# only ever be filled by the device it belongs to. Keying on the field name
# alone silently mixed stations: the greenhouse S2100 also reports
# "air temperature", "humidity" and "co2", so its readings landed in the
# weather station's charts and, after a restart, in its live tiles.
SPARK_SOURCES = {slot: (eui, field) for (eui, field), slot in DASHBOARD_MAP.items()}
SPARK_SOURCES["weather.rain_rate"] = SPARK_SOURCES["weather.rain_24h"]


def db_sparklines(points=48):
    """Return {dashboard_key: [[ts, value], ...]} recent history for sparklines."""
    out = {}
    with _DB_LOCK:
        for key, (eui, field) in SPARK_SOURCES.items():
            cur = _db.execute(
                "SELECT ts, value FROM readings WHERE dev_eui=? AND field=?"
                " ORDER BY ts DESC LIMIT ?",
                (eui, field, points))
            rows = cur.fetchall()
            if rows:
                out[key] = [[r[0], r[1]] for r in reversed(rows)]
    return out


def db_history(hours=24, max_points=400):
    """Return {dashboard_key: [[ts, value], ...]} for the last `hours`, for the
    big trend charts. Downsamples to max_points per field if needed."""
    since = time.time() - hours * 3600
    out = {}
    with _DB_LOCK:
        for key, (eui, field) in SPARK_SOURCES.items():
            cur = _db.execute(
                "SELECT ts, value FROM readings WHERE dev_eui=? AND field=? AND ts>=?"
                " ORDER BY ts ASC",
                (eui, field, since))
            rows = cur.fetchall()
            if not rows:
                continue
            # downsample to max_points evenly
            if len(rows) > max_points:
                step = (len(rows) - 1) / (max_points - 1)
                rows = [rows[round(i * step)] for i in range(max_points)]
            out[key] = [[r[0], r[1]] for r in rows]
    return out


@locked
def load_state_from_db():
    """Seed STATE with the most recent real value per dashboard key, so the
    dashboard shows live data immediately after a restart (not mock/empty)."""
    with _DB_LOCK:
        for key, (eui, field) in SPARK_SOURCES.items():
            cur = _db.execute(
                "SELECT value, ts FROM readings WHERE dev_eui=? AND field=?"
                " ORDER BY ts DESC LIMIT 1",
                (eui, field))
            row = cur.fetchone()
            if row and key in STATE:
                STATE[key] = row[0]
                METRIC_TS[key] = row[1]
        for eui, ts in _db.execute("SELECT dev_eui, MAX(ts) FROM readings GROUP BY dev_eui"):
            DEVICES[eui] = {"name": eui, "dev_eui": eui, "last_seen_ts": ts,
                            "last_seen": time.strftime("%H:%M:%S", time.localtime(ts)), "frames": 0}
        # Populate drill-down fields from persisted data as well as current uplinks.
        for eui in DEVICES:
            FIELDS[eui] = {}
            names = [r[0] for r in _db.execute("SELECT DISTINCT field FROM readings WHERE dev_eui=?", (eui,))]
            for field in names:
                rows = list(_db.execute("SELECT ts,value FROM readings WHERE dev_eui=? AND field=? ORDER BY ts DESC LIMIT ?",
                                        (eui, field, FIELD_HISTORY)))
                FIELDS[eui][field] = {"latest": rows[0][1], "history": collections.deque(
                    ([time.strftime("%H:%M:%S", time.localtime(ts)), v] for ts, v in reversed(rows)), maxlen=FIELD_HISTORY)}
    log.info("seeded state from db: %s",
             {k: v for k, v in STATE.items() if v is not None and k != "mesh.msgs"})


def _flatten_messages(obj):
    """Yield (measurementId, value, type) from object.messages (list of lists)."""
    msgs = obj.get("messages")
    if not isinstance(msgs, list):
        return
    for group in msgs:
        items = group if isinstance(group, list) else [group]
        for it in items:
            if not isinstance(it, dict):
                continue
            mid = it.get("measurementId")
            val = it.get("measurementValue")
            typ = it.get("type")
            if mid is None or val is None:
                continue
            try:
                mid = int(mid)
            except (TypeError, ValueError, OverflowError):
                continue
            yield mid, val, typ


def decode_fields(dev_eui, msg):
    """Return {friendly_field: value} for one uplink."""
    obj = msg.get("object") or {}
    if not isinstance(obj, dict):
        return {}
    fields = {}
    chan_map = DEVICE_CHANNELS.get(dev_eui, {})
    for mid, val, typ in _flatten_messages(obj):
        name = chan_map.get(mid) or T1000_TYPES.get(mid)
        if name is None:
            # T1000 also matches on the human `type` string.
            if isinstance(typ, str):
                name = typ.lower()
            else:
                name = "ch %s" % mid
        if finite(val):
            fields[name] = val
    return fields


def digest_uplink(msg: dict):
    """Return (dashboard_updates, friendly_fields, dev_eui) for one uplink."""
    info = msg.get("deviceInfo") or {}
    dev_eui = info.get("devEui") or "unknown"
    fields = decode_fields(dev_eui, msg)
    updates = {}
    for (eui, fname), key in DASHBOARD_MAP.items():
        if eui == dev_eui and fname in fields:
            updates[key] = fields[fname]
    if "weather.rain_24h" in updates:
        updates["weather.rain_rate"] = updates["weather.rain_24h"]
    return updates, fields, dev_eui


# ---------------------------------------------------------------------------
# Meshtastic (msh/<region>/2/json/<channel>/!<nodeid>).
# JSON payloads carry a "type": text | position | telemetry | nodeinfo.
# ---------------------------------------------------------------------------
def _node_name(node_id, payload):
    """Best-effort human name for a mesh node."""
    for k in ("longname", "longName", "shortname", "shortName", "name"):
        v = payload.get(k)
        if v:
            return v
    return str(node_id).lstrip("!")


def _mesh_dedup_key(msg, payload, mtype):
    """Return a dedup key for one mesh packet, or None if not dedupable.

    Two farm gateways hear the same Meshtastic packet and the farm relays
    both, so the same message can arrive twice. The reliable key is the
    Meshtastic packet `id`; fall back to (sender, text) for text messages
    that carry no id.
    """
    pid = msg.get("id", payload.get("id"))
    if pid is not None:
        return ("id", str(msg.get("from", msg.get("sender", payload.get("from", "")))), str(pid))
    if mtype == "text":
        sender = msg.get("from", msg.get("sender", payload.get("from")))
        text = payload.get("text") or payload.get("message") or ""
        return ("ft", str(sender), text)
    return None


def mesh_is_duplicate(msg, payload, mtype):
    """True if this mesh packet was already seen (within the ring buffer)."""
    key = _mesh_dedup_key(msg, payload, mtype)
    if key is None:
        return False
    if key in MESH_SEEN_SET:
        return True
    if len(MESH_SEEN) == MESH_SEEN.maxlen:
        MESH_SEEN_SET.discard(MESH_SEEN[0])
    MESH_SEEN.append(key)
    MESH_SEEN_SET.add(key)
    return False


@locked
def handle_mesh(topic, msg):
    """Process one Meshtastic MQTT message; update nodes, chat, and STATE."""
    mtype = str(msg.get("type") or "").lower()
    payload = msg.get("payload") or msg
    # Dedupe repeated mesh packets (two gateways hear the same packet).
    if mesh_is_duplicate(msg, payload, mtype):
        log.info("duplicate mesh packet ignored (id=%s)", msg.get("id") or payload.get("id"))
        return
    # node id from the topic (!<nodeid>) or the payload
    node_id = msg.get("from", msg.get("sender", payload.get("from")))
    if node_id is None and "!" in topic:
        node_id = topic.rsplit("!", 1)[-1]
    node_id = str(node_id if node_id is not None else "unknown")

    node = MESH_NODES.setdefault(node_id, {"name": _node_name(node_id, payload)})
    node["last_heard"] = time.strftime("%H:%M:%S")
    node["last_heard_ts"] = time.time()
    if "longname" in payload or "longName" in payload or "shortname" in payload or "shortName" in payload:
        node["name"] = _node_name(node_id, payload)

    hops = msg.get("hops_away", payload.get("hops"))
    if finite(hops) and hops >= 0:
        node["hops"] = hops
    if mtype == "text":
        text = payload.get("text") or payload.get("message") or ""
        if text:
            MESH_MSGS.append({
                "who": node["name"],
                "meta": node.get("hops", "") and ("%s hops" % node["hops"]) or time.strftime("%H:%M"),
                "text": text,
                "me": False,
                "ts": time.time(),
            })
            STATE["mesh.msgs"] = list(MESH_MSGS)
            broadcast({"type": "update", "data": {"mesh.msgs": list(MESH_MSGS)}})

    elif mtype == "position":
        lat = payload.get("latitude", payload.get("lat"))
        lon = payload.get("longitude", payload.get("lon"))
        if lat is None and finite(payload.get("latitude_i")):
            lat = payload["latitude_i"] / 1e7
        if lon is None and finite(payload.get("longitude_i")):
            lon = payload["longitude_i"] / 1e7
        if finite(lat) and finite(lon) and -90 <= lat <= 90 and -180 <= lon <= 180:
            node["lat"], node["lon"] = lat, lon
            node["position_ts"] = time.time()

    elif mtype in ("telemetry", "nodeinfo"):
        metrics = payload.get("device_metrics", payload.get("deviceMetrics", payload))
        if isinstance(metrics, dict):
            for key in ("battery", "batteryLevel", "battery_level"):
                batt = metrics.get(key)
                if finite(batt) and 0 <= batt <= 101:
                    node["battery"] = batt
                    break

    # update node count + broadcast
    STATE["mesh.nodes"] = len(MESH_NODES)
    broadcast({"type": "update", "data": {"mesh.nodes": len(MESH_NODES)}})
    log.info("mesh %s from %s (%s); %d nodes", mtype or "?", node_id, node["name"], len(MESH_NODES))


def is_duplicate(msg: dict, remember=True) -> bool:
    """Two farm gateways hear the same sensor, so the same uplink can arrive
    twice. ChirpStack gives each gateway copy a DIFFERENT deduplicationId, so
    the reliable key is (devEui, fCnt). Dedupe within a short time window."""
    info = msg.get("deviceInfo") or {}
    dev_eui = info.get("devEui") or "unknown"
    fcnt = msg.get("fCnt")
    if fcnt is None:
        return False
    key = (dev_eui, fcnt)
    now = time.monotonic()
    if now - SEEN_TIMES.get(key, -float("inf")) < 300:
        return True
    if remember:
        if len(SEEN_TIMES) >= 1000:
            SEEN_TIMES.pop(min(SEEN_TIMES, key=SEEN_TIMES.get))
        SEEN_TIMES[key] = now
    return False


@locked
def apply_updates(updates: dict, received_at=None):
    """Merge updates into STATE and broadcast to all WebSocket clients."""
    now = time.time() if received_at is None else received_at
    updates = {k: v for k, v in updates.items() if k in STATE and finite(v)}
    if not updates:
        return
    STATE.update(updates)
    METRIC_TS.update({k: now for k in updates})
    # Unchanged values are still new observations and must refresh their age.
    broadcast({"type": "update", "data": updates, "meta": metric_payload()})


def broadcast(payload: dict, admin_only: bool = False):
    """Send a JSON message to connected browsers (thread-safe).

    admin_only=True sends only to admin page sockets; otherwise the message
    goes to both dashboard and admin sockets.
    """
    if LOOP is None:
        return
    msg = json.dumps(payload, allow_nan=False)
    async def send_all():
        targets = list(ADMIN_CLIENTS if admin_only else CLIENTS | ADMIN_CLIENTS)
        await asyncio.gather(*(_safe_send(ws, msg) for ws in targets))
    asyncio.run_coroutine_threadsafe(send_all(), LOOP)


async def _safe_send(ws, msg):
    try:
        await ws.send(msg)
    except Exception:
        CLIENTS.discard(ws)
        ADMIN_CLIENTS.discard(ws)


@locked
def record_uplink(topic: str, msg: dict):
    """Store a raw uplink and per-device metadata; notify admin clients."""
    info = msg.get("deviceInfo") or {}
    dev_eui = info.get("devEui") or info.get("dev_eui") or "unknown"
    name = info.get("deviceName") or dev_eui
    rx = (msg.get("rxInfo") or [{}])[0]
    received_at = time.time()
    decoded = decode_fields(dev_eui, msg)
    # Commit first: a failed write must not publish or suppress a retry.
    db_store(dev_eui, decoded, received_at)
    entry = {
        "ts": time.strftime("%H:%M:%S", time.localtime(received_at)),
        "received_at": received_at,
        "decoded": decoded,
        "topic": topic,
        "device": name,
        "dev_eui": dev_eui,
        "rssi": rx.get("rssi") if finite(rx.get("rssi")) else None,
        "snr": rx.get("snr") if finite(rx.get("snr")) else None,
        "fcnt": msg.get("fCnt"),
        "object": msg.get("object"),
        "raw": msg,
    }
    RAW_LOG.appendleft(entry)

    d = DEVICES.setdefault(dev_eui, {"name": name, "frames": 0})
    d["dev_eui"] = dev_eui
    d["name"] = name
    d["last_seen"] = entry["ts"]
    d["last_seen_ts"] = received_at
    d["rssi"] = entry["rssi"]
    d["snr"] = entry["snr"]
    d["fcnt"] = entry["fcnt"]
    d["frames"] = d.get("frames", 0) + 1

    # Track decoded field history per device for the data-driven pages.
    for key, val in decoded.items():
        if finite(val):
            dev_fields = FIELDS.setdefault(dev_eui, {})
            f = dev_fields.setdefault(key, {"latest": None, "history": collections.deque(maxlen=FIELD_HISTORY)})
            f["latest"] = val
            f["history"].append([entry["ts"], val])
    broadcast({"type": "raw", "data": entry}, admin_only=True)
    return received_at


@locked
def fields_payload():
    """Serialize per-device field history for the data-driven pages."""
    out = {}
    for dev_eui, fields in FIELDS.items():
        name = DEVICES.get(dev_eui, {}).get("name", dev_eui)
        out[dev_eui] = {
            "name": name,
            "fields": {
                k: {"latest": v["latest"], "history": list(v["history"])}
                for k, v in fields.items()
            },
        }
    return out


# Data-health thresholds (seconds). Sensors report roughly once per hour.
HEALTH_LIVE = 90 * 60        # < 90 min  -> live
HEALTH_STALE = 3 * 3600      # 90 min-3 h -> stale; > 3 h / never -> down


def _health_status(age):
    """Map an age in seconds (None = never seen) to a status string."""
    if age is None:
        return "down"
    if age < HEALTH_LIVE:
        return "live"
    if age < HEALTH_STALE:
        return "stale"
    return "down"


@locked
def health_payload():
    """Per-source data health: is data still being received, and how long ago
    was the last message. Covers each LoRa device, each Meshtastic node, and
    an overall 'lora' / 'meshtastic' category."""
    now = time.time()

    def entry(name, ts):
        age = (now - ts) if ts else None
        return {
            "name": name,
            "last_seen": ts,
            "age_s": max(0, round(age)) if age is not None else None,
            "status": _health_status(age),
        }

    lora = [dict(entry(d.get("name", eui), d.get("last_seen_ts")), id=eui)
            for eui, d in DEVICES.items()]
    mesh = [dict(entry(n.get("name", nid), n.get("last_heard_ts")), id=nid)
            for nid, n in MESH_NODES.items()]

    def category(cat, sources):
        ts = max((s["last_seen"] for s in sources if s["last_seen"]), default=None)
        e = entry(cat, ts)
        e["sources"] = len(sources)
        e["counts"] = dict(collections.Counter(s["status"] for s in sources))
        return e

    return {
        "generated_at": now,
        "thresholds": {"live_s": HEALTH_LIVE, "stale_s": HEALTH_STALE},
        "categories": [category("lora", lora), category("meshtastic", mesh)],
        "lora": lora,
        "meshtastic": mesh,
    }


@locked
def admin_snapshot():
    return {
        "type": "admin_snapshot",
        "data": {
            "state": copy.deepcopy(STATE),
            "devices": copy.deepcopy(list(DEVICES.values())),
            "raw": copy.deepcopy(list(RAW_LOG)),
            "fields": fields_payload(),
            "mesh": mesh_payload(),
            "health": health_payload(),
        },
    }


@locked
def mesh_payload():
    """Serialize mesh nodes for the map/status pages."""
    return {
        "count": len(MESH_NODES),
        "nodes": [
            {
                "id": nid,
                "name": n.get("name", nid),
                "last_heard": n.get("last_heard"),
                "last_heard_ts": n.get("last_heard_ts"),
                "position_ts": n.get("position_ts"),
                "status": _health_status(time.time() - n["last_heard_ts"]) if n.get("last_heard_ts") else "down",
                "battery": n.get("battery"),
                "lat": n.get("lat"),
                "lon": n.get("lon"),
                "hops": n.get("hops"),
            }
            for nid, n in MESH_NODES.items()
        ],
    }


@locked
def metric_payload():
    now = time.time()
    return {key: {"last_received": METRIC_TS.get(key),
                  "age_s": max(0, round(now - METRIC_TS[key])) if key in METRIC_TS else None,
                  "status": _health_status(now - METRIC_TS[key] if key in METRIC_TS else None),
                  "source": source[0], "field": source[1]}
            for key, source in SPARK_SOURCES.items()}


@locked
def overview_payload():
    return {"state": copy.deepcopy(STATE), "metrics": metric_payload(),
            "health": health_payload(), "mesh": mesh_payload(),
            "server": dict(RUNTIME, generated_at=time.time())}


def process_message(topic, msg):
    """Validate external envelopes before they can mutate state or stop MQTT."""
    if not isinstance(msg, dict):
        return False
    try:
        json.dumps(msg, allow_nan=False)
        with STATE_LOCK:
            if topic.startswith("msh/"):
                payload = msg.get("payload", msg)
                if not isinstance(payload, dict) or msg.get("type") not in ("text", "nodeinfo", "telemetry", "position"):
                    return False
                for key in ("from", "sender", "id"):
                    if key in msg and not isinstance(msg[key], (str, int)):
                        return False
                for key in ("id", "from", "text", "message", "longname", "longName", "shortname", "shortName", "name"):
                    if key in payload and not isinstance(payload[key], (str, int)):
                        return False
                for key in ("text", "message", "longname", "longName", "shortname", "shortName", "name"):
                    if key in payload and not isinstance(payload[key], str):
                        return False
                handle_mesh(topic, msg)
            else:
                info = msg.get("deviceInfo")
                if not isinstance(info, dict) or not isinstance(info.get("devEui"), str):
                    return False
                if not info["devEui"] or ("deviceName" in info and not isinstance(info["deviceName"], str)):
                    return False
                if "fCnt" in msg and (type(msg["fCnt"]) is not int or msg["fCnt"] < 0):
                    return False
                rx = msg.get("rxInfo", [])
                if not isinstance(rx, list) or any(not isinstance(r, dict) for r in rx):
                    return False
                if is_duplicate(msg, remember=False):
                    return False
                received_at = record_uplink(topic, msg)
                is_duplicate(msg)
                updates, fields, _ = digest_uplink(msg)
                if fields:
                    RUNTIME["storage_error"] = False
                apply_updates(updates, received_at)
            RUNTIME["mqtt_last_message"] = time.time()
            return True
    except sqlite3.Error:
        with STATE_LOCK:
            RUNTIME["storage_error"] = True
        log.exception("telemetry storage failed; MQTT consumer remains active")
        return False
    except (TypeError, ValueError, OverflowError, RecursionError):
        log.warning("invalid telemetry envelope ignored")
        return False


# ---------------------------------------------------------------------------
# MQTT
# ---------------------------------------------------------------------------
def start_mqtt(host, port, topic, username, password, tls=False, prefix="",
               cafile=None, insecure=False):
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    if username:
        client.username_pw_set(username, password)
    if tls:
        import ssl
        # cafile: for brokers whose certificate is not signed by a public CA.
        # EMQX ships a demo certificate signed by its own "EMQ RootCA" and with
        # CN=Server, so connecting by IP needs both the CA file and --mqtt-insecure
        # (which only turns off the hostname check, never the chain check).
        client.tls_set(ca_certs=cafile, cert_reqs=ssl.CERT_REQUIRED)
        if insecure:
            client.tls_insecure_set(True)

    def on_connect(c, userdata, flags, rc, properties=None):
        with STATE_LOCK:
            RUNTIME["mqtt_connected"] = not rc.is_failure
        if rc.is_failure:
            return
        # subscribe to the (possibly prefixed) LoRa + Meshtastic topics
        lora_topic = prefix + topic if prefix else topic
        mesh_topic = prefix + "msh/#"
        log.info("mqtt connected rc=%s, subscribing %s + %s", rc, lora_topic, mesh_topic)
        c.subscribe(lora_topic)
        c.subscribe(mesh_topic)

    def on_message(c, userdata, m):
        if len(m.payload) > 256 * 1024:
            log.warning("oversized MQTT payload ignored")
            return
        try:
            msg = json.loads(m.payload, parse_constant=lambda value: (_ for _ in ()).throw(ValueError(value)))
        except (ValueError, UnicodeDecodeError, RecursionError):
            return  # encrypted mesh/protobuf and malformed JSON are not telemetry
        t = m.topic[len(prefix):] if prefix and m.topic.startswith(prefix) else m.topic
        process_message(t, msg)

    def on_disconnect(c, userdata, flags, rc, properties=None):
        with STATE_LOCK:
            RUNTIME["mqtt_connected"] = False

    client.on_disconnect = on_disconnect
    client.on_connect = on_connect
    client.on_message = on_message

    def connect_loop():
        import time
        while True:
            try:
                client.connect(host, port, keepalive=60)
                client.loop_start()
                return
            except OSError as e:
                log.warning("mqtt connect failed (%s), retrying in 5 s", e)
                time.sleep(5)

    threading.Thread(target=connect_loop, daemon=True).start()
    return client


# ---------------------------------------------------------------------------
# WebSocket server
# ---------------------------------------------------------------------------
async def ws_handler(ws):
    path = getattr(ws.request, "path", "/") if ws.request else "/"
    is_admin = path.rstrip("/").endswith("admin")
    group = ADMIN_CLIENTS if is_admin else CLIENTS
    group.add(ws)
    log.info("%s connected (%d dashboard, %d admin)",
             "admin" if is_admin else "dashboard", len(CLIENTS), len(ADMIN_CLIENTS))
    try:
        if is_admin:
            await ws.send(json.dumps(admin_snapshot(), allow_nan=False))
        else:
            # Full snapshot on connect so the dashboard populates immediately.
            with STATE_LOCK:
                snapshot = json.dumps({"type": "snapshot", "data": STATE, "meta": metric_payload()}, allow_nan=False)
            await ws.send(snapshot)
        async for _ in ws:  # ignore inbound; keep the socket open
            pass
    finally:
        group.discard(ws)
        log.info("client disconnected (%d dashboard, %d admin)",
                 len(CLIENTS), len(ADMIN_CLIENTS))


async def ws_server(host, port, ready=None):
    async with serve(ws_handler, host, port, max_size=4096, max_queue=16):
        log.info("websocket listening on ws://%s:%d", host, port)
        if ready is not None:
            ready.set()
        await asyncio.Future()  # run forever


def start_ws(host, port, ready=None, errors=None):
    global LOOP
    LOOP = asyncio.new_event_loop()
    asyncio.set_event_loop(LOOP)
    try:
        LOOP.run_until_complete(ws_server(host, port, ready))
    except OSError as exc:
        if errors is None:
            raise
        errors.append(exc)
        ready.set()


# ---------------------------------------------------------------------------
# HTTP static server
# ---------------------------------------------------------------------------
class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(ROOT), **kw)

    PUBLIC_FILES = {"dashboard-a.html", "dashboard-b.html", "dashboard-b-client.js",
                    "ops-core.js", "ops.css", "farm-connection.js", "workbench.js", "admin.html", "data.html",
                    "live-client.js", "b.html", "map.svg"}
    ROUTES = {"/": "dashboard-a.html", "/index.html": "dashboard-a.html", "/a": "dashboard-a.html",
              "/b": "dashboard-b.html", "/ops": "dashboard-b.html", "/admin": "admin.html", "/data": "data.html"}

    def do_HEAD(self):
        self._dispatch(head=True)

    def do_GET(self):
        self._dispatch()

    def _dispatch(self, head=False):
        parsed = urlsplit(self.path)
        path = unquote(parsed.path)
        if path.startswith("/api/"):
            try:
                with STATE_LOCK:
                    if path == "/api/raw":
                        obj = {"state": copy.deepcopy(STATE), "devices": copy.deepcopy(list(DEVICES.values())), "raw": copy.deepcopy(list(RAW_LOG))}
                    elif path == "/api/fields": obj = fields_payload()
                    elif path == "/api/mesh": obj = mesh_payload()
                    elif path == "/api/health": obj = health_payload()
                    elif path == "/api/overview": obj = overview_payload()
                    elif path == "/api/config": obj = {"ws_port": RUNTIME["ws_port"], "mode": RUNTIME["mode"]}
                    elif path == "/api/wind": obj = {"wind": db_wind_history()}
                    elif path == "/api/sparklines": obj = db_sparklines()
                    elif path == "/api/history":
                        hours = int(parse_qs(parsed.query).get("hours", ["24"])[0])
                        if not 1 <= hours <= 168: raise ValueError()
                        obj = db_history(hours=hours)
                    else: return self._json({"error": "not_found"}, 404, head)
                return self._json(obj, head=head)
            except ValueError:
                return self._json({"error": "hours must be an integer from 1 to 168"}, 400, head)
            except sqlite3.Error:
                log.exception("database query failed")
                return self._json({"error": "storage_unavailable"}, 503, head)
        name = self.ROUTES.get(path, path.lstrip("/"))
        # Serve only explicit public assets, never .env, source, local context or databases.
        if name not in self.PUBLIC_FILES or (ROOT / name).is_symlink():
            return self.send_error(404)
        self.path = "/" + name
        if head: super().do_HEAD()
        else: super().do_GET()

    def _json(self, obj, status=200, head=False):
        body = json.dumps(obj, allow_nan=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        if not head:
            self.wfile.write(body)

    def end_headers(self):
        # The dashboard HTML may be served from another origin (the fab.lan
        # module proxies it and points it back here), so the browser needs
        # permission before it will read the /api/... responses.
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "same-origin")
        if not urlsplit(self.path).path.startswith("/api/"):
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, fmt, *args):
        log.info("http " + fmt, *args)


def start_http(port, host="0.0.0.0"):
    srv = ThreadingHTTPServer((host, port), Handler)
    log.info("http serving %s on http://%s:%d", ROOT, host, port)
    srv.serve_forever()


# ---------------------------------------------------------------------------
def main():
    pre = argparse.ArgumentParser(add_help=False)
    pre.add_argument("--env-file")
    env_args, _ = pre.parse_known_args()
    if env_args.env_file:
        # Deliberately literal values: no shell evaluation or variable expansion.
        for line in Path(env_args.env_file).read_text().splitlines():
            if not line.strip() or line.lstrip().startswith("#"): continue
            key, sep, value = line.partition("=")
            if not sep or not key.strip().startswith(("FARM_", "MQTT_")):
                raise SystemExit("invalid environment file entry")
            value = value.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'": value = value[1:-1]
            os.environ.setdefault(key.strip(), value)
    ap = argparse.ArgumentParser(parents=[pre])
    ap.add_argument("--bind", default=os.getenv("FARM_BIND", "0.0.0.0"))
    ap.add_argument("--db", default=os.getenv("FARM_DB", str(ROOT / "farm.db")))
    ap.add_argument("--demo", action="store_true", help="isolated in-memory fixture; never connects to MQTT")
    ap.add_argument("--http-port", type=int, default=int(os.getenv("FARM_HTTP_PORT", "8000")))
    ap.add_argument("--ws-port", type=int, default=int(os.getenv("FARM_WS_PORT", "8765")))
    ap.add_argument("--mqtt-host", default=os.getenv("MQTT_HOST", "127.0.0.1"))
    ap.add_argument("--mqtt-port", type=int, default=int(os.getenv("MQTT_PORT", "1883")))
    ap.add_argument("--mqtt-topic", default=os.getenv("MQTT_TOPIC", "application/+/device/+/event/up"))
    ap.add_argument("--mqtt-user", default=os.getenv("MQTT_USER", None))
    ap.add_argument("--mqtt-pass", default=os.getenv("MQTT_PASSWORD", None))
    ap.add_argument("--mqtt-tls", action="store_true", default=os.getenv("MQTT_TLS") == "1")
    ap.add_argument("--mqtt-prefix", default=os.getenv("MQTT_PREFIX", ""))
    ap.add_argument("--mqtt-cafile", default=os.getenv("MQTT_CAFILE", None),
                    help="CA bundle for brokers with a private/self-signed CA")
    ap.add_argument("--mqtt-insecure", action="store_true",
                    help="skip the TLS hostname check (chain is still verified)")
    args = ap.parse_args()

    if not all(1 <= p <= 65535 for p in (args.http_port, args.ws_port, args.mqtt_port)):
        ap.error("ports must be from 1 to 65535")
    if args.http_port == args.ws_port:
        ap.error("HTTP and WebSocket ports must differ")
    if args.demo:
        args.bind = "127.0.0.1"
    # Fail startup if either listener cannot bind; never leave a half-live service.
    http_server = ThreadingHTTPServer((args.bind, args.http_port), Handler)
    init_db(":memory:" if args.demo else args.db)
    RUNTIME.update(mode="demo" if args.demo else "live", ws_port=args.ws_port)
    load_state_from_db()
    if args.demo:
        from demo import seed, run
        seed()
        threading.Thread(target=run, daemon=True).start()
    ready, errors = threading.Event(), []
    threading.Thread(target=start_ws, args=(args.bind, args.ws_port, ready, errors), daemon=True).start()
    if not ready.wait(10) or errors:
        http_server.server_close()
        raise SystemExit("WebSocket listener could not start; check bind address and port")
    if not args.demo:
        start_mqtt(args.mqtt_host, args.mqtt_port, args.mqtt_topic,
                   args.mqtt_user, args.mqtt_pass,
                   tls=args.mqtt_tls, prefix=args.mqtt_prefix,
                   cafile=args.mqtt_cafile, insecure=args.mqtt_insecure)
    log.info("http listening on http://%s:%d", args.bind, args.http_port)
    try:
        http_server.serve_forever()
    finally:
        http_server.server_close()


if __name__ == "__main__":
    # The demo imports bridge to exercise the same ingestion path.
    import sys
    sys.modules["bridge"] = sys.modules[__name__]
    main()
