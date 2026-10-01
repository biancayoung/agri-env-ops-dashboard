# Agri-Env Ops Dashboard — self-hosted environmental monitoring console.
# Multi-arch (amd64 + arm64). All runtime config comes from env vars
# (FARM_* and MQTT_*); see .env.example. No secrets are baked into the image.
FROM python:3.11-slim

# Keep Python sane in a container and force UTF-8 (the dashboards serve Chinese).
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUTF8=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Install dependencies first for better layer caching.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy the application: bridge, dashboards, client JS, fonts, map.
COPY bridge.py demo.py build_live.py check.py ./
COPY dashboard-a.html dashboard-b.html dashboard-b-client.js ./
COPY admin.html data.html b.html ./
COPY ops.css ops-core.js farm-connection.js workbench.js live-client.js ./
COPY map.svg ./
COPY assets ./assets

# Run as a non-root user. The SQLite DB lives in /data (a volume in production).
RUN useradd --create-home --uid 10001 appuser \
    && mkdir -p /data \
    && chown -R appuser:appuser /app /data
USER appuser

# Default runtime configuration (override via env at deploy time).
ENV FARM_BIND=0.0.0.0 \
    FARM_HTTP_PORT=8000 \
    FARM_WS_PORT=8765 \
    FARM_DB=/data/farm.db

EXPOSE 8000 8765

# Liveness: the bridge serves a JSON health endpoint on the HTTP port.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD python -c "import os,urllib.request,sys; \
port=os.environ.get('FARM_HTTP_PORT','8000'); \
sys.exit(0 if urllib.request.urlopen(f'http://127.0.0.1:{port}/api/health',timeout=4).status==200 else 1)"

# Live mode: reads MQTT_* / FARM_* from the environment. No hardcoded broker.
CMD ["python", "bridge.py"]
