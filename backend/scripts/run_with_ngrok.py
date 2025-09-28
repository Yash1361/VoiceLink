"""Utility to launch the VoiceLink API locally and expose it via ngrok."""

from __future__ import annotations

import os
import signal
import sys
from contextlib import suppress

from pyngrok import conf, ngrok
import uvicorn

# Ensure the backend package (`app`) is importable when executed from repo root
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)


def main() -> None:
    port = int(os.environ.get("APP_PORT", "8000"))
    authtoken = os.environ.get("NGROK_AUTHTOKEN")
    region = os.environ.get("NGROK_REGION")

    if authtoken:
        conf.get_default().auth_token = authtoken
    if region:
        conf.get_default().region = region

    public_tunnel = ngrok.connect(port, "http")
    print("ngrok tunnel established:", public_tunnel.public_url)
    print("Forwarding to http://127.0.0.1:%d" % port)

    def _cleanup(*_: object) -> None:
        with suppress(Exception):
            ngrok.disconnect(public_tunnel.public_url)
        with suppress(Exception):
            ngrok.kill()

    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, lambda *_: (_cleanup(), sys.exit(0)))

    try:
        uvicorn.run(
            "app.main:app",
            host="0.0.0.0",
            port=port,
            reload=os.environ.get("APP_RELOAD", "false").lower() == "true",
            log_level=os.environ.get("APP_LOG_LEVEL", "info"),
        )
    finally:
        _cleanup()


if __name__ == "__main__":
    main()
