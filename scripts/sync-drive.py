#!/usr/bin/env python3
"""Sync Google Docs from a Drive folder to docs/meeting-notes/ as Markdown.

Authenticates via OAuth refresh token. Exports Google Docs as plain text
and writes them with YAML front matter.

Required env vars:
    GOOGLE_CLIENT_ID
    GOOGLE_CLIENT_SECRET
    GOOGLE_REFRESH_TOKEN
    DRIVE_FOLDER_ID
"""

import os
import re
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import requests

SCOPES_NEEDED = "https://www.googleapis.com/auth/drive.readonly"
TOKEN_URL = "https://oauth2.googleapis.com/token"
DRIVE_API = "https://www.googleapis.com/drive/v3"

# Where to write the markdown files (relative to repo root)
OUTPUT_DIR = Path(__file__).resolve().parent.parent / "docs" / "meeting-notes"
STATE_FILE = OUTPUT_DIR / ".sync-state.json"


def get_access_token(client_id: str, client_secret: str, refresh_token: str) -> str:
    """Exchange a refresh token for a short-lived access token."""
    resp = requests.post(TOKEN_URL, data={
        "client_id": client_id,
        "client_secret": client_secret,
        "refresh_token": refresh_token,
        "grant_type": "refresh_token",
    })
    resp.raise_for_status()
    return resp.json()["access_token"]


def list_docs_in_folder(access_token: str, folder_id: str) -> list[dict]:
    """List all Google Docs in the given Drive folder."""
    docs = []
    page_token = None

    while True:
        params = {
            "q": f"'{folder_id}' in parents and mimeType='application/vnd.google-apps.document' and trashed=false",
            "fields": "nextPageToken,files(id,name,modifiedTime,webViewLink)",
            "pageSize": 100,
            "supportsAllDrives": "true",
            "includeItemsFromAllDrives": "true",
        }
        if page_token:
            params["pageToken"] = page_token

        resp = requests.get(
            f"{DRIVE_API}/files",
            headers={"Authorization": f"Bearer {access_token}"},
            params=params,
        )
        if not resp.ok:
            print(f"Error listing files: {resp.status_code} {resp.text}", file=sys.stderr)
            resp.raise_for_status()
        data = resp.json()
        docs.extend(data.get("files", []))

        page_token = data.get("nextPageToken")
        if not page_token:
            break

    return docs


def export_doc_as_text(access_token: str, file_id: str) -> str:
    """Export a Google Doc as plain text."""
    resp = requests.get(
        f"{DRIVE_API}/files/{file_id}/export",
        headers={"Authorization": f"Bearer {access_token}"},
        params={"mimeType": "text/plain"},
    )
    resp.raise_for_status()
    return resp.text


def slugify(name: str) -> str:
    """Convert a document name to a filesystem-safe slug."""
    name = name.lower().strip()
    name = re.sub(r"[^\w\s-]", "", name)
    name = re.sub(r"[\s_]+", "-", name)
    name = re.sub(r"-+", "-", name)
    return name.strip("-")


def load_sync_state() -> dict:
    """Load the last-sync state (modified times per doc ID)."""
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text())
    return {}


def save_sync_state(state: dict) -> None:
    """Persist sync state."""
    STATE_FILE.write_text(json.dumps(state, indent=2) + "\n")


def main() -> None:
    client_id = os.environ.get("GOOGLE_CLIENT_ID")
    client_secret = os.environ.get("GOOGLE_CLIENT_SECRET")
    refresh_token = os.environ.get("GOOGLE_REFRESH_TOKEN")
    folder_id = os.environ.get("DRIVE_FOLDER_ID")

    missing = []
    if not client_id:
        missing.append("GOOGLE_CLIENT_ID")
    if not client_secret:
        missing.append("GOOGLE_CLIENT_SECRET")
    if not refresh_token:
        missing.append("GOOGLE_REFRESH_TOKEN")
    if not folder_id:
        missing.append("DRIVE_FOLDER_ID")

    if missing:
        print(f"Error: missing required env vars: {', '.join(missing)}", file=sys.stderr)
        sys.exit(1)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    print("Authenticating with Google Drive...")
    access_token = get_access_token(client_id, client_secret, refresh_token)

    print(f"Listing docs in folder {folder_id}...")
    docs = list_docs_in_folder(access_token, folder_id)
    print(f"Found {len(docs)} Google Doc(s).")

    if not docs:
        print("No documents found. Nothing to sync.")
        return

    state = load_sync_state()
    synced = 0
    skipped = 0

    for doc in docs:
        doc_id = doc["id"]
        doc_name = doc["name"]
        modified_time = doc["modifiedTime"]
        web_link = doc.get("webViewLink", "")

        # Skip if not modified since last sync
        if state.get(doc_id) == modified_time:
            skipped += 1
            continue

        print(f"  Syncing: {doc_name}")
        content = export_doc_as_text(access_token, doc_id)

        # Parse the modified time for the front matter
        mod_dt = datetime.fromisoformat(modified_time.replace("Z", "+00:00"))
        front_matter_date = mod_dt.strftime("%Y-%m-%d %H:%M:%S UTC")

        # Build the markdown file
        slug = slugify(doc_name)
        filename = f"{slug}.md"

        md_content = f"""---
title: "{doc_name}"
last_modified: "{front_matter_date}"
source: "{web_link}"
synced_at: "{datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}"
---

{content.strip()}
"""

        out_path = OUTPUT_DIR / filename
        out_path.write_text(md_content)

        state[doc_id] = modified_time
        synced += 1

    save_sync_state(state)
    print(f"Done. Synced: {synced}, Skipped (unchanged): {skipped}")


if __name__ == "__main__":
    main()
