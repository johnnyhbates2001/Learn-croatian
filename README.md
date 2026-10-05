# Riječi — learn the 1000 most common Croatian words

An installable PWA (works offline on iPhone) for learning Croatian vocabulary with spaced repetition. It runs as a Cloudflare Worker, and a D1 database syncs your progress between devices.

## Features

- **~1000 most frequent Croatian words**, in frequency order. Ranks are based on the OpenSubtitles `hr_50k` list, with inflected forms grouped under their dictionary form (e.g. *je, sam, su* → **biti**). Each word has:
  - gender for nouns, and the aspect pair for verbs (*čitati / pročitati*);
  - a usage note where it helps;
  - an example sentence with a translation.
- **FSRS spaced repetition** (`ts-fsrs`), the scheduling algorithm modern Anki uses. Each card is graded Again / Hard / Good / Easy, and the button shows the next interval.
- **Three ways to practise:**
  - Croatian → English. New words are introduced with both sides showing.
  - English → Croatian. This unlocks once you recognise a word reliably. You type the answer, with č ć đ š ž buttons. Missing diacritics and small typos are detected and get a gentler grade.
  - Listening drills: hear a word without seeing it (uses the iOS Croatian voice).
- **Gamification:**
  - XP and levels.
  - A daily XP goal and streaks, with streak freezes (earn 1 per 7-day streak, hold up to 2).
  - In-session combos.
  - 21 achievements.
  - Frequency milestones (Top 100 / 250 / 500 / 750 / 1000) and an activity heatmap.
  - An **everyday coverage** meter: an estimate of how much of everyday Croatian your known words cover. It's an estimate based on a Zipf curve, scaled so the top 1000 words cover ≈78% of everyday speech.
- **Local-first sync:**
  - Everything is stored in IndexedDB, so the app works fully offline.
  - Changes sync to D1 when the app opens or goes to the background, and after every session.
  - If the same record changed on two devices, the newest change wins.
  - You can also export a JSON backup and import it again.
- **Flag a word as wrong** from the Words tab, then copy the flagged list from Settings, so mistakes in the word list are easy to fix.

## Deploying to Cloudflare

1. Install dependencies and log in to Cloudflare:
   ```sh
   npm install
   npx wrangler login
   ```
2. Create the database, or use the one you already made:
   ```sh
   npx wrangler d1 create learn-croatian-db
   ```
   Copy the `database_id` it prints (or find it in the dashboard under Storage & Databases → D1) into `wrangler.jsonc`.
3. Set the sync password. Pick any long random string; you'll type it into the app once:
   ```sh
   npx wrangler secret put SYNC_TOKEN
   ```
4. Build, apply the database migrations and deploy:
   ```sh
   npm run deploy
   ```
   If you'd rather deploy from GitHub with **Workers Builds**, set the deploy command to `npm run deploy` and add `SYNC_TOKEN` as a secret on the Worker.

### Installing on iPhone

1. Open the Worker URL in **Safari**, tap **Share → Add to Home Screen**, then open the app from the home screen.
2. Go to **Settings → Sync & backup**, enter your `SYNC_TOKEN` and tap **Connect**. The installed app has its own storage, separate from Safari, so do this inside the installed app.
3. For audio, install the Croatian voice: iOS **Settings → Accessibility → Spoken Content → Voices → Croatian → Lana**.

## Development

```sh
echo 'SYNC_TOKEN=dev-token' > .dev.vars
npm run db:migrate:local
npm run build && npm run dev:api   # Worker + built app + local D1 on http://localhost:8787
npm run dev                        # (optional) Vite with hot reload on :5173, proxies /api to :8787
npm test                           # unit tests
npm run typecheck
```

### Project layout

| Path | What |
| --- | --- |
| `data/words.txt` | The word list (edit this). `npm run words` regenerates `src/data/words.json`, and `npm run build` runs it automatically. |
| `src/lib/` | Core logic: record store (IndexedDB), FSRS wrapper, sessions, progress / streaks / XP, achievements, sync, answer checking, TTS |
| `src/screens/` | Today, Study, Words, Progress, Settings |
| `worker/index.ts` | Hono API: `GET /api/ping`, `POST /api/sync`, `POST /api/reset` (Bearer `SYNC_TOKEN`) |
| `migrations/` | D1 schema |
| `scripts/build-icons.mjs` | Regenerates `public/icons` (needs Playwright installed) |

### Editing words

Each line in `data/words.txt` is `croatian | english | pos | note | example hr | example en`.

- **Order matters:** lines are ranked by frequency, top first.
- **IDs come from the Croatian word,** not the line number. You can reorder or insert lines freely without losing progress. Changing a word's spelling, though, resets its progress.
