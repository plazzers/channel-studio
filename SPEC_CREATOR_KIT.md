# SPEC — "Faceless Creator Kit" (a paid product for OTHER creators)

Goal: a polished, sellable web app (PWA) for faceless / AI-avatar YouTube creators, sold on Payhip for about $29 with access codes (same model as Walter's app). It packages two tools we already built for ourselves, made generic and beautiful:
1. **Channel Planner** — a generic version of Channel Studio (this repo's app).
2. **Pin Factory** — a browser-based Pinterest pin generator + bulk-upload CSV builder (our Python pin factory, reimagined as a no-code web tool).

Lives in `kit/` in this repo → `https://plazzers.github.io/channel-studio/kit/`. Do NOT change the existing Channel Studio app at the repo root (it's Luka's private tool), except shared code you copy (copy, don't import across, so the two apps can evolve separately).

## 0. Rules
- Static, vanilla JS ES modules, no build, no CDN, no network calls at runtime, no tracking, data stays in the browser (IndexedDB), offline PWA with its own service worker scope `/channel-studio/kit/`, its own manifest/icons, English UI, works at 1440x900 and 390x844.
- **No Walter/Sal content anywhere in the kit** (no names, products, links, colors). Neutral brand: "Faceless Creator Kit", clean modern look (pick a distinctive but professional palette and type; bundle OFL fonts locally).
- Honest copy: no income claims, no fake testimonials, no "guaranteed".

## 1. Access gate
- First screen: "Enter your access code" (from the buyer's PDF). Codes checked against SHA-256 hashes in `kit/config.js` (normalize: trim + uppercase). Commit with an EMPTY hash list plus a clear comment — Luka's assistant adds real hashes later. Test mode: `?testcode=1` accepts `KIT-TEST-0000` ONLY when served from localhost.
- `kit/tools/make_codes.py`: generates N codes like `KIT-XXXX-XXXX`, prints hashes for config.js, writes the plain codes to a path the user gives (outside the repo); `.gitignore` covers `*codes*.txt`.

## 2. Channel Planner (generic)
- Multiple channels, user-defined (name, color, niche, product links with labels, keyword list, default link line).
- Board (idea → script → voice/avatar → edit → thumbnail → scheduled → published), video cards, calendar, topics bank.
- **Prompt builder** with editable templates (ship 3 good generic templates: listicle explainer, story/insider reveal, how-to; user can add their own and set a fixed ending line).
- Description builder (product links, chapters, disclaimer, hashtags), title & thumbnail lab with transparent scoring, Shorts planner (chapters → Shorts), weekly review with manual stats + sparkline, JSON backup/restore and CSV/ZIP export.
- First-run onboarding: 3 steps (create your channel → add products → add first video), with a demo channel the user can delete.

## 3. Pin Factory
- Brand kit per channel: 2–3 colors, heading/body font (choose from 6 bundled OFL fonts), logo/photo upload (stored locally) with circle crop + ring, footer text, CTA tag.
- **8 templates** at 1000x1500 (2:3), rendered on `<canvas>`: Bold Headline, Numbered List (3–7 items), Quick Tip + Tag, Recipe/Product Card (name + 3 stat icons), Quote/"Expert says", Before → After / Do vs Don't, Money Compare (A vs B with big numbers), Checklist. Key words highlighted with `*asterisks*` in the headline. Auto-fit text (shrink to fit, avoid widows), safe margins.
- **Batch mode**: paste a table (or upload CSV) with columns title, headline, body, tag, template, link, board → renders all pins, preview grid, fix-and-rerender per pin.
- Export: all PNGs (or JPG < 350 KB) in a ZIP + **Pinterest bulk CSV** with the exact header `Title,Media URL,Pinterest board,Thumbnail,Description,Link,Publish date,Keywords`. Because Pinterest needs public image URLs, the CSV step asks for a "public base URL where you'll host the images" (with a short how-to: GitHub Pages / any host) and fills Media URL = base + filename; schedule builder (pins per day, times, start date, spread similar pins), UTM builder for links, length checks (title ≤ 100, description ≤ 500).
- Single-pin editor with live preview, undo, duplicate.

## 4. Sales assets (in `kit/sales/`, not linked from the app)
- `cover-1280x720.png`, `cover-square-1400.png` (made from real screenshots, Playwright), 6 feature screenshots.
- `payhip-description.md`: product title options, honest description (what it is, who it's for, what's included, requirements: any modern browser, works offline, data stays on your device; no refunds language — leave that to the owner), FAQ.
- `buyer-guide.md` + generated `Faceless-Creator-Kit-Guide.pdf` (reportlab, nice layout): how to open, install to home screen/desktop, quick start for both tools, how to host pin images for bulk upload (step by step with GitHub Pages, free), backup/restore. Leave a placeholder box `ACCESS CODE: ____` — the assistant generates per-buyer PDFs with real codes later; add `kit/tools/make_access_pdf.py --code CODE --out file.pdf`.

## 5. Tests & delivery
- Unit tests for scoring, CSV escaping/validation, schedule spreading, ZIP writer, code hashing; Playwright (Chromium preinstalled; don't run `playwright install`) at 1440x900 and 390x844: gate → onboarding → create channel → render 8 pin templates → batch of 10 → export ZIP+CSV (open ZIP in Python and validate CSV) → planner flows. No console errors. Screenshots to `kit/docs/screens/`.
- README section "Faceless Creator Kit" (plain English). Commit to main (`git pull --rebase` before pushing — another session works in `shorts_factory/` in parallel).
