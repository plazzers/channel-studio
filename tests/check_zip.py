"""Open the CSV export zip the way any spreadsheet user's computer would.

Used by tests/e2e.cjs:  python3 tests/check_zip.py export.zip
Prints a JSON summary (names, compression methods, row counts, sample cells).
"""
import csv
import io
import json
import sys
import zipfile

path = sys.argv[1]
out = {}
with zipfile.ZipFile(path) as z:
    out["testzip"] = z.testzip()  # None when every CRC matches
    out["names"] = z.namelist()
    out["methods"] = [i.compress_type for i in z.infolist()]
    tables = {}
    for name in z.namelist():
        text = z.read(name).decode("utf-8-sig")
        tables[name] = list(csv.DictReader(io.StringIO(text, newline="")))
    out["rows"] = {n: len(r) for n, r in tables.items()}
    shorts = tables.get("shorts.csv", [])
    stats = tables.get("stats.csv", [])
    notes = tables.get("weekly_notes.csv", [])
    out["sample"] = {
        "short_title": next((r["title"] for r in shorts if "attic" in r["title"]), None),
        "stats_ctr": next((r["ctr_pct"] for r in stats if r["ctr_pct"]), None),
        "note": notes[0]["what_worked"] if notes else None,
        "video_headers": list(tables.get("videos.csv", [{}])[0].keys())[:4] if tables.get("videos.csv") else [],
    }
print(json.dumps(out))
