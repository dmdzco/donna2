#!/usr/bin/env python3
"""One-time helper to get a Google OAuth refresh token for Drive API access.

Usage:
    1. Create a Google Cloud project and enable the Drive API.
    2. Create OAuth 2.0 credentials (Desktop app type).
    3. Download the client ID and secret.
    4. Run this script:
         GOOGLE_CLIENT_ID=xxx GOOGLE_CLIENT_SECRET=yyy python scripts/generate-drive-token.py
    5. Follow the browser prompt to authorize.
    6. Copy the printed refresh token into your GitHub secrets as GOOGLE_REFRESH_TOKEN.

Dependencies: requests (pip install requests)
"""

import os
import sys
import webbrowser
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlencode, urlparse, parse_qs

import requests

SCOPES = "https://www.googleapis.com/auth/drive.readonly"
REDIRECT_PORT = 8090
REDIRECT_URI = f"http://localhost:{REDIRECT_PORT}"
TOKEN_URL = "https://oauth2.googleapis.com/token"
AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"

# Will be set by the callback handler
_auth_code = None


class CallbackHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        global _auth_code
        query = parse_qs(urlparse(self.path).query)

        if "error" in query:
            self.send_response(400)
            self.send_header("Content-Type", "text/html")
            self.end_headers()
            self.wfile.write(b"<h1>Authorization failed.</h1><p>You can close this tab.</p>")
            _auth_code = None
            return

        _auth_code = query.get("code", [None])[0]
        self.send_response(200)
        self.send_header("Content-Type", "text/html")
        self.end_headers()
        self.wfile.write(b"<h1>Success!</h1><p>You can close this tab and return to the terminal.</p>")

    def log_message(self, format, *args):
        pass  # Suppress request logs


def main():
    client_id = os.environ.get("GOOGLE_CLIENT_ID")
    client_secret = os.environ.get("GOOGLE_CLIENT_SECRET")

    if not client_id or not client_secret:
        print("Error: Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET env vars.", file=sys.stderr)
        print("\nSteps:", file=sys.stderr)
        print("  1. Go to https://console.cloud.google.com/apis/credentials", file=sys.stderr)
        print("  2. Create OAuth 2.0 Client ID (Desktop app type)", file=sys.stderr)
        print("  3. Copy the Client ID and Client Secret", file=sys.stderr)
        print(f"  4. Run: GOOGLE_CLIENT_ID=xxx GOOGLE_CLIENT_SECRET=yyy python {sys.argv[0]}", file=sys.stderr)
        sys.exit(1)

    # Build the authorization URL
    auth_params = {
        "client_id": client_id,
        "redirect_uri": REDIRECT_URI,
        "response_type": "code",
        "scope": SCOPES,
        "access_type": "offline",
        "prompt": "consent",
    }
    auth_url = f"{AUTH_URL}?{urlencode(auth_params)}"

    print(f"Opening browser for authorization...")
    print(f"If it doesn't open, visit:\n  {auth_url}\n")
    webbrowser.open(auth_url)

    # Start a local server to receive the callback
    server = HTTPServer(("localhost", REDIRECT_PORT), CallbackHandler)
    print(f"Waiting for authorization callback on port {REDIRECT_PORT}...")
    server.handle_request()  # Handle exactly one request
    server.server_close()

    if not _auth_code:
        print("Error: No authorization code received.", file=sys.stderr)
        sys.exit(1)

    # Exchange the auth code for tokens
    print("Exchanging authorization code for tokens...")
    resp = requests.post(TOKEN_URL, data={
        "client_id": client_id,
        "client_secret": client_secret,
        "code": _auth_code,
        "grant_type": "authorization_code",
        "redirect_uri": REDIRECT_URI,
    })
    resp.raise_for_status()
    tokens = resp.json()

    refresh_token = tokens.get("refresh_token")
    if not refresh_token:
        print("Error: No refresh token in response. Try revoking access and re-authorizing.", file=sys.stderr)
        print(f"Response: {tokens}", file=sys.stderr)
        sys.exit(1)

    print("\n" + "=" * 60)
    print("SUCCESS! Here is your refresh token:")
    print("=" * 60)
    print(f"\n{refresh_token}\n")
    print("=" * 60)
    print("\nAdd these as GitHub repository secrets:")
    print(f"  GOOGLE_CLIENT_ID     = {client_id}")
    print(f"  GOOGLE_CLIENT_SECRET = {client_secret}")
    print(f"  GOOGLE_REFRESH_TOKEN = {refresh_token}")
    print(f"  DRIVE_FOLDER_ID      = <your folder ID from the Drive URL>")
    print("\nThe folder ID is the last part of the Google Drive folder URL:")
    print("  https://drive.google.com/drive/folders/<FOLDER_ID>")


if __name__ == "__main__":
    main()
