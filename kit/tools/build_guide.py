#!/usr/bin/env python3
"""Rebuild kit/sales/Faceless-Creator-Kit-Guide.pdf (with a blank code box)
from kit/sales/buyer-guide.md.

    python3 kit/tools/build_guide.py [--url https://…/kit/]
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from guide_pdf import DEFAULT_URL, KIT, build_pdf  # noqa: E402

ap = argparse.ArgumentParser(description=__doc__)
ap.add_argument("--url", default=DEFAULT_URL, help="address of the kit")
a = ap.parse_args()
out = build_pdf(os.path.join(KIT, "sales", "Faceless-Creator-Kit-Guide.pdf"), None, a.url)
print("Wrote", out)
