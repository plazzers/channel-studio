# BUILD SPEC — Channel Studio (private production tool for 2 YouTube channels)

## 1. What this is

A private web app the channel owner (Luka) uses every day to plan and ship videos for two faceless YouTube channels:

| | Walter's Home Check | Chef Sal Romano |
|---|---|---|
| Handle | @WaltersHomeCheck | @ChefSalRomano |
| Niche | Home inspection / homeowner tips, audience 50+ US homeowners & buyers | Restaurant secrets + copycat & Italian cooking, US home cooks |
| Host voice | Calm, plain-spoken, practical retired home inspector. Never claims licenses or credentials. Product mentions must never sound like selling. | High-energy, confident, cheeky Italian-American TV chef. Short punchy sentences, quick verdicts, max 2-3 Italian words per video. |
| Brand colors | Navy #1C2B3A, Denim #3E5F8A, Off-white #F2EDE4, Orange #E07A1F | Espresso #2A1E18, Cream #FAF4E8, Tomato red #BE3A24, Olive #586E34 |
| Store | https://payhip.com/WaltersHomeCheck | https://payhip.com/SalRomano |

Goal: cut the time from "idea" to "published with a perfect description" and make sure every video promotes the right products.

The owner writes in Serbian. **The app UI is in English** (simple words), but every output that goes on YouTube is English anyway.

## 2. Tech requirements

- Static site, no backend, no accounts, no runtime API calls, no AI calls. Plain HTML + CSS + vanilla JS ES modules, no build step, hosted on GitHub Pages (relative paths only).
- Data stored in IndexedDB on the device. Export/Import all data as JSON (backup). Also "Export to file" for any generated text.
- PWA: manifest + service worker so it works offline and installs on Mac (Chrome "Install") and phone.
- Desktop-first (owner works on a MacBook), but must be usable on a phone.
- No analytics, no tracking.
- Add `<meta name="robots" content="noindex">`.

## 3. Channel config (editable in Settings, seeded with these defaults)

Store per channel in `data/channels.js` as defaults, editable in the app (saved in IndexedDB):

### Walter's Home Check — products
- FREE: The Weekend Home Check (25 things in 30 minutes) — https://payhip.com/b/hiIm1
- FREE: Before the First Freeze (winter checklist) — https://payhip.com/b/Yml6C
- The Home Check Manual ($17) — https://payhip.com/b/ABaxT
- The House Buyer's Red Flag Checklist ($12) — https://payhip.com/b/HAfRF
- Walter's Home Check App ($29) — https://payhip.com/b/OZeda
- Description line style: `<Product text> 👉 <url>`
- Default hashtags: #homeinspection #homeowner #homemaintenance

### Chef Sal Romano — products
- FREE: Sal's 25 Rules for Eating Out — https://payhip.com/b/dnY7F
- Sal's Restaurant Copycat Cookbook ($17) — https://payhip.com/b/MQDaN
- Sal's Kitchen App ($19) — https://payhip.com/b/xM6XQ
- Sal's Italian Kitchen ($39.99) — https://payhip.com/b/Lv425
- All of Sal's books — https://payhip.com/SalRomano
- Description line style: `<emoji> <Product text> → <url>` (emojis: 📋 free, 📖 cookbook, 📱 app, 🍝 Italian, 🛒 store)
- Default hashtags: #restaurantsecrets #chef #eatingout
- Pitch rule: copycat/chain videos → Copycat Cookbook + App; Italian cooking or "what Sal orders" → Italian Kitchen; free PDF always mentioned mid-video.

Each product has: name, short line text, url, price, type (free/paid/app), emoji, "default in description" toggle, order.

## 4. Screens

### 4.1 Board (home)
- Channel switcher at the top (Walter / Sal / Both), colored by brand.
- Kanban columns: **Idea → Prompt ready → Script → Voice/Avatar → Edit → Thumbnail → Scheduled → Published**. Drag & drop on desktop; on phone a "Move to…" menu.
- Card: working title, channel color tag, target publish date, product to pitch, small progress dots.
- "+ New idea" quick add (title + channel).
- Filters: channel, status, search.

### 4.2 Video detail
Tabs: **Overview · Crafter prompt · Description · Checklist · Notes**

**Overview**: working title, 3 title options (A/B/C) with character counter (warn > 70), thumbnail text options (2–5 words each; show a red warning if thumbnail text repeats words from the title — rule: thumbnail text must differ from the title), main product to pitch (dropdown), length target (minutes; shows target spoken words: Walter 150 wpm, Sal 170 wpm — editable), publish date/time, status.

**Crafter prompt** — generator for the owner's "Project Crafter" workflow. Form fields prefilled from channel defaults, then one-click "Copy prompt". Output must be plain text in exactly this section order, each header in CAPS followed by a colon:

```
TITLE: <title>
NARRATOR: <channel narrator line>
AUDIENCE: <audience>
LENGTH: <minutes> minutes (about <words> spoken words)
OUTPUT FORMAT: <format line>
STRUCTURE: <structure line>
<numbered list of the points / segments the user typed>
SAFETY/ACCURACY: <rules>
PRODUCT MENTIONS: <which product, where, how>
STYLE RULES: <rules>
create me a prompt for the video
```
Rules:
- The last line is ALWAYS exactly `create me a prompt for the video` (lowercase, no punctuation, nothing after it). Make this impossible to break: it is appended automatically and not editable.
- There is NO "SOURCES" section (the owner removed it on purpose). Do not add one.
- Per-channel defaults for NARRATOR, AUDIENCE, OUTPUT FORMAT, STRUCTURE, SAFETY/ACCURACY, PRODUCT MENTIONS, STYLE RULES are editable in Settings → Prompt defaults. Seed them:
  - Walter NARRATOR: "Walter, a calm, experienced home inspection expert speaking in first person to homeowners. Plain language, warm, practical. Never claims licenses, certifications or a specific career history."
  - Walter AUDIENCE: "US homeowners and home buyers, mostly 50+, many living in older houses."
  - Walter SAFETY/ACCURACY: "Educational only. Clearly separate what a homeowner can safely check from when to call a licensed inspector, electrician, plumber or structural engineer. No scare tactics, no exact repair prices presented as fact."
  - Walter PRODUCT MENTIONS: "Mention the chosen product once mid-video and once at the end, in a helpful, low-key way. It must never sound like selling. Mention the free checklist as 'the first link in the description'."
  - Walter STYLE RULES: "Short sentences for TTS narration. No headings read aloud. Include one calm subscribe line. Thumbnail text differs from the title."
  - Sal NARRATOR: "Chef Sal Romano, a high-energy, confident Italian-American TV chef speaking to camera in first person."
  - Sal AUDIENCE: "US home cooks and people who eat out, 30-65."
  - Sal SAFETY/ACCURACY: "No health claims about restaurant chains. Any factual claim about a named chain needs a public source; otherwise phrase it as Sal's personal taste. No chain logos."
  - Sal PRODUCT MENTIONS: "Free PDF mid-video ('first link in the description'); main product pitched in the outro, framed as Sal's own recipes."
  - Sal STYLE RULES: "Punchy sentences under 20 words, burst then pause, quick verdicts, max 2-3 Italian words, at least one personal kitchen story per segment, sign-off 'Mangia bene. See you next time.' About 170 spoken words per minute."
  - Both OUTPUT FORMAT: "Plain spoken script only, ready for voice generation. No stage directions."
  - Both STRUCTURE: "Hook under 1 minute that ends with a promise, numbered segments, mid-video free PDF mention, payoff, outro with product mention and tease of the next video."

**Description** — YouTube description builder:
- Inputs: hook paragraph (1–3 sentences), which product lines to include (checkboxes, defaults from channel config, main pitched product first), chapters (paste "0:00 Title" lines OR add rows with time + title; validate: first chapter must be 0:00, at least 3 chapters, each ≥ 10 seconds apart, times ascending — show clear errors), sign-off line (Sal default "New videos every week. Mangia bene."), hashtags (max 3 shown first).
- Live preview + character counter (YouTube limit 5000) + "Copy description".
- "Insert app line into an old description" helper: paste an existing description, choose product, it inserts the product line right after the first product link line and shows a diff. (The owner does this when a new product launches.)
- Also generate: pinned comment (short, points to the free PDF), and a community post teaser. Simple templates with placeholders, editable.

**Checklist** — per-video publish checklist (checkbox state saved):
- Title A/B/C chosen, thumbnail ready, description copied, chapters checked, end screen + cards added, playlist set, pinned comment posted, product links clicked and working, "Altered or synthetic content" question answered correctly in YouTube Studio (realistic AI-generated people/voices must be disclosed per YouTube policy), scheduled time set, Shorts cut from this video.
- Checklist items are editable in Settings.

**Notes** — free text + links (script doc, Headcast project, thumbnail file path).

### 4.3 Topic memory
- List of all used titles and topics per channel (from all cards ever created, including published).
- When typing a new idea title, show "Similar to: …" if it shares 3+ meaningful words with an existing one (simple word-overlap, ignore stop words).

### 4.4 Calendar
- Month view of scheduled/published videos per channel, color coded. Click opens the video.

### 4.5 Settings
- Channel config (products, hashtags, sign-off, wpm), prompt defaults, checklist template.
- Backup: export / import JSON. Reset demo data.
- Theme: system / light / dark.

## 5. Seed data (so the board is not empty on first open)

Published:
- Walter: "Never Buy a House If You See These 7 Things" (published Oct 2, 2026); "9 Things to Check Before Winter (Most Homeowners Skip #6)"; "Do These 7 Things Before Bed (Most Homeowners Never Do)"; "If Your House Was Built Before 1990, Check These 7 Things"; "7 Small House Problems That Get Expensive Fast" (mark these last 4 as Scheduled if unsure; owner will fix).
- Sal: "Restaurant Tricks I Used on Customers for 40 Years" (Scheduled Oct 8, 2026 12:00 ET).

## 6. Design

- Clean, fast, "production desk" feel. Neutral app chrome; each channel's brand color used as accent on its cards and headers.
- Keyboard shortcuts on desktop: N = new idea, / = search, Cmd/Ctrl+Enter = copy current output.
- Light + dark mode. Base font 16px desktop, 17px phone. Tap targets ≥ 44px.
- Toast on every copy ("Copied!").

## 7. Deliverables & testing

- Working app in repo root, ready for GitHub Pages. README in plain language (how to open, install on Mac, backup, edit products/links).
- Unit-style self tests in `tests/` runnable in the browser (tests.html) for: Crafter prompt output (exact section order, last line exact, no SOURCES), chapter validation, description builder, "insert app line" helper, similar-topic detection.
- Before finishing, run the app with Playwright (Chromium is preinstalled; do not run `playwright install`) at 1440x900 and 390x844: create idea, move across columns, generate Crafter prompt and verify the last line, build a description with chapters, run the insert helper, export/import backup, offline reload. Fix all console errors. Save screenshots in `docs/screens/`.
