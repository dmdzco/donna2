#!/usr/bin/env python3
"""Sync documents from a Drive folder to docs/meeting-notes/ as Markdown.

Supports Google Docs (exported as text), .docx, and .pdf files.
Authenticates via OAuth refresh token.

Required env vars:
    GOOGLE_CLIENT_ID
    GOOGLE_CLIENT_SECRET
    GOOGLE_REFRESH_TOKEN
    DRIVE_FOLDER_ID
"""

import io
import os
import re
import json
import sys
import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

import requests

TOKEN_URL = "https://oauth2.googleapis.com/token"
DRIVE_API = "https://www.googleapis.com/drive/v3"

# Supported MIME types
SUPPORTED_MIMES = [
    "application/vnd.google-apps.document",                                      # Google Docs
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",   # .docx
    "application/pdf",                                                            # .pdf
]

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


def list_subfolders(access_token: str, folder_id: str) -> list[dict]:
    """List all subfolders in the given Drive folder."""
    folders = []
    page_token = None

    while True:
        params = {
            "q": f"'{folder_id}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false",
            "fields": "nextPageToken,files(id,name)",
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
            print(f"Error listing subfolders: {resp.status_code} {resp.text}", file=sys.stderr)
            resp.raise_for_status()
        data = resp.json()
        folders.extend(data.get("files", []))

        page_token = data.get("nextPageToken")
        if not page_token:
            break

    return folders


def list_files_in_folder(access_token: str, folder_id: str, recurse: bool = True) -> list[dict]:
    """List all supported files in the given Drive folder, recursing into subfolders."""
    mime_filter = " or ".join(f"mimeType='{m}'" for m in SUPPORTED_MIMES)
    query = f"'{folder_id}' in parents and ({mime_filter}) and trashed=false"

    files = []
    page_token = None

    while True:
        params = {
            "q": query,
            "fields": "nextPageToken,files(id,name,mimeType,modifiedTime,webViewLink)",
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
        files.extend(data.get("files", []))

        page_token = data.get("nextPageToken")
        if not page_token:
            break

    if recurse:
        subfolders = list_subfolders(access_token, folder_id)
        for sf in subfolders:
            print(f"  Entering subfolder: {sf['name']}")
            files.extend(list_files_in_folder(access_token, sf["id"], recurse=True))

    return files


def export_google_doc(access_token: str, file_id: str) -> str:
    """Export a native Google Doc as plain text."""
    resp = requests.get(
        f"{DRIVE_API}/files/{file_id}/export",
        headers={"Authorization": f"Bearer {access_token}"},
        params={"mimeType": "text/plain"},
    )
    resp.raise_for_status()
    return resp.text


def download_file(access_token: str, file_id: str) -> bytes:
    """Download a non-native Drive file (docx, pdf, etc.)."""
    resp = requests.get(
        f"{DRIVE_API}/files/{file_id}",
        headers={"Authorization": f"Bearer {access_token}"},
        params={"alt": "media", "supportsAllDrives": "true"},
    )
    resp.raise_for_status()
    return resp.content


def extract_text_from_docx(data: bytes) -> str:
    """Extract plain text from a .docx file."""
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        xml_content = zf.read("word/document.xml")
    root = ET.fromstring(xml_content)
    ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    paragraphs = []
    for p in root.iter(f"{{{ns['w']}}}p"):
        texts = [t.text for t in p.iter(f"{{{ns['w']}}}t") if t.text]
        if texts:
            paragraphs.append("".join(texts))
    return "\n\n".join(paragraphs)


def extract_text_from_pdf(data: bytes) -> str:
    """Extract text from a PDF. Basic extraction without heavy dependencies."""
    # Use Google Drive's built-in export to convert PDF to text
    # This is a fallback — we'll store a note that it's a PDF
    text = ""
    # Simple PDF text extraction: find text between BT/ET markers
    # This handles basic PDFs; complex ones may need better parsing
    content = data.decode("latin-1", errors="ignore")
    # Extract strings in parentheses within text blocks
    in_text = False
    parts = []
    for line in content.split("\n"):
        if "BT" in line:
            in_text = True
        if "ET" in line:
            in_text = False
        if in_text:
            # Extract text in parentheses: (Hello World) Tj
            for match in re.finditer(r"\(([^)]*)\)", line):
                parts.append(match.group(1))
    text = " ".join(parts)

    if len(text.strip()) < 50:
        return "[PDF document — text extraction limited. See source link for full content.]"
    return text


def get_file_content(access_token: str, file_id: str, mime_type: str) -> str:
    """Get text content from a file based on its MIME type."""
    if mime_type == "application/vnd.google-apps.document":
        return export_google_doc(access_token, file_id)

    data = download_file(access_token, file_id)

    if mime_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        return extract_text_from_docx(data)

    if mime_type == "application/pdf":
        return extract_text_from_pdf(data)

    return "[Unsupported file format]"


def slugify(name: str) -> str:
    """Convert a document name to a filesystem-safe slug."""
    # Remove file extensions
    name = re.sub(r"\.(docx?|pdf|txt)$", "", name, flags=re.IGNORECASE)
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

    print(f"Listing files in folder {folder_id}...")
    files = list_files_in_folder(access_token, folder_id)
    print(f"Found {len(files)} file(s).")

    if not files:
        print("No documents found. Nothing to sync.")
        return

    state = load_sync_state()
    synced = 0
    skipped = 0

    for f in files:
        file_id = f["id"]
        file_name = f["name"]
        mime_type = f["mimeType"]
        modified_time = f["modifiedTime"]
        web_link = f.get("webViewLink", "")

        # Skip if not modified since last sync
        if state.get(file_id) == modified_time:
            skipped += 1
            continue

        print(f"  Syncing: {file_name} ({mime_type})")
        content = get_file_content(access_token, file_id, mime_type)

        # Parse the modified time for the front matter
        mod_dt = datetime.fromisoformat(modified_time.replace("Z", "+00:00"))
        front_matter_date = mod_dt.strftime("%Y-%m-%d %H:%M:%S UTC")

        # Build the markdown file
        slug = slugify(file_name)
        filename = f"{slug}.md"

        md_content = f"""---
title: "{file_name}"
last_modified: "{front_matter_date}"
source: "{web_link}"
synced_at: "{datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}"
---

{content.strip()}
"""

        out_path = OUTPUT_DIR / filename
        out_path.write_text(md_content)

        state[file_id] = modified_time
        synced += 1

    save_sync_state(state)
    print(f"Done. Synced: {synced}, Skipped (unchanged): {skipped}")


if __name__ == "__main__":
    main()
