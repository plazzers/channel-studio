// Faceless Creator Kit — access codes.
//
// ACCESS_HASHES holds the SHA-256 hashes (lowercase hex) of every valid
// access code. Codes are normalized before hashing: spaces at both ends are
// removed and letters are made UPPERCASE ("  kit-ab2c-9xyz " -> "KIT-AB2C-9XYZ").
//
// The list is EMPTY on purpose: no code works until real hashes are added.
// To add codes:
//   python3 kit/tools/make_codes.py --count 50 --out ~/Desktop/kit-codes.txt
// It prints lines like  "3f5a…",  — paste them between the brackets below,
// commit, and push. The plain codes go only into the file you chose (keep it
// outside this repository; *codes*.txt is git-ignored as a safety net).
//
// Test mode: opening the app on localhost with ?testcode=1 also accepts
// KIT-TEST-0000. It never works on the real website.

export const ACCESS_HASHES = [
  // 'paste-hashes-here',
];
