#!/usr/bin/env python3
"""Make access codes for the Faceless Creator Kit.

    python3 kit/tools/make_codes.py --count 50 --out ~/Desktop/kit-codes.txt

- Writes the plain codes (one per line, like KIT-7QXM-K2PD) to --out.
  Keep that file private and OUTSIDE this repository (the script refuses a
  path inside it; *codes*.txt is also git-ignored as a safety net).
- Prints the SHA-256 hashes to paste into ACCESS_HASHES in kit/config.js.
- Add --append to add new codes to an existing file instead of replacing it.

Codes use letters and digits that are hard to confuse (no 0/O, 1/I/L).
"""
import argparse
import hashlib
import os
import secrets
import sys

ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
REPO = os.path.realpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))


def normalize(code: str) -> str:
    return code.strip().upper()


def code_hash(code: str) -> str:
    """Same as the app: SHA-256 (hex) of the trimmed, upper-cased code."""
    return hashlib.sha256(normalize(code).encode("utf-8")).hexdigest()


def new_code() -> str:
    part = lambda: "".join(secrets.choice(ALPHABET) for _ in range(4))
    return f"KIT-{part()}-{part()}"


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--count", "-n", type=int, required=True, help="how many codes to make (1-10000)")
    ap.add_argument("--out", "-o", required=True, help="file for the plain codes (outside this repository)")
    ap.add_argument("--append", action="store_true", help="add to the file instead of replacing it")
    ap.add_argument("--force", action="store_true", help="replace an existing file without asking")
    a = ap.parse_args(argv)

    if not 1 <= a.count <= 10000:
        ap.error("--count must be between 1 and 10000")
    out = os.path.realpath(os.path.expanduser(a.out))
    if out == REPO or out.startswith(REPO + os.sep):
        ap.error(f"{out} is inside the repository. Choose a path outside it (e.g. ~/Desktop/kit-codes.txt).")
    if os.path.exists(out) and not (a.append or a.force):
        ap.error(f"{out} already exists. Use --append to add codes or --force to replace it.")

    existing = set()
    if a.append and os.path.exists(out):
        with open(out, encoding="utf-8") as f:
            existing = {normalize(l) for l in f if l.strip()}
    codes = []
    while len(codes) < a.count:
        c = new_code()
        if c not in existing and c not in codes:
            codes.append(c)

    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    with open(out, "a" if a.append else "w", encoding="utf-8") as f:
        f.write("".join(c + "\n" for c in codes))
    try:
        os.chmod(out, 0o600)
    except OSError:
        pass

    print(f"// {len(codes)} new code(s) written to {out}")
    print("// Paste these lines into ACCESS_HASHES in kit/config.js:")
    for c in codes:
        print(f"  '{code_hash(c)}',")
    return 0


if __name__ == "__main__":
    sys.exit(main())
