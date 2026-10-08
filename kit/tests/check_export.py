"""Open a pin export ZIP the way any computer would and check the CSV.

Used by kit/tests/e2e.cjs:
    python3 kit/tests/check_export.py pins.zip [pins.csv]
Prints a JSON summary.
"""
import csv
import io
import json
import sys
import zipfile
from collections import Counter
from urllib.parse import urlparse, parse_qs

from PIL import Image

zip_path = sys.argv[1]
csv_path = sys.argv[2] if len(sys.argv) > 2 else None
out = {}
with zipfile.ZipFile(zip_path) as z:
    out["testzip"] = z.testzip()
    names = z.namelist()
    out["names"] = names
    imgs = [n for n in names if n.endswith((".png", ".jpg"))]
    out["images"] = len(imgs)
    sizes, formats, nbytes = [], [], []
    for n in imgs:
        data = z.read(n)
        nbytes.append(len(data))
        im = Image.open(io.BytesIO(data))
        sizes.append(im.size)
        formats.append(im.format)
    out["sizes"] = sizes
    out["formats"] = formats
    out["maxBytes"] = max(nbytes) if nbytes else 0
    raw = z.read("pinterest-bulk.csv").decode("utf-8") if "pinterest-bulk.csv" in names else ""

out["header"] = raw.split("\r\n", 1)[0]
rows = list(csv.DictReader(io.StringIO(raw, newline="")))
out["rows"] = len(rows)
out["mediaOk"] = bool(rows) and all(
    r["Media URL"].startswith("https://example.github.io/pins/") and r["Media URL"].rsplit("/", 1)[1] in names for r in rows
)
out["sampleLink"] = rows[0]["Link"] if rows else ""
out["utmOk"] = bool(rows) and all(
    parse_qs(urlparse(r["Link"]).query).get("utm_source") == ["pinterest"]
    and parse_qs(urlparse(r["Link"]).query).get("utm_campaign") == ["launch"]
    for r in rows
)
out["dates"] = [r["Publish date"] for r in rows]
day_links = Counter((r["Publish date"][:10], r["Link"].split("?")[0]) for r in rows)
out["sameDayDupes"] = sum(c - 1 for c in day_links.values() if c > 1)
out["maxTitle"] = max((len(r["Title"]) for r in rows), default=0)
out["maxDesc"] = max((len(r["Description"]) for r in rows), default=0)
if csv_path:
    with open(csv_path, encoding="utf-8", newline="") as f:
        out["csvSame"] = f.read() == raw
print(json.dumps(out))
