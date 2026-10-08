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
  'c24a0b7e8ae5f870e64f77b88876cc000a6e3653c257b645bcabd908bde2b964', // code #1
  'dbda98494c0fe3bac700327a30d521d93dcf08fc09d75ad4c488c0194a2bc509', // code #2
  '1cc08bc8ea712982e99d28be161aa91fca90af4ad9951124b06c7ccd05590ff4', // code #3
  '361cc5b747e6098b50ee7cacaa6190e9e5809bff1a85811511af6fc3243776f5', // code #4
  '7e390c014f4961b28ae3307c60c3c9b6b1e3bf17ba29e992a43fa83bebf658e3', // code #5
  'c5f6272ea467206d52b70acc435100381be0719a522407be83fd691ab2846da0', // code #6
  '92570c5ade305238bf4345c5dc39a6db5574b17043facc7bde64d5e618ed3abd', // code #7
  '43cf829bc05d064dcfe5559e4b135725b0ad3f82e9aef6e556f00926f00a7792', // code #8
  '1253c46ff4b4bf13005fc035ccda312a52902f75593002184f53d7be8d2fc01d', // code #9
  'f8baac1f5ea3ae2c25ff933f37075a489dd48153e80febe1956523426b956d6d', // code #10
  '4592fbe6efc17a1ad6d4971a0dbbb3bc5852575a26ba0610bbf49c600b71a22c', // code #11
  'ac8bfdf5948a0c5d4d9d95593e9c3a0cd7824a35e7012d2bb38daffda72479ea', // code #12
  '4f7b8dd111ad9b4ddd70caf29e5c915b039d63aa3bdf26374826c927a652b703', // code #13
  '9bc05059fd81f9eaf5c8cc32227221194ea86ab3f2b4afffb6fc22af73270e96', // code #14
  '6b99835af0ee8225308c264b1916faec3204a9f38564e7f3f09e33dac9e01733', // code #15
  '451ae5398bdd291e378cce0ac226ded32e5569a956c2fa48dd5e057c4733a278', // code #16
  '0a297bbfaafaeea61295a62a8419d09880f55754bede8b0e58c8cd5763c5d686', // code #17
  '67f8cdb13db6ccb00665a2232a630f6253ac626c2a04e8f4cdca6e06cac4b3bb', // code #18
  '5fa19416c0f6d704c1073518f81c5d8b1d338ee48ceacfd797820f441dcd27b4', // code #19
  '262dddb6c3cc4a5092620790e3f88f0274a60545e89f0125442fb9a215688717', // code #20
];
