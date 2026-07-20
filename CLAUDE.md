# Vamp — CLAUDE.md

100% local-first, offline, installable PWA for sketching chord progressions and looping backing tracks to improvise over. SvelteKit + Svelte 5 (RUNES) + TypeScript + SCSS. Music theory via **tonal**, audio clock/AudioContext via **tone**, sampled instruments + TR-808 via **smplr**, notation via **vexflow**, persistence via **idb** (IndexedDB). No backend, no network except the sample CDN (runtime-cached). Deployed as a static SPA to GitHub Pages under base path `/vamp/`.

## Commands

- `pnpm dev` — vite dev (served at ROOT, not `/vamp/`).
- `pnpm build` — vite build (static, base `/vamp`). `pnpm preview` — serve the build.
- `pnpm check` — `svelte-kit sync && svelte-check` (typecheck; **there is no lint script**).
- `pnpm test` — `vitest run` (all suites). `pnpm test:watch` — vitest watch.
- Single test: `pnpm test <path>` (e.g. `pnpm test src/lib/audio/comp.test.ts`) or `pnpm exec vitest run -t "<name>"`.
- pnpm@11.1.2; installs use `--ignore-scripts` + `minimumReleaseAge` (org policy). Always run `pnpm check` + `pnpm test` before committing.

## Deploy / CI / base path

- `.github/workflows/deploy.yml`: on push to `main` → `pnpm install --frozen-lockfile --ignore-scripts` → `pnpm build` → `cp build/200.html build/404.html` → deploy to Pages (node 22). Live: https://rickgroot.github.io/vamp/.
- **base path `/vamp` applies to BUILD ONLY; dev stays at root.** Never hardcode `/vamp/` in code — use SvelteKit's `base` from `$app/paths`. `src/app.html` hardcodes the GH-Pages origin only in `og:url` / `og:image` / `twitter:image`; icons/manifest use `%sveltekit.assets%`.
- No `svelte.config.js` — SvelteKit config is INLINE on the `sveltekit()` plugin in `vite.config.ts` (adapter-static, SPA fallback `200.html`, runes forced on for app code). `ssr=false` + `prerender=true` live in `src/routes/+layout.ts` (CSR/SPA; there is no `+page.ts`).

## Architecture map

Single route. Layering: **model → storage / audio(pure) → stores → components**. Hard rules: `storage/*` must NOT import stores; pure `audio`/`model` modules must NOT import `tone`.

| Path | Role |
|---|---|
| `src/lib/model/types.ts` | Core types (Progression/Bar/Slot/Groove/TimeSignature), `CURRENT_SCHEMA_VERSION=1`, VampBackup envelope |
| `src/lib/model/factory.ts` | `create*` helpers; **single source** of TEMPO_MIN=20/MAX=300, DEFAULT_TEMPO=100/TIME_SIGNATURE/GROOVE, `newId` |
| `src/lib/model/time.ts` | Beat math: barBeats, beatsToQuarters/secondsPerBeat, resolveLoopRange/loopBars |
| `src/lib/model/slots.ts` | `flattenSlots` → THE global-slot-index mapping (engine highlight + UI share it) |
| `src/lib/model/chords.ts` | `classifyChord` → ChordFamily; cached chord suggestions/filters |
| `src/lib/model/scales.ts` | SCALE_TYPES/ROOTS, getScaleInfo, scaleStaffKeys, scalesForChord, GUITAR_TUNING |
| `src/lib/model/key.ts` | inferKey / romanNumeral / diatonicChords (chroma-based, transposition-invariant) |
| `src/lib/model/{presets,examples,inspire}.ts` | PRESETS (degree+quality); public-domain EXAMPLES; randomProgression (injectable rand) |
| `src/lib/model/analysis.ts` | Progression recognition: chordCore (7 core buckets), collapseChanges (rests = seg boundaries), detectProgressions (self-anchored local tonic; merge repeats BEFORE containment suppression; end-anchored cadences; blues minSlots). PURE + tested |
| `src/lib/storage/db.ts` | IndexedDB CRUD + `migrateProgression` — THE coercion gate for every read/import/decode |
| `src/lib/storage/import.ts` | `parseProgressionInput`: forgiving parser (fences/prose/multiple shapes) |
| `src/lib/storage/share.ts` | base64url encode/decode of a progression into the URL hash |
| `src/lib/storage/backup.ts` | Browser file I/O: downloadBlob, safeFileName, downloadBackup, readFileAsText |
| `src/lib/export/{midi,audio}.ts` | Dependency-free SMF (format 0) writer; WAV via smplr renderOffline |
| `src/lib/audio/engine.ts` | Singleton `PlaybackEngine`: Tone.Part loop, `playGen` token, live mix/trade, Draw-synced highlight |
| `src/lib/audio/schedule.ts` | Progression → CompSlot[] → events (quarter notes); shared by engine + exporters |
| `src/lib/audio/comp.ts` | PURE groove expansion: block/strum/arp, bass modes, drums, metronome → CompEvent[] |
| `src/lib/audio/voicing.ts` | Keyboard voice-leading + guitar voicer; `nearestMidi` octave-fold |
| `src/lib/audio/chord.ts` | `parseChord` via tonal; octave assignment; `empty` vs `isRest` |
| `src/lib/audio/instruments.ts` | smplr chord instrument + TR-808 + `getBassInstrument` (upright/electric/synth GM) on Tone's context; cache + evict-on-fail |
| `src/lib/audio/context.ts` | Shared AudioContext owner; `unlockAudio()` gesture; iOS resume lifecycle |
| `src/lib/audio/mix.ts` | PURE computeMixLevels (solo/mute) + isComping (trade-fours) |
| `src/lib/audio/drone.ts` | Singleton `DroneEngine`: sustained root(+fifth), click-free ramps |
| `src/lib/audio/{recorder,drills,scalePlayer,transpose,tapTempo}.ts` | MicRecorder; pure drill logic; scale preview; transposeChordSymbol + display/concert offset; pure tap-tempo |
| `src/lib/notation/vex.ts` | notationVoicing, voicedToVexKey/midiToVexKey, beatsToVexDuration |
| `src/lib/notation/font.ts` | Self-hosted Petaluma Script jazz font via FontFace (awaitable) |
| `src/lib/midi/input.ts` | `MidiInput` + `detectChordSymbol` (Chromium Web-MIDI only) |
| `src/lib/art/lattice.ts` | Framework-agnostic canvas lattice; owns its rAF; pure field math exported for tests |
| `src/lib/actions/dismissable.ts` | Shared popover dismissal (outside-pointerdown + Escape) |
| `src/routes/+page.svelte` | THE only route: assembles app, keyboard shortcuts, 2 art `$effect`s, drone key-sync, tab title |
| `src/routes/+layout.svelte` | imports app.scss; manual PWA SW register (dynamic `virtual:pwa-register`, try/catch); update toast |
| `src/app.scss` | Single token source: `--c-{family}` palette, `--grad-flow`, shared classes, art + reduced-motion CSS |

Components (`src/lib/components/`): BarCard, ChordSlot, TransportBar (+LoopControl), BandPanel, NotationView→StaffSheet, ScalesSection (+ScaleStaff, ScaleFretboard), PracticePanel (+DrillsControl, DroneControl, MidiControl, Recorder), PatternInsights (detection chips + info popovers; detections are a `$derived` in +page — never a store/persisted), and the menu family (File/Share/Preset/Example/Suggest).

## Key data flow

**Playback:** Progression → `schedule.buildScheduledEvents` (flattenSlots → voiceSequence + parseChord → CompSlot[] with bassMidi/bassPcs) → `comp.buildCompEvents` (CompEvent[] positioned in quarter notes) → `engine.buildEvents` (quarters × PPQ → tick strings `"Ni"`) → looped `Tone.Part` on the Transport. Chords = smplr instrument; bass = its own `groove.bassInstrument` voice (upright/electric/synth), or the chord instrument when `bassInstrument==='keys'`; drums = smplr TR-808; metronome = tiny Tone.Synth. All share ONE AudioContext (`context.getRawContext`). Active-slot highlight dispatched via `Tone.getDraw()` at audio time.

**Chords are stored as the LITERAL symbol string the user typed** and re-parsed with tonal at play/render time — never cache a parsed form. Empty string = rest. Durations are in beats (beat unit = TS denominator).

**Export:** `buildScheduledEvents(progression, {whole:true})` renders the WHOLE progression (default covers only the active loop range); midi.ts/audio.ts serialise, skipping `ev.kind==='click'`.

**Notation spelling:** bars → `displayChord(chord, view.offset)` (WRITTEN pitch) → parseChord → `notationVoicing` (stacks into a fixed B3–G5 window, keeps the symbol's spelling as `{midi,name}`) → `voicedToVexKey` → StaveNote. The `name` decides letter+accidental; MIDI only fixes the octave.

## State & stores

Each `stores/*.svelte.ts` exports ONE eagerly-constructed singleton — no barrel, import directly. Constructors read localStorage only under `browser`; setters write. **Engine sync happens in setters, not in `$effect`s** (view.syncMix/setTradeBars, drone setters, progression.setTempo).

- `progression` = the hub: current song, undo/redo, playback wiring, transient practice-drills. Registers `engine.onActiveSlot/onState/onLoop`; `play()` passes `{countIn: view.countIn, clickFeel: drills.clickFeel}`. Undo history capped at `HISTORY_LIMIT=100`; same-`tag` edits coalesce within `COALESCE_MS=700`. `MAX_SLOTS_PER_BAR=4` (a bar splits full→half→…→4). `setTimeSignature` redistributes each bar's beats to fill the new meter while keeping slot COUNT.
- `view` = per-device prefs + rhythm-section mix/trade pushed live to the engine. `drills` = drill prefs. `droneState` = pedal-tone, wraps the audio `drone` singleton (**the store is `droneState`, the engine is `drone`**). `library` = reactive mirror of IndexedDB (`refresh()` after each mutation; failures land in `library.error`, not thrown). `scales`, `midi`, `recorder`, `cursor` = session-only.
- **localStorage** (all `vamp:`-prefixed, defensive reads): view (`vamp:transpose|countIn|roman|mix|trade|art`), drills, drone, scales. **IndexedDB:** progression + library. **Session-only:** recorder, midi, cursor.

## Conventions (bug-prevention — ignoring these reintroduces a fixed bug)

- **`engine.play()` generation guard.** Every `await` inside `play()` is followed by `if (gen !== this.playGen) return;` and the catch is gen-guarded; stop()/new play() bump `playGen`. → a stale/superseded play must not bleed over the new song.
- **`unlockAudio()` (context.ts) must run synchronously from a real user gesture** before any playback; engine.play / drone.start / playScale all await it. → prevents no-audio on mobile / a suspended context.
- **ALL persistence routes through `migrateProgression` (db.ts)** — db reads, `importProgressions`, `share.decodeProgression`. Add a persisted field → add its `coerce*` default there; never trust a raw record. Its bounds are load-bearing: `slot.beats` >0 and ≤64; TS numerator 1–16, denominator ∈ {2,4,8,16}; tempo clamped 20–300; empty bars → `[createBar()]`, empty bar → one slot. → a hostile share hash with `beats≤0` corrupts MIDI ticks / freezes scheduling. Legacy path: `coerceGroove.bass` maps boolean `true→'root'`, `false→'none'` — any new persisted enum needs the same.
- **Tempo/TS bounds live ONLY in `model/factory.ts`** (re-exported by the progression store; drills imports from factory). UI clamp and db coercion both import from here — change bounds in one place.
- **Keep pure modules pure:** comp / mix / drills / voicing / chord / transpose / tapTempo import no `tone` and no stores. → keeps them node-unit-testable and out of the AudioContext graph.
- **`flattenSlots` (slots.ts) is the single source** of the global slot index the engine and UI key on — don't recompute it elsewhere.
- **Schedule in transport TICKS** (`${round(quarters*PPQ)}i`), never seconds; derive note duration live from current bpm inside the Part callback so tempo changes apply without a restart. `setTempo()` just sets `bpm.value`.
- **Clamp note duration to the slot boundary** (`Math.min(step, quarters - offset)` in comp.ts); `GAP=0.95` / `BASS_GAP=0.92` leave a de-blur gap. → fractional-beat slots otherwise ring past the next attack.
- **A rest/empty slot still emits `kind:'chord'` with `midi:[]`** to drive the highlight — don't drop it. `parseChord` distinguishes `isRest` (blank) from unrecognised (`empty:true, isRest:false`); both yield `midi:[]` but mean different things to the UI.
- **`nearestMidi` (voicing.ts) folds by octaves within 36–88, never hard-clamps** — a clamp changes pitch class (Bb near the floor would sound as C).
- **Structural/schedule-changing mutations restart playback while playing** (`if (this.isPlaying) void this.play()`): setInstrument, setTimeSignature, setPattern, setBassMode, toggleMetronome, setDrums, transpose, inspire, removeBar, moveBar, applyPreset, addSlot, removeSlot, set/clearLoopRange. **Pure appends do NOT:** addBar, inputChord, appendChordBar, setSlotChord. setTempo/setName stay live/silent. Follow this split for any new mutation.
- **`loopRange` is stored by BAR INDEX** (survives reorder); removeBar/moveBar remap it; read via `resolveLoopRange`/`loopBars` (they clamp) — never index bars with the raw range.
- **Every progression mutation calls `checkpoint(tag)` then `touch()`.** Practice-drill changes are TRANSIENT and must never enter undo history; `undo()`/`redo()` call `endDrillSession()` FIRST.
- **Chord-building modules validate every generated symbol with `isValidChordSymbol`** and fall back to the bare note; always `Note.simplify()` after `Note.transpose()`.
- **Transposition split:** the store keeps CONCERT pitch. ChordSlot shows `displayChord(chord, view.offset)` and writes `concertFromDisplay(draft, offset)`; while focused it shows the live `draft` (never re-spelled under the cursor). Notation always feeds `displayChord`. ScalesSection follows the same rule: `scales.root` is CONCERT (playback sounds concert), but the whole section DISPLAYS a `displayInfo` rooted on the written root; the root select round-trips via `concertFromDisplay`.
- **Menus (File/Share/Preset/Example/Suggest) are disclosure popovers, NOT `role=menu`:** `use:dismissable` + `onfocusout`, rows are plain `<button>`. Only ChordSlot autocomplete is a real `role=combobox/listbox` (with `aria-activedescendant`).
- **Keyboard shortcuts live ONLY in `+page.svelte`** (`<svelte:window onkeydown>`). Space = play/stop (skipped in form fields and when focus is on `closest('button,a,select,input,textarea,[contenteditable]')`); Ctrl/Cmd+Z undo, Ctrl/Cmd+Y or Shift+Z redo (skipped in fields to preserve native undo).
- **Add UI by composing into `+page.svelte`'s `<main class="editor">`, not a new route.** Section components read/mutate stores directly; props are reserved for derived cross-cutting values (e.g. `keyInfo`).
- **Colours: `app.scss` is the single token source — components use `var(--…)`, never raw hex.** `classifyChord` → family → `--c-{family}` (major teal / minor violet / dominant orange / diminished red / augmented pink / suspended blue / other grey). ChordSlot sets inline `--q: var(--c-{family})`. `--grad-flow` is SHARED by the play button, wordmark and section chips — don't fork it.

## Gotchas

- **VexFlow noteheads/clef are FONT GLYPHS** → DOM `getBBox` returns the em-box. Use VexFlow's own `note.getBoundingBox()` / `stave.getYForLine` for vertical layout. VexFlow is **lazy-imported** (`await import('vexflow')`) in StaffSheet/ScaleStaff — keep it out of any storage/server-loadable module. `await ensureJazzFont()` before draw so metrics are real.
- **VexFlow ignores inherited CSS custom props** — resolve `--c-*` to hex via `getComputedStyle` before `setStyle` (StaffSheet/ScaleStaff). ScaleFretboard is plain Svelte SVG, so it uses `var(--c-*)` directly.
- **StaffSheet ResizeObserver re-flows on WIDTH change only** (>1px, `lastWidth`-guarded); reacting to height loops forever (auto-sizing changes height). Two-pass layout (measure, then pack); chord names are our own SVG `<text>`, not VexFlow annotations; the active-highlight is a separate no-re-render `$effect`. Chart mode (`showNotes=false`) builds `b/4` placeholders and hides them via CSS.
- **tonal `midiToNoteName` defaults to FLATS.** Never respell staff pitches from MIDI. `voicedToVexKey` keeps F#/Bb; `midiToVexKey` is the flat-only fallback.
- **Enharmonic roots:** SCALE_ROOTS / PRESET_ROOTS are flat-spelled; selects add a synthetic `custom` `<option>` so sharp roots (and an imported 7/8 time-sig) never render blank. `inspire.ts` ROOTS is the one deliberate F#-using exception.
- **The preview/MCP tab is `visibilityState:'hidden'` → rAF is SUSPENDED** (and the lattice's visibilitychange handler stops it). You cannot watch aurora/lattice motion there — verify via `lattice.drawStatic()` + `getImageData`, or via the exported pure field math (ambientTilt/wavefrontRadius/pingDecay/wavefrontPassed) in unit tests.
- **The two art `$effect`s in `+page.svelte` are split ON PURPOSE** (aurora parallax = self-cancelling rAF; lattice owns its own rAF + visibilitychange stop/start). Don't merge. `reducedMotion = new MediaQuery(...)` from `svelte/reactivity` (not one-shot matchMedia) so both re-run when the OS flips; reduced-motion path = `drawStatic()` + resize redraw, no rAF.
- **`Tone.getDraw()` callbacks queue ~lookAhead ahead and outlive `transport.cancel()`** — the `setActiveSlot` draw is guarded by `this._state==='playing'` or a slot stays lit after stop.
- **smplr defaults to a REMOTE sample CDN** — true offline relies on the PWA runtime cache `'vamp-samples'` (CacheFirst); samples are NOT self-hosted. A failed load is evicted from the cache by identity (instruments.ts / getDrumMachine) — caching a rejected load would break that instrument for the whole session.
- **iOS drops the context to suspended/interrupted on background;** context.ts retries resume on visibility/statechange but may no-op — only the next real gesture recovers it. Don't trust `isRunning()` after backgrounding.
- **`tone` imports FINE in node** (context.ts is lazy — only `getRawContext()`/`Tone.start()` touch the AudioContext), so the db→instruments→context→tone chain loads in tests. Stores are untested because they drive a real Transport clock, not because Tone fails to import.
- **Web MIDI (input.ts) is Chromium-only**, needs a permission grant, and `navigator.requestMIDIAccess` may be absent (check `.supported`). Chord detection fires only on FULL release (`held.size→0`) using the peak set; a device unplugged mid-hold sends no note-offs, so `onstatechange` clears held+peak on any disconnect.
- **`+layout.svelte` SW registration is dynamic-imported + try/catch** because `virtual:pwa-register` is absent in dev (failure is silent). `<svelte:head><title>` in `+page.svelte` sets `document.title` client-side; because `ssr=false` the `app.html` title is only the no-JS fallback — don't duplicate it.
- **`share.encodeProgression` strips id + timestamps;** decode re-mints them via `migrateProgression` → opening a shared link creates a FRESH record that won't overwrite a saved one.
- **`library` callers are fire-and-forget** — IndexedDB rejections set `library.error` (except `import()`, which throws on bad JSON). `db.getDb()` clears its cached promise on open failure so the next call retries.
- **recorder Takes are in-memory object URLs** — `remove()`/`clear()` must `revokeObjectURL` or they leak; takes vanish on reload by design.

## Testing

- Vitest 4, `environment: 'node'` (NOT jsdom; the `$lib` alias is mirrored, the SvelteKit plugin is deliberately omitted). No setupFiles/globals — every test imports `{ describe, it, expect }` from `'vitest'`. Colocated `foo.ts` + `foo.test.ts`. ~18 files / ~138 tests, runs in ~2s.
- **TESTED = the pure, deterministic layer:** music theory (audio/chord, transpose, voicing; model/key, scales, presets, examples, inspire; midi/input), timing (model/time, audio/tapTempo, drills), arrangement (comp.buildCompEvents, mix), IO (export/midi bytes, storage/import + db.migrateProgression), and art MATH (art/lattice).
- **Assert music by pitch-class set (chroma mod 12)**, not raw MIDI arrays or symbol equality — reuse `chromaSet`/`expectedChroma` (voicing.test.ts). Re-parse detected/transposed symbols with tonal `Chord.get` and assert tonic+quality. **Randomness is injected** (`rand: () => number = Math.random`); tests pass a seeded LCG.
- When you add a `migrateProgression` coercion or a new example/preset, extend `import.test.ts` / `examples.test.ts` / `presets.test.ts` (they assert every generated chord is valid across roots and that legacy/hostile values are made safe).
- **UNTESTED (can't be, in node) — verify by hand in a browser:** everything stateful/side-effecting — engine, drone, scalePlayer, context, recorder, export/audio (need a live AudioContext/Transport/MediaRecorder/OfflineAudioContext), instruments sample loading (network), all `*.svelte` components (need DOM + font-glyph metrics), the runes stores (non-deterministic glue), and the canvas rAF loop.

## Org policy

- Distinguish PoC vs production; flag shortcuts/missing concerns explicitly. This repo is a delivered personal MVP.
- pnpm with `--ignore-scripts` + `minimumReleaseAge`; minimise deps (prefer built-ins — the MIDI writer and share codec are already dependency-free).
- Never hardcode secrets; no PII / client-proprietary data.
- **ALWAYS ask before `git push` / deploy** (a push to `main` triggers the Pages deploy).
