# Agri-Env Ops Dashboard

A self-hosted environmental monitoring console. A single Python bridge subscribes
to your MQTT broker, decodes sensor readings, stores history in SQLite, and serves
a set of fast, offline dashboards over HTTP with live updates over WebSocket.
No cloud account, no build step, no JavaScript framework.

It is **receive-only**: it displays what your devices report and never sends commands.

## Features

- **Live readings** — air temperature / humidity, wind speed + direction (wind rose),
  rainfall, soil temperature / moisture / EC, CO₂, pressure, illuminance, PM2.5 / PM10.
- **Trends** — smoothed history graphs per metric, from the local SQLite store.
- **Map** — reported node positions.
- **Mesh communications** — Meshtastic node list and received text messages.
- **Data freshness** — per-source live / delayed / silent indication.
- **EN / 中文 toggle** — the UI switches between English and Chinese.
- **Diagnostics pages** — `/admin` (transports, sources, raw uplinks) and `/data`
  (per-device fields and dated trends).
- **Offline** — local fonts and assets; no CDN, no npm.

## Quick start (demo, no broker needed)

Python 3.10+. Dependencies are in `requirements.txt` (`paho-mqtt`, `websockets`).

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python bridge.py --demo --http-port 8018 --ws-port 8778
```

Open `http://127.0.0.1:8018/ops`. Demo mode binds loopback only, uses an in-memory
database, never connects to MQTT, and emits synthetic readings through the real
decoder every few seconds.

## Configuration (live mode)

```sh
cp .env.example .env
chmod 600 .env
# set MQTT_HOST / MQTT_PORT / MQTT_USER / MQTT_PASSWORD / MQTT_PREFIX / MQTT_TOPIC
.venv/bin/python bridge.py --env-file .env
```

- Precedence: CLI flags > process environment > `.env`.
- Defaults: HTTP `8000`, WebSocket `8765`. Change the bind address with `FARM_BIND`.
- Use TLS for a production broker (`MQTT_TLS=1`, the TLS port, and `MQTT_CAFILE`
  pointing at your CA bundle).
- **Never commit `.env`** — it holds your broker credentials.

## Input modes

The bridge accepts two input contracts, selected with `--source {auto,uplink,bridge}`
or `MQTT_SOURCE` (default `auto`):

| Mode | MQTT topic | Behaviour |
|---|---|---|
| `uplink` | `application/+/device/+/event/up` (default) | Decodes raw ChirpStack uplinks itself (unchanged, the original behaviour). |
| `bridge` | `agri_env/+/+/state` (default when `MQTT_SOURCE=bridge`) | Consumes the normalized contract published by [agri-env-monitor](https://github.com/suharvest/agri-env-monitor) (`agri_env_bridge`) — no decoding, no per-DevEUI table. |
| `auto` | either | Picks `bridge` when the configured `MQTT_TOPIC` matches the bridge state pattern `<base>/+/+/state`, otherwise `uplink`. The resolved mode is logged once at connect. |

In `bridge` mode the dashboard subscribes to:

| Topic | Payload |
|---|---|
| `agri_env/<node_id>/<entity_key>/state` | retained literal string (`ON`/`OFF` → bool, otherwise float when it parses) |
| `agri_env/<node_id>/availability` | retained `online` / `offline` (drives per-device status) |
| `homeassistant/sensor/<node_id>/<entity_key>/config` | retained JSON discovery config (metadata only: name / unit / device_class) |

`node_id` is `sensecap_<eui lowercased>`; the DevEUI is derived by stripping the
prefix. Generic `entity_key`s (`temperature`, `humidity`, `co2`, `wind_speed`,
`rainfall_hourly`, `soil_moisture`, …) map directly onto the dashboard cards, and
unmapped keys still appear under the device's fields on `/data` and `/admin`.
History, trends, and the wind rose keep working via the same SQLite store.

Bridge-mode quickstart (broker on localhost):

```sh
MQTT_SOURCE=bridge .venv/bin/python bridge.py --env-file .env
# or: .venv/bin/python bridge.py --source bridge --mqtt-host 127.0.0.1
```

## Routes

| Route | Purpose |
|---|---|
| `/ops`, `/b` | Operations console (main dashboard) |
| `/`, `/a` | Clean / kiosk dashboard |
| `/admin` | Diagnostics: transports, sources, raw uplinks |
| `/data` | Sensor details: per-device fields and dated trends |
| `/api/health` | JSON liveness + per-source data health |

## Docker

```sh
cp .env.example .env   # fill in your broker settings
docker compose up -d --build
open http://localhost:8000/ops
```

The `Dockerfile` is multi-arch (`amd64` + `arm64`) and runs the bridge as a
non-root user with the SQLite store on a volume (`/data`). All configuration is
read from environment variables; no secrets are baked into the image.

## What it is not

- It does not send commands or classify hazards — it is a monitoring display.
- It does not replace your LoRaWAN network server or broker; it subscribes to the
  MQTT stream they already publish.

## License

MIT — see [LICENSE](LICENSE).
