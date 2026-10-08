#!/usr/bin/env python3
"""Make one buyer's guide PDF with their access code printed in the box.

    python3 kit/tools/make_access_pdf.py --code KIT-7QXM-K2PD --out ~/Desktop/Guide-KIT-7QXM-K2PD.pdf

The code must look like KIT-XXXX-XXXX. Its SHA-256 hash must be in
ACCESS_HASHES in kit/config.js for it to unlock the app (the script warns
if it is not). Keep these PDFs outside the repository.
"""
import argparse
import hashlib
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from guide_pdf import DEFAULT_URL, KIT, build_pdf  # noqa: E402


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--code", required=True, help="the buyer's access code, e.g. KIT-7QXM-K2PD")
    ap.add_argument("--out", required=True, help="where to write the PDF")
    ap.add_argument("--url", default=DEFAULT_URL, help="address of the kit")
    a = ap.parse_args(argv)
    code = a.code.strip().upper()
    if not re.fullmatch(r"KIT-[A-Z0-9]{4}-[A-Z0-9]{4}", code):
        ap.error("the code must look like KIT-XXXX-XXXX")
    with open(os.path.join(KIT, "config.js"), encoding="utf-8") as f:
        known = hashlib.sha256(code.encode()).hexdigest() in f.read()
    out = os.path.realpath(os.path.expanduser(a.out))
    os.makedirs(os.path.dirname(out), exist_ok=True)
    build_pdf(out, code, a.url)
    print("Wrote", out)
    if not known:
        print("WARNING: this code's hash is not in kit/config.js yet — it will not unlock the app until you add it.", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
