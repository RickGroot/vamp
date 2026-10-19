# Learning chords and progressions: research for a Vamp learning tool

Research only, 2026-10-19. Nothing here is built. It covers what there is to learn about chords and progressions, how common the progressions actually are, how people learn harmony best, what existing tools do, and how a learning tool would fit Vamp's architecture.

## TL;DR

- **About 50 named progressions are worth knowing,** in six families: cadences, pop/rock loops, blues forms, jazz progressions, classical devices and modulation (section 3). Vamp already presets or detects 15 of them.
- **The data says teach I, IV, V, ♭VII and vi first.** Those five roots are 87% of all chords in rock. ♭VII is as common as ii, so it is a basic chord, not an advanced one. Jazz is different: 77% of its chords are sevenths (section 4).
- **The subjects form ten tracks** that fork after the basic loops into a pop/rock side and a jazz side. Each track trains four skills: hear, read, play, use (section 5).
- **Hearing in context works best.** That means testing, mixing topics within a session, and plenty of listening. Give feedback, not points (section 6).
- **Vamp can fill a real gap:** ear training with a real band in a groove, and functional analysis of *your own* song. No existing tool does both (section 7).
- **The best first feature is "Explain my song".** It needs one new pure analyser and lives in Sketch. Ear quizzes in Practice come next, and need one engine change: playing a fixed number of passes instead of looping forever (section 8).

## 1. What Vamp already gives a learning tool

Most of what a learning tool needs already exists, as pure tested modules or as engine features:

| Need | Already in Vamp |
|---|---|
| Play any progression in any key, any instrument, looped | `progressionPlan()` → engine, smplr instruments, bass, drums |
| Name the key and each chord's function | `inferKey`, `romanNumeral`, `diatonicChords` (model/key.ts) |
| Recognise a named progression in a song | `detectProgressions` (model/analysis.ts): 14 patterns, each with a `blurb`, `why` and `listen` text, self-anchored so a ii–V–I in a foreign key is still caught |
| A starter library | 9 `PRESETS` (any root), 18 public-domain `EXAMPLES`, `randomProgression` |
| Chord families as colour | `classifyChord` → 7 families → `--c-{family}` |
| Chord–scale pairing | `scalesForChord`, 14 scale types, staff + fretboard views |
| Voice leading made audible | guide-tone drills (3rds / 7ths through the changes) in Practice |
| Input from a real instrument | `MidiInput` + `detectChordSymbol` (Chromium only) |
| A drone for hearing function against a tonic | `DroneEngine` |
| Transposing instruments | the single `offset` seam, written vs concert pitch |
| A second PlaybackPlan producer | `drillPlan()`, which proves the engine can play generated material that is not the user's song |

The gap is a **curriculum layer** (topics, order, lessons), **ear-training interactions** (play something, ask what it was) and **progress memory** (what you know, what is due for review).

## 2. The chord vocabulary

What there is to learn about chords themselves, in the order it usually builds. Symbols in C.

| Group | Chords | What a learner should take away |
|---|---|---|
| Triads | C, Cm, Cdim, Caug | Stacked thirds; the 3rd decides major/minor, the 5th decides dim/aug. Hearing major vs minor is the first ear skill. |
| Suspended and open | Csus2, Csus4, C5 | No 3rd, so no major/minor: the sound of "unresolved" and of rock power chords. |
| Inversions and slash chords | C/E, C/G, F/G, D/C | The bass note changes the chord's job. F/G is a sus-sounding dominant; C/E smooths a bass line. |
| Sixths | C6, Cm6, C6/9 | Tonic colours that don't pull anywhere (swing and bossa endings). |
| The five core sevenths | Cmaj7, C7, Cm7, Cm7♭5 (ø), Cdim7 (°7) | The vocabulary of jazz and soul. Each one maps to a place in the key (Imaj7, V7, ii7, viiø7, and the diminished passing chord). |
| Other sevenths | Cm(maj7), C7sus4, Cmaj7♯5 | The line-cliché sound, the modern sus dominant, the melodic-minor colours. |
| Extensions | C9, Cmaj9, Cm9, C11, Cm11, C13, Cadd9, Cmaj7♯11 | Upper notes of the same stack of thirds; which ones clash (the "avoid" 11 on a major chord) and why ♯11 fixes it. |
| Altered dominants | C7♭9, C7♯9, C7♯11, C7♭13, C7alt | Tension added to a dominant so it pulls harder into its resolution. |
| Voicings (a skill, not a chord) | close, open, shell (1-3-7), rootless, drop-2, quartal, upper-structure triads | How the same symbol is actually played, and how voicings connect smoothly. |

Two ideas run through all of it and are worth teaching explicitly:

- **Function over spelling.** A chord's name says what it is; its Roman numeral says what it does. Vamp already stores the literal symbol and computes the numeral, so it can show both side by side.
- **Guide tones.** The 3rd and 7th define a seventh chord's quality, and in a ii–V–I they move by half step or stay put. Vamp's guide-tone drills already make this audible.

## 3. The progression catalogue

The progressions worth teaching, grouped by family. "Vamp" says what the app already does with each one: **P** = a preset, **D** = detected by `analysis.ts`, **E** = in the examples, **–** = not yet.

### Cadences (how phrases end)

| Name | Numerals | In C | What it teaches | Vamp |
|---|---|---|---|---|
| Authentic (perfect) | V(7)–I | G7–C | The strongest full stop: the leading tone rises, the root falls a fifth. | D |
| Half cadence | …–V | Dm–G | A comma, not a full stop: the phrase ends on the dominant. | – (needs a wildcard step) |
| Plagal ("Amen") | IV–I | F–C | Resolution without a leading tone; hymn and rock endings. | D |
| Minor plagal | iv–I | Fm–C | The borrowed-iv "sigh"; a gateway into modal interchange. | – |
| Deceptive | V–vi | G–Am | The ear expects I and gets vi, which shares two of its notes. | D |
| Phrygian half cadence | iv6–V (minor) | Fm/A♭–G | Baroque minor-key ending; bass falls a half step. | – |
| Backdoor | ♭VII7–I (or iv–♭VII7–I) | B♭7–C | Resolving "from below"; the same half-step pulls as V7–I. | D (♭VII7–I only) |
| Picardy third | …–I (in minor) | …G7–C (in C minor) | Ending a minor piece on a major tonic. | – |

### Pop and rock loops

| Name | Numerals | In C | Where you hear it | Vamp |
|---|---|---|---|---|
| Axis / "four chords" | I–V–vi–IV | C–G–Am–F | "Let It Be", "With or Without You" | P D |
| Axis, minor start | vi–IV–I–V | Am–F–C–G | Same four chords started on vi: same notes, darker mood. | P D |
| Other axis rotations | IV–I–V–vi, V–vi–IV–I | | Teaches that a loop's starting point sets its mood. | – |
| "Hopscotch" | IV–V–vi–I | F–G–Am–C | Pop since about 2010; ends on I instead of starting there. | – |
| 50s / doo-wop | I–vi–IV–V | C–Am–F–G | "Stand By Me", "Heart and Soul" | P D |
| Three-chord | I–IV–V | C–F–G | "La Bamba", "Twist and Shout"; the blues' DNA. | P (not detected, on purpose) |
| Mixolydian rock | I–♭VII–IV–I | C–B♭–F–C | "Sweet Child O' Mine", the "Hey Jude" coda | – |
| Minor "epic" loop | i–♭VI–♭III–♭VII | Cm–A♭–E♭–B♭ | Film and stadium rock; the minor relative of the axis. | – |
| Andalusian | i–♭VII–♭VI–V | Am–G–F–E | "Hit the Road Jack", flamenco | P D |
| Royal Road | IV–V–iii–vi | F–G–Em–Am | J-pop and anime themes; never lands on I. | D |
| Major-to-minor iv | I–III–IV–iv | C–E–F–Fm | "Creep"; the chromatic iv as an emotional turn. | – |
| "Just the Two of Us" | IVmaj7–III7–vi7–(v7–I7) | Fmaj7–E7–Am7–(Gm7–C7) | Neo-soul; a secondary dominant (III7 = V/vi) inside a loop. | – |
| Canon | I–V–vi–iii–IV–I–IV–V | C–G–Am–Em–F–C–F–G | Pachelbel; a sequence over a falling bass. | P D E |
| Mario cadence | ♭VI–♭VII–I | A♭–B♭–C | Video-game fanfares, power ballads; borrowed chords rising to I. | – |
| Line cliché | i–i(maj7)–i7–i6 | Am–Am(maj7)–Am7–Am6 | One voice descends chromatically inside a held chord. | – |
| Lament bass | i–v6–iv6–V (descending bass) | Am–Em/G–Dm/F–E | A falling tetrachord in the bass; centuries old. | – |

### Blues forms

| Name | Form | Vamp |
|---|---|---|
| 12-bar blues | I7 ×4, IV7 ×2, I7 ×2, V7–IV7–I7–V7, with or without the "quick change" to IV in bar 2 | P D E |
| 8-bar blues | e.g. I–V–IV–IV–I–V–I–V | – |
| Jazz blues | 12-bar with ii–Vs into IV and back to I, VI7 in bar 8, a I–VI–ii–V turnaround | – |
| Minor blues | i7 ×4, iv7 ×2, i7 ×2, ♭VI7–V7–i7–(V7) | – |
| "Bird" blues | a descending chain of ii–Vs from bar 1 | – |

### Jazz progressions

| Name | Numerals | In C | What it teaches | Vamp |
|---|---|---|---|---|
| Major ii–V–I | iim7–V7–Imaj7 | Dm7–G7–Cmaj7 | The core move of jazz; guide tones moving by half step. | P D |
| Minor ii–V–i | iiø7–V7(♭9)–im7 | Dm7♭5–G7♭9–Cm7 | The minor version; harmonic minor over the V. | P D |
| Turnaround | I–vi–ii–V, iii–vi–ii–V | C–Am7–Dm7–G7 | The last two bars of a form, built to loop. | D |
| Turnaround with dominants | I–VI7–ii–V7, III7–VI7–II7–V7 | C–A7–Dm7–G7 | Secondary dominants as a chain of fifths. | – |
| Tadd Dameron turnaround | Imaj7–♭IIImaj7–♭VImaj7–♭IImaj7 | C–E♭–A♭–D♭ (maj7s) | Tritone subs of a turnaround, all major sevenths. | – |
| Tritone substitution | iim7–♭II7–Imaj7 | Dm7–D♭7–Cmaj7 | Replacing V7 with the dominant a tritone away; same guide tones, chromatic bass. | – |
| Secondary dominants | V7/x | A7 → Dm, E7 → Am | Any chord can be "tonicised" by its own V7. | – |
| Circle of fifths | iv–♭VII–♭III–♭VI–iiø–V–i (minor) | Fm7–B♭7–E♭maj7–A♭maj7–Dm7♭5–G7–Cm | A ii–V–I in the relative major followed by one in the minor ("Autumn Leaves" type). | – |
| Rhythm changes | A: I–vi–ii–V loops; B: III7–VI7–II7–V7, two bars each | | The second most-played jazz form after the blues. | – |
| Diminished passing chord | I–♯I°7–ii | C–C♯°7–Dm7 | Chromatic connector; a dim7 is a rootless V7♭9. | – |
| Modal vamp | Dorian i7–IV7, Mixolydian I–♭VII, or one chord held | Dm7–G7 (D Dorian); Dm7 for 16 bars | No cadence at all; the scale is the harmony ("So What", "Oye Como Va"). | – |
| Coltrane changes | key centres a major third apart | Cmaj7–E♭7–A♭maj7–B7–Emaj7 … | Symmetric, non-diatonic motion ("Giant Steps"). | – |

### Classical and film devices

| Name | Example in C | What it teaches | Vamp |
|---|---|---|---|
| Cadential 6/4 | C/G–G7–C | A tonic chord that functions as a dominant decoration. | – |
| Neapolitan | D♭/F–G7–C | ♭II6 as a dark pre-dominant. | – |
| Augmented sixth chords | A♭7(♯6 spelling)–G | Italian, French, German +6: two notes expanding outward onto V. | – |
| Chromatic mediants | C–A♭, C–E | Major chords a third apart; the film-score "wonder" sound. | – |
| Pedal point | C–F/C–G/C–C | Harmony moves over a held bass note. | – |

### Modulation

Pivot chord (a chord shared by both keys), direct modulation, a ii–V into the new key, and the pop "truck-driver" step up by a semitone or tone. Vamp's self-anchored detection already notices ii–Vs in foreign keys and names them relative to the song's key ("in G: the V of C"), which is exactly the hook to teach tonicisation and modulation.

## 4. How common are they? The data

Order a curriculum by how often things actually occur, and teach the frequent ones first. The best numbers available:

**Rock and pop (de Clercq & Temperley 2011, 100 songs from Rolling Stone's "500 Greatest", 1950s–1990s, both authors analysing every song) [1]:**

- Share of all chords by root: I 32.8%, IV 22.6%, V 16.3%, ♭VII 8.1%, VI 7.2%, ♭VI 4.0%, II 3.6%. Five roots (I, IV, V, ♭VII, VI) are 87% of everything.
- ♭VII appears in 37 of the 100 songs, about as many as II (39) or VI (39).
- 76% of chords are major, 23% minor, under 1% diminished; 94% are in root position.
- Before I: IV 40%, V 27%, ♭VII 13%. After V: I 53%, IV 26%, VI 13%. (Computed from their transition table.)
- The most common three-chord approaches to I: IV–V–I, V–IV–I, ♭VII–IV–I, VI–IV–I, ♭VII–♭VI–I. ii–V–I is far behind.
- Their 200-song follow-up shows almost the same picture [2].

**Crowd-sourced pop (Hooktheory TheoryTabs, about 1,300 song sections around 2012) [3]:** after I comes IV 46%, V 26%, ii 8%; after V comes I 32%, vi 29%, IV 25%. Hooktheory names I–V–vi–IV the most popular four-chord loop but publishes no share. Its live "Trends" data (75,000+ songs) sits behind a dynamic page and a login-only API [4].

**Pop schemas (Open Music Theory) [5]:** doo-wop I–vi–IV–V (since the 1950s), "singer/songwriter" I–V–vi–IV and vi–IV–I–V (common since the mid-1990s), and "hopscotch" IV–V–vi–I (rising since about 2010). Vamp has the first two, not the third.

**Jazz (Impro-Visor corpus, 2,612 tunes, 134,182 chord symbols) [6]:** dominant 7ths 35%, minor 7ths 23%, major 7ths 15%, half-diminished 3%, diminished 7ths 2%. 77% of all chords are seventh chords. A study of 1,086 standards found that root motion up a fourth (the ii→V→I motion) dropped sharply in the 1950s, as modal and post-bop writing took over [7].

**What we could not find:** a reliable share of songs that use I–V–vi–IV, and any measured ii–V–I frequency in jazz. Treat those as folklore, however true they feel.

**Three consequences for Vamp:**

1. **♭VII belongs in the basics.** The corpus puts ♭VII ahead of ii and iii in rock, yet every tutorial files it under "advanced, borrowed chords". I–♭VII–IV is missing from both `PRESETS` and `analysis.ts`.
2. **IV is as important as V.** Rock lands on I from IV more often than from V, and V–IV–I is a normal cadence there. Lessons shouldn't present it as a mistake.
3. **Jazz starts with sevenths.** Three quarters of jazz chords are sevenths, so the jazz track can't save them for later the way a classical course does.

## 5. The subject map

What people can learn about chords and progressions, as ten "tracks" in a suggested order. It follows the frequency data and the ear-first evidence: a few frequent sounds, heard in context, then names for them. Each track trains four skills:

- **Hear:** identify it by ear.
- **Read:** name it as a symbol and a numeral.
- **Play:** voice it on an instrument.
- **Use:** improvise or write with it.

| # | Track | Topics | Builds on in Vamp |
|---|---|---|---|
| 0 | Home | the tonic; hearing "home" against a drone; major vs minor triads; what a key is | drone, `classifyChord` colours |
| 1 | Three chords | I, IV, V; V–I and IV–I; V–IV–I as a rock cadence; the 12-bar blues with triads | presets, blues example |
| 2 | The four-chord loops | vi; the axis and its rotations; doo-wop; hopscotch; the deceptive cadence; how the starting chord sets the mood | presets + detection |
| 3 | Rock's borrowed chords | ♭VII, ♭VI, ♭III; I–♭VII–IV; ♭VI–♭VII–I; the minor "epic" loop; minor iv (iv–I, I–III–IV–iv) | new |
| 4 | Minor keys | i, iv, v vs V (why harmonic minor exists), Andalusian, lament bass, line cliché, Picardy third | Andalusian preset; harmonic-minor scale |
| 5 | Sevenths and guide tones | the five core sevenths; diatonic sevenths; ii; ii–V–I major and minor; guide-tone lines; shell voicings | presets, guide-tone drills, notation |
| 6 | Jazz forms | turnarounds, jazz blues, minor blues, rhythm changes, the circle of fifths ("Autumn Leaves" type) | turnaround detection, Stand view |
| 7 | Dominants everywhere | secondary dominants, related ii's (secondary ii–Vs), tritone subs, backdoor, diminished passing chords, chains of dominants | backdoor detection; relation naming ("the V of C") |
| 8 | Colour | extensions, alterations, sus dominants, chord–scale pairing, upper structures | `scalesForChord`, Scales section |
| 9 | Beyond function | modal vamps, pedal points, chromatic mediants, Coltrane changes | scales, drone |
| 10 | Changing key | tonicisation vs modulation, pivot chords, direct modulation, the truck-driver step | self-anchored detection |

Ordering notes:

- **Every tradition orders this differently** [8]:
  - *Classical (Kostka-Payne):* triads and voice leading first; sevenths after cadences; mode mixture, the Neapolitan and augmented sixths late.
  - *Pop (Hooktheory):* by frequency: I, IV, V and vi before ii and iii; sevenths, secondary chords, minor keys and modal mixture in book two.
  - *Jazz (Levine, Berklee):* sevenths and ii–V–I almost at once; blues and rhythm changes taught as forms; reharmonisation last.

  Vamp's users are improvisers, so a fork after track 2 makes sense: a **pop/rock side** (3, 4) and a **jazz side** (5, 6, 7), joining again at 8.
- **Teach loops as whole units.** Open Music Theory teaches pop through whole schemas, not chord by chord. Insights in Jazz (Cork, Elliott) teaches jazz through named, frequent "bricks" of chords [9]. `analysis.ts` already works that way: a lesson can be one pattern from its dictionary.
- **Classical-only topics** (cadential 6/4, Neapolitan, augmented sixths, four-part voice leading) can stay out, or sit in an appendix. They matter less to an improviser over a looped groove.

## 6. How people learn harmony best

The evidence is thinner than the confident advice online, but it points one way:

- **Practice with listening works; practice alone may not.** In an interval-training study, only practice combined with passive listening raised accuracy (69% to 88%) and transferred to untrained intervals [10]. A learning tool should make you *hear a lot* (looping a groove for minutes, which Vamp already does) as well as quiz you.
- **Interleave.** Mixing categories in one session beat practising one category at a time, for melodic intervals [11] and for recognising composers' styles [12]. Learners believed the opposite. So a review session should mix "IV or V?" with "which loop is this?", not drill one at a time.
- **Test, don't re-read.** Retrieval practice beats restudying at two-day and one-week delays [13]. That finding is from prose, not music, but it is one of the most robust results in learning science.
- **Spacing is unproven for music** [14] but well established elsewhere. A light Leitner-box schedule is a reasonable bet, not a proven one.
- **Hear function in context.** Functional ear training names notes and chords by their role in an established key (Benbassat's Functional Ear Trainer, Toned Ear, EarMaster) [15]. A key context helps interval judgments a little [16]. No controlled study comparing functional with interval training was found, but in-context training is closer to what an improviser needs, and Vamp always has a key.
- **Sound before symbol** (Gordon's Music Learning Theory) is widely taught, though the evidence comes mostly from Gordon himself [17].
- **Feedback, not points.** A gamification meta-analysis shows small gains [18], but a semester-long study found that badges and a leaderboard *lowered* motivation and exam scores [19]. Across 128 studies, expected rewards undermine intrinsic motivation, while informational feedback raises it [20]. Show what you can now hear and what is due; skip streaks, scores and leaderboards. That also suits an offline app with no accounts.

## 7. What exists, and the gap

| Tool | How it teaches | Weak spot |
|---|---|---|
| Hooktheory books + Hookpad [21] | Chords by frequency, real-song examples, a function-coloured sketchpad with next-chord suggestions | Little testing, no progress tracking, synthetic sound; Hookpad's best palettes are paid and need a connection |
| musictheory.net [22] | Free lessons through to the Neapolitan; build/identify exercises; chord-quality ear training | No progression exercises |
| teoria.com [23] | Harmonic function tutorials; progression and four-voice dictation | Classical, notation-heavy |
| Open Music Theory [5] | Free textbook: phrase model, chromaticism, jazz, pop schemas | A book, not an interactive tool |
| Functional Ear Trainer, Toned Ear, EarMaster [15] | Name the degree or chord in an established key; EarMaster adds jazz workshops | Sparse, General-MIDI-style sound; tapping on screen, not playing |
| iReal Pro [24] | A play-along: transpose and speed up each repeat, loop bars, mute parts | Gives context, not feedback; no teaching |
| Chordify [25] | Chord letters from a recording, slow-down and loop | Letter names only, no function |
| Yousician, Melodics [26] | Song-led or rhythm drills with live pitch detection | Little theory; plateaus past beginner |
| Aebersold play-alongs [27] | Learn the chord's scale, then play over a band in every key | A static recording, no feedback |
| Insights in Jazz / Impro-Visor [9] | Named, frequent chord "bricks" and key-free roadmaps of tunes | Niche, dated interface |

**The gap Vamp can fill**, because nothing above joins these together:

1. **Ear training with a real band.** Every ear trainer plays isolated piano chords. Vamp can quiz you inside a looping groove, with bass and drums, in any key and at any tempo.
2. **Function inside your own song.** Hookpad colours chords by function but barely tests you. Ear trainers test you but never touch your song. Vamp already detects patterns in your sketch and names foreign-key ii–Vs relative to the song's key.
3. **Hear it, then play over it, in one place.** iReal and Aebersold give the context without the teaching; theory apps give the teaching without the context.
4. **Offline, and free of a subscription.** The corpus statistics behind "what comes next" exist only online, behind a paywall or a login.
5. **Rock vocabulary treated as normal.** ♭VII and plagal motion as everyday chords, not exotic borrowings.

## 8. Ideas for Vamp, ranked

Ranked by value to an improviser against effort in this codebase:

1. **Explain my song.** Walk through the user's own sketch:
   - the key, each numeral, the detected patterns (already written: `blurb` / `why` / `listen`);
   - *new:* a label for every chord outside the key: secondary dominant ("A7 = V of Dm"), borrowed chord ("B♭ = ♭VII, from C minor"), tritone sub, passing diminished.

   That last part is one new pure function next to `analysis.ts`, fully testable. It is the "function in your own song" gap, and it lives in Sketch, so no new route.
2. **Hear the function** (ear quiz in a groove). Set the key with a cadence or the drone, play a short progression with the band, ask for the numerals.
   - Answer by tapping numerals, or by playing the chord on a MIDI keyboard (`detectChordSymbol` exists).
   - Levels follow the tracks: I/IV/V first, then vi, then ♭VII, then sevenths.
   - Questions generated by a pure function with an injected `rand`, like `randomProgression`.
3. **Name that loop.** Play a schema from the `analysis.ts` dictionary in a random key, tempo and groove; pick its name from four. Interleaved by design. The answer key and the explanations already exist.
4. **Lessons that open in Sketch.**
   - A lesson is a short original text plus a progression plus one "try this" step (make the vi a VI7 and listen to it pull to ii).
   - It loads through `progression.load()`, so the user's sketch is one Undo away (the draft convention).
5. **Reharm lab.** Pure transformations of a progression, heard A/B:
   - put a ii before a V, or a V7 before any chord;
   - tritone-sub a dominant, borrow iv, or use the backdoor.

   Each is one undoable edit (`checkpoint` + `touch`).
6. **What comes next.** Weight `SuggestMenu`'s next-chord suggestions by corpus transition probabilities, and say why ("V usually goes to I, but to vi a third of the time"). Check the data licence first (see open questions).
7. **Review queue.** A Leitner-box schedule per item ("hear IV vs V in major"). Interleaved sessions, informational feedback only.

### Architecture fit

- **Pure layer, tested:** a new `src/lib/learn/`:
  - `curriculum.ts`: tracks and lessons, **original text only**, the same rule as `practice/patterns.ts`. Song titles as references, never lyrics, nothing copied from Hooktheory or textbooks.
  - `quiz.ts`: question generators with an injected `rand`.
  - `srs.ts`: the scheduler, with an injected `now`.
  - `reharm.ts`: the transformations.
  - The chromatic-chord labeller next to `analysis.ts` in `model/`.
- **Playback:** a third `PlaybackPlan` producer, `learnPlan()`, with a new `PlaybackSource` `'learn'`. The plan type requires a source, and the progression store already early-returns unless the source is `'progression'`. Quiz events go on the **cue** channel, never `slotIndex`.
- **One gap in the engine:** it always loops. `engine.ts` sets `part.loop = true`, and a quiz wants "play twice, then stop and wait". Either add an optional pass count to the plan or stop from `onLoop`. Engine changes are untested in node, so verify them by hand.
- **Persistence:**
  - Progress is a new IndexedDB store: `DB_VERSION` 3 and a `migrateProgress` coercion gate, the twin of `migrateDrill`.
  - Add an optional `learn` key to `VampBackup`, following the `drills` precedent, so progress survives a cleared browser. The song `schemaVersion` stays 1.
- **Where it lives:**
  - Ideas 1, 4 and 5 belong in Sketch. Ideas 2, 3 and 7 fit Practice as a second mode beside the drills.
  - A `/learn` route only once there is a curriculum map to show. A third route means nav, prerender, the share URL and a `sitemap.xml` line.
- **Offline:** everything ships in the bundle. Quiz audio reuses the cached samples.

**PoC vs production.** As a personal MVP this is fine with local-only progress. The shortcuts to flag:

- Progress is lost if site data is cleared, unless it is in the backup.
- There is no on-screen keyboard fallback for Safari and Firefox, where Web MIDI is missing.
- Ear quizzes need a real-browser check, since the preview pane suspends rAF and the Draw-synced highlight.

## 9. Open questions

- **Who is it for first?** A pop/rock beginner (tracks 0–4) or a jazz improviser (5–7)? That decides the order and which ideas come first.
- **Ear-first or theory-first?** The evidence favours hearing in context first. That suggests ideas 2 and 3 early, not a reading course.
- **Answer input:** tapping numerals, a MIDI keyboard, an on-screen keyboard, or mic pitch detection (much harder)?
- **Corpus data licence:**
  - Hooktheory's API needs a login and has its own terms; don't scrape it.
  - The de Clercq & Temperley tables are published research. A small set of derived probabilities is probably fine, but check the rock corpus's licence before shipping it.
  - Being in the EU, database rights apply.
- **"Melodious":** the research read it as Melodics. Was that the app you meant?

## Sources

1. de Clercq & Temperley, "A corpus analysis of rock harmony", *Popular Music* 2011. https://rockcorpus.midside.com/2011_paper/declercq_temperley_2011.pdf
2. de Clercq, RS 200 follow-up (EuroMAC 2014 slides). https://www.midside.com/presentations/declercq_2014_euromac_slides.pdf
3. Hooktheory, inversions and slash chords study. https://www.hooktheory.com/blog/statistical-study-inversions-slash-chords-popular-music/ (a later post gives V after I as 31%: https://www.hooktheory.com/blog/chord-progression-search-patterns-and-trends/)
4. Hooktheory Trends. https://www.hooktheory.com/trends · API: https://hooktheory.com/api/trends/docs
5. Open Music Theory 2e, four-chord schemas. https://human.libretexts.org/Bookshelves/Music/Music_Theory/Open_Music_Theory_2e_(Gotham_et_al.)/07:_Popular_Music/7.09:_Four-Chord_Schemas · whole book: https://human.libretexts.org/Bookshelves/Music/Music_Theory/Open_Music_Theory_2e_(Gotham_et_al.)
6. Impro-Visor jazz corpus statistics. https://arxiv.org/pdf/2208.00792
7. Broze & Shanahan, *Music Perception* 2013 (jazz harmony over time). https://jazztheory.ssac.carleton.ca/view.php?id=713
8. Kostka-Payne contents: https://highered.mheducation.com/sites/0078025141/information_center_view0/table_of_contents.html · Hooktheory books: https://www.hooktheory.com/books/one, https://www.hooktheory.com/books/two · Levine: https://www.shermusic.com/1883217040.php · Berklee Harmony 2: https://online.berklee.edu/courses/harmony-2
9. Insights in Jazz (LEGO bricks): https://www.miles.be/articles/insights-in-jazz/ · Impro-Visor roadmaps: https://www.cs.hmc.edu/~keller/jazz/improvisor/Roadmap507.htm
10. Practice plus exposure in interval training. https://featuredcontent.psychonomic.org/perfect-unison-or-perfect-fourth-practice-makes-perfect-only-with-exposure-during-musical-interval-training/
11. Wong, Chen & Lim 2021, interleaving melodic intervals. https://journals.sagepub.com/doi/10.1177/0305735620922595
12. Interleaving composers' styles. https://findanexpert.unimelb.edu.au/scholarlywork/1493106-learning-music-composers'-styles--to-block-or-to-interleave%3F
13. Roediger & Karpicke 2006, testing effect. https://psychology.ecu.edu/wp-content/pv-uploads/sites/216/2019/03/Roediger-Karpicke-2006.pdf
14. "Lack of spacing effects during piano learning", *PLoS One*. https://pmc.ncbi.nlm.nih.gov/articles/PMC5553926
15. Functional Ear Trainer: https://apps.apple.com/app/id1088761926 · Toned Ear: https://tonedear.com/ · EarMaster: https://earmaster.com/products/ear-training-sight-singing/earmaster-software.html
16. Tonal context and interval discrimination. https://pmc.ncbi.nlm.nih.gov/articles/PMC5640898/
17. Gordon's Music Learning Theory. https://en.wikipedia.org/wiki/Gordon_music_learning_theory
18. Gamification meta-analysis. https://link.springer.com/article/10.1007/s10648-019-09498-w
19. Badges and leaderboards over a semester. https://www.smhp.psych.ucla.edu/pdfdocs/gamil.pdf
20. Deci, Koestner & Ryan, extrinsic rewards meta-analysis. https://depts.washington.edu/techdocs/papers/deciExtrinsicRewardsAndIntrinsicMotivation99.pdf
21. Hookpad: https://www.hooktheory.com/blog/introducing-hookpad-2-a-musical-sketchpad-with-music-theory-built-in/ · review of the books: https://www.musical-u.com/learn/review-hooktheory-music-theory-book
22. musictheory.net. https://www.musictheory.net/lessons · https://www.musictheory.net/exercises
23. teoria.com exercises. https://www.teoria.com/en/exercises/
24. iReal Pro practice techniques. https://www.irealpro.com/learn/advanced-practicing-techniques
25. Chordify review. https://www.guitarchalk.com/chordify-review/
26. Yousician review: https://www.guitarchalk.com/yousician-review/ · Melodics vs Yousician: https://melodics.com/blog/melodics-vs-yousician
27. Aebersold Volume 1. https://www.ellismusic.com/p-2518.aspx
