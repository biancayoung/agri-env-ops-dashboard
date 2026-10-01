#!/usr/bin/env python3
"""Build dashboard-a.html from b.html by injecting the live-data WebSocket client.

b.html is the editable source for Dashboard A (the clean live dashboard);
dashboard-a.html is the generated output served by bridge.py at / and /a.
Do not edit dashboard-a.html directly -- edit b.html and re-run this script.

Usage: python3 build_live.py [src] [out]
Defaults: b.html -> dashboard-a.html
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
src = ROOT / (sys.argv[1] if len(sys.argv) > 1 else "b.html")
out = ROOT / (sys.argv[2] if len(sys.argv) > 2 else "dashboard-a.html")
client = (ROOT / "farm-connection.js").read_text(encoding="utf-8") + "\n" + (ROOT / "live-client.js").read_text(encoding="utf-8")

html = src.read_text(encoding="utf-8")
inject = "<script>\n" + client + "\n</script>\n</body>"
if "</body>" not in html:
    sys.exit("no </body> in " + str(src))
html = html.replace("</body>", inject, 1)
out.write_text(html, encoding="utf-8")
print("built", out.name, "from", src.name)
