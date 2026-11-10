# Licks: design

Designed 2026-11-09; Phase 1 (licks in Practice) built 2026-11-10, Phases 2–4 not yet. Decisions were made with Spec Deck; the log is `docs/spec-decisions.md`.

## TL;DR

A lick is a short line written as degrees of the key (`2 3 4 6`, `b3`, `#4`, `b9`) over changes written as numerals (`ii7 V7 Imaj7`), so one lick plays in every key. Practice gets a lick library and plays a lick through every key in your written range, with the band playing the changes under it. Learn adds call and response: you hear the lick, play it back (graded note by note on a MIDI keyboard, or marked by you), and it comes back for review.

## Key decisions

- **Where licks live:** split. Practice plays them (library, every key, your range); Learn teaches them (call and response, review). You took my recommendation.
- **How the notes are written:** degrees relative to the KEY, with alterations, over numeral changes. You took my recommendation.
- **Adding your own:** type degrees and rhythm, like the drill editor, with a staff preview. You took my recommendation.
- **Playing it back:** graded note by note on a MIDI keyboard; without one you mark it yourself (Got it / Not yet). Both feed review. You took my recommendation.
- **Rhythm:** eighths or longer, with rests; eighths swing at playback when the lick's feel swings. Triplets later. You took my recommendation.
- Settled without a card: original licks only; a lick is key-free and resolved per run; written pitch with whole-octave range fitting; custom licks in IndexedDB behind a coercion gate, optional in the backup; the library covers blues/rock and jazz.

## What exists today

The only "lick trainer" is Practice's custom drill (`DrillEditor.svelte` says so in its header): a cell of pool steps in ONE scale or chord, a rhythm that cycles, moved through keys. It can't do:

- chromatic notes (a `b3` over a major key, a `#4` passing tone, a `b9` on the V),
- changes: a drill is one scale for the whole key; a ii–V–I lick needs three chords,
- rests inside the line (a pool step is always a note),
- chord backing: `drillPlan` calls `buildCompEvents([], …)`, so a drill gets click and drums but no chords,
- swing: drill lead eighths play straight even over the swing drum style.

Guide-tone drills do run over changes, but those are the editor's song, not a lick's own.

## What a lick is

A new definition type, beside `DrillDefinition`, not a new `DrillSource`. A drill's `cell` is pool steps that the resolver sequences up a scale; a lick is a fixed line with its own changes. Bending one model to hold both would make both harder to read.

```ts
// src/lib/licks/types.ts (proposed)
export interface LickDefinition {
  schemaVersion: 1;
  id: string;                 // PERSISTED for built-ins: review progress is keyed by it
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  mode: 'major' | 'minor';    // the key the degrees and numerals read against
  changes: LickChord[];       // the lick's own changes, in order
  notes: string[];            // degree tokens, one per note or rest
  rhythm: number[];           // beats per token; cycles if shorter (as in drills)
  feel: 'straight' | 'swing';
  timeSignature: TimeSignature;
  style: 'blues' | 'rock' | 'jazz';
  builtIn?: boolean;          // never trusted from storage
}

export interface LickChord {
  numeral: string;            // chart convention: 'ii7', 'V7', 'bVII7', 'Imaj7'
  beats: number;
}
```

**Degree tokens.** `[b|#]` + a degree, read up from the key's tonic:

- `1`–`7`: the octave from the tonic up.
- `8`–`14`: the octave above, so `b9`, `#9`, `#11` and `b13` read as the jazz names they are.
- `_1`–`_7`: the octave below (`_5` is the fifth under the tonic). This marker is a proposal; see Open questions.
- `r`: a rest.

The token decides the spelling, as a drill note's `name` does: `b5` in C is G♭, `#4` is F♯. A blues lick writes the blue note `b5`; a lydian line writes `#4`.

**Changes set the length.** Notes past the last chord are cut; a line shorter than its changes rests to the end. A pickup is written by starting the changes a bar early (usually on the I or the V) and the notes with rests.

An illustration, not shipped content:

```json
{
  "name": "Down into the third",
  "mode": "major",
  "changes": [{ "numeral": "ii7", "beats": 4 }, { "numeral": "V7", "beats": 4 }, { "numeral": "Imaj7", "beats": 4 }],
  "notes": ["2", "3", "4", "6", "8", "7", "6", "4", "3", "b3", "2", "4", "_7", "2", "4", "b6", "5", "3"],
  "rhythm": [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 1, 3],
  "feel": "swing",
  "style": "jazz"
}
```

## Resolving a lick

`resolveLick(lick, options)` is pure, tested, and follows `resolveDrill`'s rules exactly. It reuses `DrillRunOptions` (root, key mode, reps, offset, range, register, tempo, step-up, rest bars).

1. **Key plan:** `buildRunPlan`, the same concert key and tempo per repetition as a drill.
2. **Written tonic:** concert tonic + `offset`, applied once.
3. **Notes:** each token becomes an interval from the written tonic, then `Note.transpose`, then `readable()`. Only double accidentals collapse: G♭ major's `4` stays C♭. Never `Note.simplify` a melodic name.
4. **MIDI** comes from the spelled name, so `name` and `midi` agree before fitting.
5. **Range:** `fitOctave` moves the WHOLE line by whole octaves. A lick is a shape, so it is never folded note by note (that is the guide-tone rule, and it would break the contour). A line too wide for the range skips that key with `'span'`, like a scale drill.
6. **Chords:** `numeralToChord(numeral, key)` gives CONCERT symbols for the backing; `displayChord(symbol, offset)` gives the WRITTEN labels for the staff. Both are already tested.
7. **Rhythm:** beats → quarters through the meter; `r` becomes `midi: null`, which advances the clock and the cue.

The output is a run with the shape `drillPlan` reads (`notes: DrillNote[]`, `phrases`, `totalQuarters`, `skipped`), plus `chords`: the concert chord slots per repetition. `DrillNote.label` carries the token as written (`b3`), and `chord` the written symbol it sits on. That is what DrillStaff already prints for guide-tone drills.

## Practice: the library and the run

- **DrillPicker** gains a Licks group: the built-in licks by style, then your own. Picking one makes it the practice store's current item. The store's `definition` becomes a drill or a lick, and `run` resolves through `resolveDrill` or `resolveLick`.
- **Every drill setting applies:** key cycle, reps, tempo and step-up, range, register, rest bars, and the lead gain for "play it yourself".
- **The runner** shows the current key's staff with the chord names over it, exactly as for a drill over your changes.
- **Source stays `'drill'`** and the cue channel stays `cueIndex`. The engine does not change.

### The band under a lick

`drillPlan` gains the chords. Build the backing slots the way `learnPlan` does: a throwaway Progression (one slot per chord change, every repetition unrolled and transposed, rest bars as rest slots), then the existing schedule and comp path. That gives the same voicing, comp patterns and bass as a song.

**Two-channel rule:** every backing event gets `slotIndex: null`. A `CompSlot` always has a `slotIndex`, and left in, it would light a chord in the user's song. A test asserts that no lick event carries a `slotIndex`, as `learn/plan.test.ts` does for Learn.

**Groove from the lick's style:** jazz = swing drums, walking bass; blues = swing or shuffle, root bass; rock = rock drums, root bass. These are defaults; changing the groove for a session is an open question.

### Swing

The swung lead line is a playback change, not a notation change. The staff shows straight eighths, as jazz is written.

- In the plan, an eighth that starts on the off-beat (`at % 1 === 0.5` in quarters) moves to the swing point. The eighth before it, on the beat, stretches to meet it.
- Quarters and longer notes are untouched.
- The swing point is the drums' own: comp.ts places the swing hi-hat at `q + 0.66`. Export that as one constant (`SWING_OFFBEAT`) so the lead and the hi-hat cannot drift apart.
- It applies only when `feel === 'swing'`. A straight lick over a swing groove stays straight.

## Learn: call and response

A new Learn mode, **Licks** (`?mode=licks`). It joins `MODES` only when its phase lands, like every mode.

**One card, one plan.** A LickCard plays a single `'learn'` plan, play-once and `mix: 'full'`:

1. Count-in.
2. **The call:** the lick over its changes, in the card's key.
3. **Your turn:** the same changes again, without the lick.

Both passes are one plan, so there is no seam between them, and the cue tells the card which half is sounding. The producer is `lickCallPlan(run)` beside `learnPlan`, source `'learn'`, owner `lick:<lick id>:<serial>`. The owner rules match QuizCard: forget on Next, on a key change and on destroy.

**Sound before symbol.** The staff stays hidden until after your turn, matching the quiz rule that nothing is given away before the answer. Then it reveals the notes, with anything you got wrong marked.

**Grading with a MIDI keyboard** (Chromium; the Keyboard toggle as in QuizCard):

- **New capture stream.** `ChordGesture` reports the peak set on full release, so overlapping melody notes would merge into one "chord". The midi store gains `captureNotes(fn)`: each note-on, as it happens, with the same token-wrapped release as `capture()`. While a LickCard holds it, nothing reaches the song.
- **Pure grader.** `gradeLine(expected, played)` lives in `learn/grade.ts`. It compares in order, by pitch class, in concert pitch (a MIDI keyboard sounds concert). Octave is free, rests are skipped, and extra notes after the last one are ignored. It returns `{correct, marks[]}` per note, as `gradeAnswer` does.
- **Rhythm is not graded in v1.** Only the order of the pitches is.
- **When notes count.** Capture runs during your turn plus a short tail. Notes played during the call are ignored.

**Without a keyboard:** after your turn, Got it / Not yet. That is recorded the same way, through `learnProgress.record`.

**Review.** Progress is keyed `lick:<lick id>` in `vamp:learn` items (box, due, seen, last). Leitner and `buildSession` stay unchanged; Review's catalogue grows to quiz items plus licks. ReviewMode renders a LickCard for a lick item and a QuizCard for the rest, with the same `autoplay` / `onanswer` / `onnext` props.

- **Enrolment:** the first answer in Learn enrols a lick. Practising it in Practice does not.
- **Deleted licks:** a custom lick's progress stays when the lick is deleted. Review already skips ids it no longer knows without deleting them.

**Key and range in Learn:** Learn has no range setting. The card plays in a random key from `KEY_ROOTS` (or one you pick), and the staff uses the pitch select's offset. Which range Learn fits to is an open question.

## Adding your own licks

A **LickEditor** in Practice, built like DrillEditor and seeded from the current lick ("customise this"):

- **Name**, plus **Key** (major or minor).
- **Chords:** numerals, one per bar by default (`ii7 V7 Imaj7`). An optional **Chord beats** list cycles like drill rhythm, for two chords in a bar.
- **Notes:** degree tokens (`2 3 4 6 8 7 6 4 r 5`). **Beats each** cycles, like the drill editor's.
- **Feel:** straight or swing. **Style:** blues, rock or jazz.
- **Preview:** the staff in the current key and range, with the chord names, plus "Plays: 2 – 3 – 4 – 6 …".

Unlike DrillEditor's `parseList`, a bad token is NOT silently dropped. One missing note shifts every note after it onto the wrong beat. The editor names the token and its place ("`x` (note 5) isn't a degree"); likewise for a numeral `parseNumeral` refuses. It saves through `migrateLick`, as a built-in's copy, so the shipped library is never overwritten.

## Storage and backup

- **Custom licks:** a `licks` object store in the same `vamp` database. `DB_VERSION` goes 2 → 3 through the fall-through `upgrade` block, and `getDb()` stays the one opener.
- **`migrateLick`** is THE coercion gate for every lick read and import:
  - numerals must parse, or the chord becomes a rest;
  - chord beats over 0 and up to 64;
  - note beats snap to multiples of 0.5, over 0 and up to 8;
  - tokens capped (64) and unknown tokens turned into rests;
  - total length capped at 16 bars;
  - unknown mode, feel or style falls back to a default;
  - `builtIn` never trusted;
  - `__proto__` and friends handled as in `migrateLearn`.
- **`VampBackup.licks`** follows the `drills` precedent:
  - optional, typed `unknown` in model/, and omitted when empty;
  - song `schemaVersion` stays 1;
  - imported in its own try before the songs;
  - `salvaged(drills, learn, licks)`, so a licks-only backup is a success;
  - `importMessage` names them ("…, plus 2 licks").
- **`static/llms.txt`** documents the backup's `drills`. Licks get a line there too.

## Phases

Each phase is one commit, checked by hand before it lands, as with Learn.

1. **Licks in Practice.** (BUILT 2026-11-10)
   - Model, tokens, `resolveLick`, 8 built-ins (blues 2, rock 2, jazz 4).
   - `drillPlan` with chord backing (`slotIndex: null`) and lead swing.
   - Picker and runner.
2. **Your own licks.** LickEditor, the `licks` store (DB 3), `lickLibrary` store (the twin of `drillLibrary`), backup and import message.
3. **Call and response in Learn.** The Licks mode, LickCard, `lickCallPlan`, self-check, review items.
4. **MIDI grading.** `captureNotes` in the midi store, `gradeLine`, the Keyboard toggle on LickCard.

## Architecture fit

- **New pure modules:**
  - `src/lib/licks/` (types, tokens, resolve, the built-in library) holds the licks themselves. Both workspaces read it, and Learn importing from it keeps the layering (pure → stores → components).
  - `storage/lickDb.ts` and `learn/grade.ts` (`gradeLine`) hold the parts that live in other folders.
  - None imports `tone` or a store.
- **Stores:**
  - `practice` holds a drill or a lick;
  - new `lickLibrary`;
  - `midi` gains `captureNotes` and stays ONE `MidiInput`;
  - `learnProgress` does not change.
- **Engine:** no change. The plan contract already carries lead events on the cue channel, play-once, and full mix.
- **Load-bearing tests:**
  - **Built-ins across keys:** every built-in lick resolves in 12 keys × concert/B♭/E♭ offsets. That run checks valid names, a `voicedToVexKey` round trip on every note, and `(fitted − raw) % 12 === 0`.
  - **Spellings pinned:** `b5` in C = G♭, `#4` in E♭ = A, `4` in G♭ = C♭, `b3` in E = G.
  - **Changes:** every changes numeral becomes a valid symbol in 12 roots × both modes.
  - **Backing:** no event has a `slotIndex`, and chords change at the right quarters.
  - **Swing:** off-beat eighths move to `SWING_OFFBEAT`, while quarters and the notation stay put.
  - **`migrateLick` fed hostile input:** zero/NaN/1e9 beats, 10k tokens, bad numerals, `builtIn: true`. After it the run must still be finite, ordered and positive-length.
  - **`gradeLine`:** octave displacement right, a wrong note marked at its place, extras after the end ignored, an offset instrument's written line graded in concert.
  - **The call plan:** play-once, `'learn'`, full mix, no lead events in the response half.
  - **Built-in lick ids pinned.**

## PoC vs production

This repo is a delivered personal MVP; these shortcuts are deliberate and should stay visible:

- **MIDI grading is Chromium-only.** Safari has no Web MIDI, so iPhone and iPad users self-check.
- **Self-check is the honour system.** Review intervals are only as honest as the button.
- **Rhythm isn't graded,** only pitch order. A lick played in the right notes but the wrong time counts as right.
- **No triplets, sixteenths, grace notes, bends, slides or vibrato.** `beatsToVexDuration` floors at eighths and has no tuplets. Blues licks lose much of their idiom here (bends are central to blues guitar), so the blues side of the library will lean on what notates and sounds right on sampled keys and horns.
- **One fixed swing ratio,** the drums' 0.66, at every tempo. Real swing flattens as tempo rises.
- **Timing checks need a real browser.** The staff and the cue timing can't be watched in the preview pane, which suspends rAF.
- **Original licks only,** the `practice/patterns.ts` rule: no transcriptions from records, no licks lifted from method books or lick collections, and no famous licks by name.

## Decisions

Round 1, 2026-11-09. Each card was answered with my recommendation.

| Decision | Choice | Recommended | Evidence |
|---|---|---|---|
| Where licks live | Split: Practice plays (library, every key, your range); Learn teaches (call and response, review) | Yes, taken | `practice/resolve.ts` (keys, range, written pitch) and `learn/srs.ts` + `learn/grade.ts` (review, MIDI answers) already exist on each side |
| How a lick's notes are written | Degrees relative to the key with alterations, over numeral changes | Yes, taken | `model/numerals.ts` (`parseNumeral`, `numeralToChord`) |
| Adding your own licks | Type degrees + rhythm, staff preview | Yes, taken | `DrillEditor.svelte` already does this for drill cells |
| Call and response | MIDI graded note by note, else self-check; both feed review | Yes, taken | `learn/srs.ts` records any right/wrong |
| Rhythm scope | Eighths and longer, rests, swung playback; triplets later | Yes, taken | `notation/vex.ts` `beatsToVexDuration` floors at eighths, no tuplets |

Settled without a card (challenge any of them):

| Decision | Choice | Basis |
|---|---|---|
| Content | Original licks only | `practice/patterns.ts` rule |
| Definition | Key-free, resolved per run, never stored as pitches | `practice/types.ts` |
| Backing | A lick plays over its own changes with the band, through the same comp builder | convention |
| Pitch | Written pitch, whole-octave fitting, a key that doesn't fit is skipped | `practice/range.ts` |
| Storage | IndexedDB behind a migrate gate, optional in the backup | `storage/drillDb.ts` |
| Audience | Library covers blues/rock and jazz | `docs/learning-research.md` |

Proposed in this design and not put to you as cards (cheap to change before Phase 1):

- `_` for the octave below, `8`–`14` for the octave above.
- A lick is fitted to range as a whole, never folded per note.
- Learn hides the staff until after your turn.
- Review item ids are `lick:<lick id>`.
- The first answer in Learn enrols a lick.
- The four phases and their order.

## Deferred

Still open, for a later round:

- **Fit a lick into your own song's changes** (find a ii–V–I in the song and drop the lick there). [NEEDS CLARIFICATION]
- ~~**Library size and styles per phase**~~ Resolved in Phase 1: 8 licks (blues 2, rock 2, jazz 4). Later phases add to it; ids never change.
- **As built in Phase 1** (differs from or settles the text above): blues plays a swing kit with root bass on an upright; Backing for a lick is Band + click / Band + drums (the style's kit, no click) / Band only, and the band always plays; custom licks (Customise) wait for Phase 2.
- **MIDI recording of licks** (play a lick in on a keyboard instead of typing it). [NEEDS CLARIFICATION]

## Open questions

- The octave-below marker: `_5`, or something more musician-friendly?
- Learn's range: a generous default, or Practice's saved range?
- Should Practice offer an ungraded "your turn" pass, with the band playing the changes again during the rest bars? Or is that Learn's job only?
- Should Practice let you change a lick's groove for the session (a jazz lick over a bossa)?
