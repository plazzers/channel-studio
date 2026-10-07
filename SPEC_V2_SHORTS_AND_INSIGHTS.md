# SPEC v2 — Shorts planner, title/thumbnail lab, weekly review (add to Channel Studio)

Read README.md, BUILD_SPEC.md and the existing code first. Add features without breaking anything; existing IndexedDB data must survive (version upgrade only adds stores/fields). Same tech rules: static, vanilla JS, no build, no network calls at runtime, offline PWA, English UI, desktop-first.

## 1. Shorts planner
- Each long video card gets a "Shorts" tab: plan up to 5 Shorts cut from it. Fields per Short: hook line (first 2 seconds, ≤ 12 words — counter), source timestamp range (mm:ss–mm:ss; validate length 15–60 s; show duration), on-screen text (≤ 6 words), title (≤ 100 chars, warn if no keyword from the long video's title), description with the link line chosen from channel products (default: free PDF), status (planned / cut / posted), posted date.
- "Shorts" board view (filter by channel/status) and a weekly calendar strip.
- "Generate Shorts plan" helper: paste the long video's chapter list → proposes one Short per chapter (title from chapter name, timestamp range from chapter start to min(next chapter, +45 s)). Pure text processing, no AI.

## 2. Title & thumbnail lab
- Per video: score each title option with transparent heuristics (show the reasons): length 40–65 ideal, contains a number, curiosity/pain words list (editable), starts strong (no "How I"/"In this video"), avoids ALL CAPS words > 2, no clickbait words list ("shocking", "you won't believe" — warn), keyword from channel keyword list present (editable per channel; seed Walter: home inspection, house, homeowner, buying a house, winter, basement, roof; Sal: restaurant, chef, copycat, recipe, menu, Italian).
- Thumbnail text: 2–5 words, must not repeat title words (≥ 50% overlap = red), max 20 characters per line in a 2-line preview; live mock preview at YouTube thumbnail size (246×138 and 360×202) with brand colors and the host photo placeholder, so the owner sees readability.
- A/B log: record which title/thumbnail ran, start date, and manually entered CTR % and views after 48h / 7 days; show a simple table and mark the winner. (YouTube Studio "Test & compare" results are typed in by hand.)

## 3. Weekly review
- "This week" page: videos/shorts published this week per channel, what's scheduled next 14 days, cards stuck in a stage > 7 days (warning list), and a free-text "what worked / what to try" note saved per ISO week.
- Manual stats entry per published video (views, watch hours, subs gained, CTR, product sales count from Payhip — typed in) with a tiny sparkline per channel over the weeks (inline SVG, no libraries).

## 4. Export
- Export everything (videos, shorts, A/B log, weekly notes, stats) as JSON (existing backup) AND as CSV files (one per table) in a single .zip built in-browser (write a minimal store-only ZIP writer; no libraries).

## 5. Tests & delivery
- Extend tests/ with: Shorts timestamp validation, chapter→Shorts generator, title scoring rules, thumbnail overlap rule, ISO week math, zip writer (open the zip in Python in the Playwright run to verify), DB upgrade from current version keeping all data.
- Playwright (Chromium preinstalled; don't run `playwright install`) at 1440x900 and 390x844 covering the new screens; screenshots to docs/screens/v2-*.png. Fix all console errors.
- Bump the service worker version, update README, commit to main.
