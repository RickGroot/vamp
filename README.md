# Vamp

A **local-first, offline PWA** in two halves: a **Sketch** pad for chord progressions —
enter chords into bars, set tempo and time signature, pick a sampled instrument and loop
it to jam over — and a **Practice** workspace of generated drills to play on your own
instrument, through every key, in your range and written pitch. No login, no backend, no
accounts — everything stays on your device.

Built with **SvelteKit + TypeScript + SCSS**, deployed as a static PWA to GitHub
Pages. Clean Swiss-ish type (Suisse Int'l with system fallback) on a 4px grid, with a
colourful accent palette — chords are **colour-coded by quality** (major = teal,
minor = violet, dominant = orange, diminished = red, augmented = pink, suspended = blue).

## Features (v1 / MVP)

- Bars and half-bars, each holding one or more chords (`+ chord` splits a bar)
- Chord entry by name with live validation and a **filter-as-you-type dropdown**
  (`Cmaj7`, `Dm`, `G7`, `F#m7b5`, `C/E`, `Dsus4`, `G7#9`, `Bbmaj9`, …; parsed with
  [tonal](https://github.com/tonaljs/tonal)). Free text still works.
- **Presets** for common progressions in any key (pop I–V–vi–IV, ii–V–I, 50s, 12-bar
  blues, canon, andalusian, minor ii–V–i, …) — fills an empty sketch or appends to it
- **Key-aware helpers**: a Roman-numeral overlay under the chords (toggle) and a
  **Suggest** palette of diatonic next-chords for the inferred key
- **Drag bars to reorder**; a **playhead** highlights the bar currently sounding
- **Example songs**: one-click load of famous **public-domain** songs (Pachelbel's Canon,
  Greensleeves, House of the Rising Sun, Amazing Grace, Hava Nagila, carols, …), with a
  searchable menu — copyrighted songs are intentionally excluded (import your own JSON)
- Tempo (BPM) with a **tap-tempo** button, **transpose** (semitone up/down), and time
  signature (4/4, 3/4, 6/8, 2/4, 5/4)
- Sampled-instrument playback: grand piano, acoustic guitar, electric piano, warm pad
- **Groove**: block / strum / arpeggio comping, optional auto **bass**, **metronome**, and
  real **drum grooves** (rock / pop / swing / bossa, via smplr's TR-808)
- **Practice tools** (for jamming/improv): a **rhythm-section mixer** (mute · solo · volume
  per part — chords / bass / drums), a **trade-solos** mode that drops the backing out every
  other N bars so you solo over time only, a **drone / pedal-tone** generator (a sustained
  root — optionally with its fifth — to practise scales and modes over), and **record your
  solo** over the loop via the mic and listen back (stays on-device, nothing uploaded)
- **Count-in** (one-bar pre-roll) and **spacebar** play/stop
- **"Inspire me"** random diatonic progression generator
- **Transposing-instrument pitch switch** (Concert / B♭ / E♭ / F): read the chart in
  written pitch for your horn while playback stays in concert pitch (non-destructive)
- Loops the whole progression — or a **selected sub-range of bars** — with a synced
  active-chord highlight (across the bars *and* the notation views; the VAMP wordmark
  also lights up during playback)
- **Undo / redo** (buttons + Ctrl/Cmd+Z · Shift+Z · Y)
- **Share** a sketch via a URL (the whole progression is encoded in the link — no backend)
- **Export** to **MIDI** (.mid for a DAW) and **audio** (.wav render of the loop)
- **Notation view** (lazy-loaded): a multi-line VexFlow staff showing the chords written
  above it (a chord chart), with a **Helper notes** toggle that overlays the chord tones
  as notes on the same staff
- Save / load / rename / delete progressions locally (IndexedDB)
- JSON export / import for backup and transfer
- Installable, works offline (service worker)

## Practice mode

A separate **Practice** workspace (top-right of the header, or `/practice`) with *generated*
drills to play on your instrument — as opposed to the Sketch page's drill controls, which
modify playback of your own song.

- **12 built-in drills**: scale sequences (straight up, 1-2-3-5, thirds, a turn figure),
  blues and pentatonic cells, and arpeggios (major 7th, minor 7th, dominant 7th,
  half-diminished, triads, up-and-back). All original exercises built from general
  technical concepts — nothing is transcribed from a copyrighted method book.
- **Every key**: start anywhere and cycle up a 4th, up a semitone, or at random, for as many
  keys as you want — with **automatic tempo step-up** and **bars of rest between keys**,
  because brass players need actual rest.
- **Your range, your register**: pick an instrument range (written pitch) and a low / middle /
  high register, and every phrase is placed to fit. A pattern that can't fit says so and skips
  that key rather than teaching you a truncated shape.
- **Hear it or play it**: the line can sound as a reference, or go silent so you play it over
  the backing — and it flips live, mid-drill, with no restart.
- **Backing**: a click (with the same feels as the Sketch page), a drum groove, or nothing.
- **Reads in your pitch**: the header's Concert / B♭ / E♭ / F switch applies here too, so a
  trumpeter reads written F while it sounds concert E♭.
- Notation is plain, black and large — it reads like sheet music — and shows one key at a time
  with the next one named underneath, sized to fit a phone or tablet on a music stand.

### Practise your own changes

**Practise this** (next to Share on the Sketch page) takes the progression you're writing
straight into a **guide-tone drill** — the 3rd and 7th of each chord, voice-led by nearest
motion, which is the line that actually spells the harmony. Thirds-only, sevenths-only and
roots-only versions are there too, roots being the sensible place to start.

It follows the sketch's loop range and meter, reads in your written pitch, and **never changes
the song** — set "Move the changes" to cycle the whole progression through keys and your
sketch still comes back exactly as you left it.

### Your own patterns

**Customise this drill** turns any built-in into a starting point: enter a cell as scale
degrees (`1 2 3 5 4 3`), set the beat value, how far it moves each repetition and how many
repetitions — and save it. Saved drills persist locally, travel in the JSON backup, and get
transposition through every key and register for free.

## Tech stack

| Concern | Choice |
|---|---|
| Framework | SvelteKit (Svelte 5) + `@sveltejs/adapter-static` |
| Audio clock | Tone.js (Transport, tick-based loop scheduling) |
| Instrument samples | smplr (`SplendidGrandPiano`, `ElectricPiano`, FluidR3_GM soundfont) |
| Music theory | tonal (chord parsing → MIDI) |
| Storage | IndexedDB via `idb` |
| PWA | `@vite-pwa/sveltekit` (Workbox generateSW) |

## Develop

```sh
pnpm install --ignore-scripts   # org policy: scripts disabled, exact-pinned deps
pnpm dev                        # dev server (http://localhost:5173)
pnpm test                       # unit tests (chord engine)
pnpm check                      # type / svelte-check
pnpm build                      # static production build -> build/
```

Regenerate the brand raster assets (PWA icons, apple-touch icon, favicon PNG, and
the Open Graph share image) from the gradient-V mark — dependency-free, no native
image libs:

```sh
node scripts/gen-assets.mjs   # writes pwa-192/512.png, apple-touch-icon.png, favicon-48.png, og-image.png to static/
```

Preview the **real production build** under the GitHub Pages base path (`/vamp/`):

```sh
pnpm build
node scripts/preview-static.mjs   # serves build/ at http://localhost:5181/vamp/
```

(`vite preview` does not serve the adapter-static output under the base path; use the
static server above for PWA/offline verification.)

## Deploy

Pushing to `main` builds and deploys to GitHub Pages via
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). Enable **Pages →
Source: GitHub Actions** in the repo settings. The site is served at
`https://<user>.github.io/vamp/` — the base path is configured in
[`vite.config.ts`](vite.config.ts).

## Data model

A progression stores the chord as the **literal symbol string** you typed (re-parsed
at play time, so nothing goes stale across save/load) and durations in **beats** (a
half-bar is just `beats: 2`). See [`src/lib/model/types.ts`](src/lib/model/types.ts).
Stored records and imported files are run through a defensive migrator
([`src/lib/storage/db.ts`](src/lib/storage/db.ts)) keyed on `schemaVersion`.

## For AI assistants (`llms.txt`)

The deployed site serves [`static/llms.txt`](static/llms.txt) at
<https://rickgroot.github.io/vamp/llms.txt>: a plain-text guide to the song JSON so an AI
assistant can write a progression you paste straight in via **File → Paste JSON…** (the
paste panel links to it). For example: *"Read https://rickgroot.github.io/vamp/llms.txt and
give me a 12-bar blues in Bb as Vamp JSON."* Every JSON example in the guide is
import-tested by [`src/lib/storage/llms.test.ts`](src/lib/storage/llms.test.ts), so it
cannot drift from the real schema unnoticed.

## Known shortcuts / not production-ready (PoC flags)

- **Samples are runtime-cached, not vendored.** Instruments load from smplr's CDN
  (`smpldsnds.github.io`) and are cached for offline use *after the first online play*
  of each instrument. The app shell itself is fully offline immediately. Vendoring the
  sample files into `static/` and precaching them is the more robust follow-up.
- **Sound quality ceiling.** Guitar/pad come from the FluidR3_GM soundfont — "decent,
  not studio-grade". smplr is at v1.0.0 (young) and is pinned.
- **Guitar voicer is pragmatic, not playability-aware.** Keyboard instruments use
  voice-leading (each chord placed near the previous one's register); guitar uses a
  fretboard voicing (bass/root on a low string, chord tones in a fret window). The
  guitar voicer has no finger-stretch/muting model — a deeper solver is a follow-up.
- **Block chords only.** No rhythmic comping, bass line, or drums yet.
- **PWA icon is SVG.** Works on Chromium; iOS home-screen icons may prefer PNG.
- **iOS audio lifecycle** (unlock + `interrupted`-state recovery) is implemented but
  needs verification on a physical device.
- **Transposed display** may re-spell a chord enharmonically when a field loses focus
  (e.g. `Db` ↔ `C#`) — same pitch, cosmetic only; concert mode is unaffected.
- **Example songs are public-domain only** (traditional / classical / pre-1929), with
  simplified, commonly-played changes — not definitive transcriptions, and copyrighted
  songs are deliberately excluded. Chord progressions aren't copyrightable, but shipping
  transcriptions of in-copyright works is a legal risk a production release should review.
- **Mixer faders scale note velocity**, not a true dB output gain — a pragmatic choice that
  avoids re-routing the shared chord/bass instrument, but on sampled pianos a low fader also
  softens timbre, not just loudness. Per-part output buses are the cleaner follow-up.
- **Trade-solos alternates within the loop**, by bar index from the loop start (it does not
  count across loop repeats), so pick a block length shorter than your loop to actually get
  a turn. The active-chord highlight keeps advancing during your turn even though the comp
  is silent.
- **Recordings are session-only.** Mic takes are held in memory as object URLs (downloadable
  as `.webm`/etc.) and are lost on reload — they are deliberately *not* uploaded anywhere.
  Persisting takes to IndexedDB is a possible follow-up. Recording needs a one-time mic
  permission grant; the mic stream is released as soon as a take stops.

## Roadmap (later)

The original brief's MVP and nice-to-haves are all shipped. Possible future polish:
selectable per-chord voicing options · swing / more groove styles · a dedicated bass
instrument · richer notation (beaming, ties, exact dotted durations) · MIDI export.
Experimental (separate, honestly scoped): loose YouTube-playback sync; rough in-browser
chord detection from a **local** audio file (you cannot extract audio from a
YouTube/Instagram embed).
