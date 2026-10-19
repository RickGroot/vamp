# Vamp — design

**Sleeve.** Vamp is a jazz record sleeve, in the Blue Note tradition: hard edges,
heavy condensed type, black and white doing most of the work, and **one flat
field of colour**. The field is the deck's play panel, and it takes the colour of
the chord sounding now. At rest it shows your tune's colour. Chords are set the way
a Real Book prints them, the key is a record, and the choruses you play are cut
as grooves round the play disc. Everything that moves, moves with the music, and
holds still in silence.

**Light** is the sleeve printed on white board. **Dark** is an old black sleeve:
warm charcoal board, aged-paper type, slightly muted inks and a faint print grain,
never digital black.

Tokens live in `src/app.scss` and nowhere else. Components use `var(--…)`.

## Theme

Light · Auto · Dark, three printed segments in the header with the chosen one
inked solid. Auto follows the system; a pinned choice lives in `vamp:theme`
(`'day'` / `'night'`, the ids never changed) and is applied **before first
paint** by the inline script in `app.html` (`data-theme` on `<html>`).
`view.night` is the resolved answer for anything drawn outside CSS. The
`theme-color` meta follows `--ground`.

The header's other switch is the workspace: **SKETCH · PRACTICE · LEARN**,
printed words with the page you're on underlined in ink. It's a place, not a
switch, so it gets an underline rather than a filled box. Practice opens with a
**Back to Sketch** button naming the tune.

## Board and ink

| Token | Light | Dark | Use |
|---|---|---|---|
| `--ground` | `#ffffff` | `#1c1915` | The page and the browser chrome |
| `--paper` | `#ffffff` | `#26221c` | Things that float: menus, popovers, the dock |
| `--wash` | `#f0f0ed` | `#2c2821` | Hover and pressed fills, chips, the start panel |
| `--ink` | `#0e0e0f` | `#ede4d3` (aged paper) | Text, rules, control borders, focus, "on" |
| `--ink-2` | `#3f3f43` | `#d3c9b6` | Secondary text, labels |
| `--ink-3` | `#5c5c60` | `#aaa08d` | Hints, units, placeholders (≥4.5:1 on the ground) |
| `--ink-4` | `#b3b3ae` | `#5f584c` | Disabled marks only |
| `--rule` | `#dadad6` | `#3b362e` | Hairlines, quiet dividers |
| `--spot` / `--on-spot` | ink / ground | ink / ground | **On**: anything switched on, pressed or chosen is inked solid |
| `--field-rest` / `--on-field-rest` | `#0e0e0f` / white | `#2e2a23` / ink | The field when it has no chord to show |
| `--vinyl`, `--vinyl-groove`, `--on-vinyl` | black, `#2c2c30`, white | same (+ a `--vinyl-rim`) | The record. Vinyl is black on either board |
| `--grain` / `--grain-opacity` | none | grey noise, 0.28 | The print's grain: a fixed overlay-blended layer over everything (`body::after`), dark only |

`--rule-heavy` (2px) is the sleeve's printed rule: section rules, the deck's
rules, barlines and every control border. `--radius` is 0. Round things (the play
disc, the record, LED-like status dots) are circles, and nothing else is rounded.

## The field

The one block of colour on the page. The layout writes `--field` and
`--on-field` on `<html>`:

- **Playing:** the sounding chord's ink, with black text (`--on-pigment`).
- **Stopped:** the tune's colour, which is its most-used chord family, with the
  home chord breaking a tie. A blues prints orange and a minor tune prints blue,
  the way a label gave each record its own colour.
- **Blank canvas, a rest, or a drill playing:** `--field-rest`.
- **Practice** sets its own field locally: the key's colour (the record label's
  ink). That makes **Start** the page's one block of colour.

It changes as a **cut**, never a fade, so the field and the ink printed on it
can't disagree mid-way. It appears in three places:
- the deck's play panel, with the play disc cut into it;
- the Stand, where the chord you're on fills it;
- the dock, as the square play button.

## Chord inks

| Family | Ink | Hex |
|---|---|---|
| major | yellow | `#ffbd1a` (dark: `#f0b43a`) |
| minor | blue | `#4f7dff` (dark: `#6a8ef0`) |
| dominant | orange | `#ff5c1c` (dark: `#f0703a`) |
| diminished | magenta | `#ff4583` (dark: `#ec5c88`) |
| augmented | green | `#19c17a` (dark: `#3db87f`) |
| suspended | cyan | `#22b5d7` (dark: `#3fb3cc`) |
| other | grey | `#aaaaa5` (dark: `#a8a194`) |

On dark board the inks print a little less fluorescent. Every ink takes the
dark `--on-pigment` text at ≥5:1, in both themes. A chord sits under a **6px
tab** of its ink. The chord **sounding now** is a solid block of its ink with
black text. **Chord colours mean chord quality and nothing else.** The symbol
always carries the quality as text too.

## Type

One family, **Archivo** (variable, self-hosted, SIL OFL), at two widths:
- **Normal width** for everything you operate.
- **Display:** `--font-display` at `--display-stretch` (62%), weight 900. In
  capitals for interface words: the wordmark, section titles, big numbers (tempo,
  time, loop) and the key name. **Names keep their own case:** the tune title, drill
  names and sketch names, because a capitalised "Jazz ii–V–I in C" reads II.
- **Chords** go through `ChordSymbol`, which sets the same condensed face without
  capitals, Real Book style: a big root, a small raised quality, a slash bass back
  at full size. `model/symbol.ts` does the split. It is display only, and the stored
  symbol stays literal. Flats and sharps are **drawn** (inline SVG at cap height),
  because Archivo has no ♭ / ♯ and the system fallback looked wrong. Long qualities
  (7sus4) set a size smaller, and a slot's chord sizes itself to the slot
  (container units), so a chord is never cut off.
- **Never uppercase a musical name.** "ii–V–I" is not "II–V–I", and an uppercased
  "Bb" reads "BB". The key name's root goes through `ChordSymbol`; preset, example
  and starter names keep their case.
- `.label` is 11px, weight 800, uppercase and tracked, for field names and group
  titles. `.hint` is sentence text. Buttons are 12px, weight 800, uppercase.
- **Petaluma Script** survives **only in the notation staff** (and its PNG/PDF
  export), where a chart is expected to look hand-copied.

## Controls

- `.bar-btn`: a printed box, 2px ink border, square, small caps. Hover is a wash.
  **On** and **primary** (Practise this) are inked solid.
- Fields: values on a 2px ink underline. In the deck the value *is* the control:
  the tempo number is the input, and time and loop are big condensed selects.
- Menus and popovers: `--paper` with a 2px ink border and a soft shadow.
- Focus: one 2px ink ring, offset 2px (on the field, in the field's ink).
- Touch: every control is ≥44px on a coarse pointer (`--tap`). Slot tools get
  their own strip above the chord on touch screens.

## The top of Sketch

Laid out by the editor's own width (container queries), never by ragged wrapping:
- **Title:** the tune's name on its own line, huge and condensed, in its own
  case, sized to fit its length on one line (from 4.75rem down to 1.75rem).
- **Toolbar:** history (undo/redo as two joined boxes), File and Share on the
  left; Stand and **Practise this** (primary) on the right. On a phone: history +
  File + Share, then Stand and Practise as equal halves.
- **The deck** (TransportBar): one band between two heavy rules, its panels
  divided by rules (the grid's gaps showing the ink behind). Panels: **field**
  (play disc + the chord now, or the chord the band starts on) | **tempo** (the
  number, −/+, Tap, Count-in) | **time / loop** | **the record + key** (−/+
  transposes). Desktop: one row. Tablet: the field across the top, the rest
  beneath. Phone: four compact full-width bands — field; tempo with its tools
  beside the number; time | loop; the key as one row.
- **Add chords:** Preset · Examples · Suggest · Inspire me, one row everywhere.
- **The chart's header:** pattern chips (wash blocks, inked on hover) and the
  Roman-numerals toggle.

## The chart

A printed lead sheet: four measures to a line (two on a phone), 2px ink
barlines, thick + thin repeat signs with dots for the loop, a thin + thick final
barline, and one heavy slash per beat. Bars outside the loop fade to grey. The
playhead is the sounding chord's solid block.

## The music, drawn

There is no scenery any more: the sky, sun, meadow and sunflower are gone. What
remains follows four rules:
1. **The music is the only input:** `engine.clock()` and the progression.
2. **Silence is stillness.**
3. **Behind or beside the content, never over it.**
4. **Reduced motion gets a still picture that still carries meaning.**

The pieces:
- **The field** (above): the harmony, as one block of colour.
- **Grooves** (LoopRings) round the play disc, in the field's ink. There is one
  arc per looped bar: faint before it's played, solid once played, thickest while
  sounding. A stylus dot travels round with the engine's clock. Each finished
  chorus leaves a groove, modulated by the tune (dominants push it out a little),
  and a session line under it when you stop.
- **The record** (KeyCompass): the key as a record. The circle of fifths is
  printed round the label, and the label is the key's colour (minor blue, major
  yellow). The tonic is reversed out of an ink spot. Your song's notes are dots on
  the vinyl in the colour of the family that uses each note most, and the sounding
  chord's dots swell. Transposing turns the record the short way round; the note
  names turn back as it goes, so they always read upright. It appears in the deck
  (104px, 72 on a phone), on the Stand, and on Practice.

## The start screen

A blank canvas shows a wash panel: **START A TUNE**, the sketches that recently
left the canvas (`vamp:recent`, saved or not), four starters with their colours
printed side by side, and "try Dm7" in bar 1.

## The stand

Full-screen, for when your hands are on your instrument. The chord you're on
fills the field, set as large as the screen allows. Under it come the next
*change* and how far off it is, then the chart compact below. At the bottom, in
the thumb zone, sit tempo ±5 and the ink play disc with its grooves. The screen
stays awake while music plays.

## The dock

When the deck scrolls away, a printed strip runs along the foot of the screen,
under a heavy rule: a square of the field (play), the chord now with a tab of its
ink, what's next, and Stand.

## Practice

The drill runner's header is the record beside the drill's name, then the
transport: **Start** as a block of the key's colour (it turns to an ink-bordered
**Stop** while running), and **HEAR IT | PLAY IT**, a two-segment switch for whether
the line plays or you play it over the backing. Drill cards are printed boxes; the
chosen one is inked solid.

The drill staff reads like a part:
- barlines fall where the click's bars fall, and rows hold whole bars;
- notes crossing a barline are tied;
- eighths are beamed by half a bar in 4/4, a beat in other simple meters, and a
  dotted quarter in compound meters, never across a barline or a rest;
- accidentals follow the bar rule;
- each key ends on a double barline, the last on a final barline;
- chord names sit over their notes without colliding.

The settings are label-over-field units on a grid: columns on a desktop, two to a row
on a phone, every field 44px tall to the touch.

## Learn

**LEARN** in display capitals, then its modes as printed words under a heavy rule,
the one you're on underlined: the same "place, not a switch" rule as the workspace
nav. A mode only joins that row once it is built.

Cards are printed boxes (2px ink, square). A card's transport reads left to right:
what to play (key, mode), **Play**, then the status against it. Play is the page's
one block of colour, the key's ink (major yellow, minor blue), the same button as
Practice's Start: it turns to an ink-bordered Stop while sounding. The key is
printed beside it, so the colour gives nothing away.

A passage's chords sit in a row of wash chips, each under a 6px tab of its chord's
ink; the sounding one is a solid block of that ink with an ink rule round it (yellow
on the wash is too faint to carry it alone). Under each chord, its Roman numeral.
Tap a chip to hear that chord on its own. When a run ends, the tonic chips are
marked **HOME** in ink, the status says the payoff in full ink, and the next step
(the other mode, another key) is a button away.

Under the cards, **COMING UP**: a greyed tracklist of the modes not built yet,
names only, no links.

**Ear** is one exercise at a time, picked from an **EXERCISE** select grouped by
kind (Chords in a key · Loops · Chord quality). Its card reads top to bottom:
- **The head:** the exercise's name in the condensed display face, in its own case
  (it's a name, like a drill's), its one-line lede under it, and where it stands in
  the review schedule at the right as a label: **NEW**, **DUE FOR REVIEW**,
  **REVIEW TOMORROW**, **REVIEW IN 4 DAYS**. Information, never a score: no
  streaks, no points, no percentages.
- **The deck**, as on the map: the key printed on an ink underline (its root drawn
  by `ChordSymbol`, then "major" / "minor"), **Play** as a block of the key's ink,
  then the status. A chord-quality question has no key ("Any root"), so its Play is
  the field at rest. The status narrates the run ("First the key: hear where home
  is", "Chord 2 of 4") and, once you've answered, says the verdict in full ink.
- **Your answer**, for a question in a key: one printed box per chord, **CHORD 1**,
  **CHORD 2** … with a "?" until you tap. The box to fill next is underlined heavy
  in ink; the chord sounding now gets a second ink rule. Ink only, so nothing on
  the card hints at a chord's quality before you answer.
- **The pad:** printed keys with a 2px ink border, square. A numeral key holds just
  the numeral in the display face, never uppercased, sized to the key by its
  length (V big, ♭VImaj7 still inside a 56px phone key). A loop or quality key
  holds a name in its own case, a loop's formula under it in numerals. Before the
  question has been played the keys are greyed: hear it first. **UNDO** takes back
  the last tap.
- **KEYBOARD**, beside Undo, only in a browser with Web MIDI: a printed toggle,
  inked solid while on (the "on" rule, like Count-in), with one sentence beside it
  saying what the keyboard does here ("Listening to *device*: play each chord in
  turn", "…a chord of that kind, on any root", "…a loop is named with a tap"). A
  chord played fills the next box exactly as a tap would; anything the card can't
  take is said in the status in words ("That isn't a chord I can name"), never
  flashed. Where there's no Web MIDI the row is just Undo, as before.
- **Marking is ink and words.** A wrong numeral is struck through with a drawn ink
  rule and **IT WAS V** printed under it; a right one says **RIGHT**. On a choice
  pad the right answer keeps full ink with a second rule and says **RIGHT ANSWER**
  (or **YOUR ANSWER · RIGHT**), a wrong pick has its name struck and says **YOUR
  ANSWER**, and the rest step back to grey. Never green and red.
- **The reveal**, only after you answer: **WHAT YOU HEARD**, the question's chords
  as the map's chips (wash, a 6px tab of each chord's quality ink, the numeral
  under it), each one tap from being heard on its own. A loop adds its name, one
  line on how to tell it by ear, and why it works.
- **Next question** is the inked primary button and plays the new question at
  once; **JUST THE CHORDS** (or **JUST THE LOOP**) replays the question without
  its cadence.

On a phone Play stretches to fill the row beside the key (at 320 it takes its own
row) with the status under both, and below 400px four or more answer boxes or
chips go two to a row, still read left to right, top to bottom.

Three rules specific to Learn:
- **Numerals are never uppercased.** Case is meaning (ii is minor, II major), so
  numerals go through `Numeral`, which sets `text-transform: none` and draws ♭ / ♯
  like `ChordSymbol` does (both use `Accidental`). Never put a numeral in a
  `.bar-btn`, `.label` or `.display` text node: all three are uppercase.
- **No colour for roles or for right and wrong.** Chord inks mean quality and
  nothing else, so feedback is ink and words.
- **The page's field stays at rest while Learn plays.** The layout already does
  this for any source that isn't the song; it matters here because a field in the
  sounding chord's ink would give away the answer to a chord-quality question. (The
  card's Play block is the key's colour, set locally, never the chord's.)
- **Chords and numerals are SAID to assistive tech.** The drawn face is hidden and a
  spoken form sits beside it: "E flat minor seven", "two minor".
- **A quiz gives nothing away before it's answered.** No chord colour on the slots
  or the pad, and Play takes the key's ink, never the question's chord's. Colour
  arrives with the reveal, where it means what it always means: the chord's quality.

### Your song

The second mode explains the sketch on the canvas, in the key you hear as home.

- **The card is the song.** The key as a record beside the tune's name (its own
  case, never capitals), a count of its chords and how many come from outside the
  key, then the map's transport: key, mode, **Play** (the whole song once, in its
  own sound) and the status. The key starts as the detector's guess and says so;
  pick another and the card names what the chords suggested, with a way back.
- **PATTERNS**: each named progression as a printed entry under a hairline: its
  name in its own case, the bars, the formula in drawn numerals beside the chords,
  what it is and why it works, how to listen, and **Open in Sketch at bars …**,
  which loops those bars there.
- **CHORD BY CHORD**: one row per change. The chord is a wash chip under its ink
  tab (tap it to hear it move to the next chord); beside it a small-caps line with
  the bars and the role, the label in numerals (V7/ii, subV/I, "passing into ii")
  and one sentence. A chord from outside the key is set in full ink with an Open in
  Sketch; a chord in the key is quieter and says its sentence only the first time
  its numeral comes up. **ALL | OUTSIDE THE KEY** narrows the list. On a phone the
  chip stays on the left and everything else stacks beside it.
- **The role is words, never a colour.** The chip's ink is the chord's quality, as
  everywhere; "secondary dominant" or "borrowed" is printed in the row.
- **An empty canvas** gets a card that says what the page will do, with Go to
  Sketch and one example to try.

### Lessons and the map

The map is the sleeve's back: a tracklist you can follow as a route.

- **Next up** comes first: a printed card with the suggested lesson's name in the
  display face (its own case), where it sits (**TRACK 1** · Three chords · Lesson
  1.1), what it trains and how many steps, then **START LESSON** (or **CONTINUE AT
  STEP 3**) inked solid. A first visit says **START HERE**; with every lesson done it
  says so and points to Ear.
- **TRACKS** under a heavy rule, as a route: one heavy ink line with a square stop
  at each track. The stop is open while a track has work left, half-inked once
  you've started it, inked solid when it's done, and grey for a track still to
  come, whose stretch of the line is dashed. The shared start runs full width; then
  the line **forks** into two columns, **POP & ROCK** and **JAZZ**, drawn as a
  bracket that bends right into the jazz line, and both sides bend back into one
  dashed line for the tracks after them (**BOTH SIDES**). The fork stays two columns
  down to 320 wide: there, a side drops each track's summary and puts a lesson's
  state under its title.
- **A track** is its number and name in the display face (own case, never
  capitals), "2 OF 3 DONE" or **COMING LATER**, and one line on what it is about. On
  a wide line the track's text sits left and its lessons right.
- **A lesson** is a tracklist row under a hairline: a small square (open, half,
  inked, like the stops), its number (1.2), its name, and its state at the right:
  **DONE**, **STEP 3 OF 5**, **NEXT UP** (with a heavy rule under the row) or how
  many steps it has. Every row is a link: the order is a suggestion, never a lock.
- **Information, never a score**: no percentages, streaks or badges anywhere on
  the map.

A lesson opens in place of the map (`?lesson=`), the Map tab still underlined:

- **The head**: **THE MAP** with a drawn arrow to go back, the track and lesson
  number as a label (the track's name in its own case), the lesson's name in the
  display face, what it trains and how many steps.
- **The rail**: one cell per step under a heavy rule, a big condensed number and
  its kind (**LISTEN**, **READ**, **QUIZ**, **TRY**), the step you're on underlined
  in ink, the ones behind you in fuller ink than the ones ahead. Any step is a tap
  away. At 320 the numbers carry the rail alone.
- **A listen step** is the Hear home card, generalised: what to listen for in one
  sentence, then the card's transport (the key as a select with its mode printed
  beside it, **Play** in the key's ink, the status), and the passage as chips, four
  to a row like a chart, each one tap from being heard alone. A step about home
  marks the tonic chips **HOME** once it has played. **ANOTHER KEY** follows a run.
- **A read step** is set on the board, not in a box, at reading size (19px on a
  desktop), numerals drawn and set heavier so "home is i" reads as a numeral.
- **A quiz step** is the Ear card itself, with a quiet line under it counting what
  you've answered against a suggested number. Never a gate.
- **A try step** is a card: what to do in Sketch, the key, the song's chords as
  chips, then **TRY IT IN SKETCH** inked solid with one line on what happens to the
  sketch already there ("Undo in Sketch brings yours back").
- **BACK** and **NEXT: READ** close every step; the last one says **FINISH LESSON**.
  Finishing prints **LESSON DONE**, the exercises it put into review by name with
  when each is back ("due now", "back in 2 days"), and **NEXT** with the next
  lesson's name in its own case.

### Lab

The fifth mode tries one change on the bars you loop and lets you hear it against
yours, A/B.

- **The song line** sits above the card, unboxed: the tune's name in its own case,
  "Your loop, bars 5–8" (or the bar count) and how many ideas fit, then the key
  picker. The key is shared with Your song: pick one in either and the other follows.
- **The idea's card**: the move's name in the display voice, in its own case with
  its numerals drawn (ii–V, Backdoor ♭VII7), the bar it changes as a label, and one
  sentence on what changed. Under it the two versions as rows of bars, **A · YOURS**
  over **B · REHARM**: ink barlines, each chord a wash chip under its quality's ink
  tab with its numeral, a split bar's chords sharing the bar by their beats. The new
  chord says **NEW** under its numeral, in ink over a short rule; every B chip keeps
  that line, so the row stays level.
- **A and B are switches.** The printed key at the start of each row plays that
  version round and round, over a few bars around the change, and is inked solid
  while it sounds. Tap the other and it takes over at once, from the top; pick
  another idea while listening and you hear the same side of the new one. Play (the
  key's ink, as on every Learn card) and Stop sit under the rows, with the status
  beside them ("B: the reharm, bars 5–8, round and round").
- **USE IN MY SONG** is the inked primary button: it writes the change into the
  sketch as one undo step, and says so twice: a notice with Undo, and a line above
  the card with its own Undo while the song is still exactly that. **OPEN IN
  SKETCH** goes there.
- **IDEAS**, under a heavy rule: all six moves as printed entries (the name, one line
  on what the move does) with a button per place it fits ("BAR 6  G♭7", the chords in
  their own case); the one on the card is inked. A move with nowhere to go stays in
  the list, greyed: "Nowhere in these bars". The list teaches the vocabulary.
- **Narrow.** When the card is under about 520px the switch becomes a strip above its
  bars, the bars go two to a row, and Play takes the full width.
- **No colour for roles here either.** A tritone sub or a borrowed iv is a word and a
  numeral, never a tint: the chips' inks are the chords' qualities.
- **Empty.** A blank canvas gets a card that says what the Lab does, with Go to
  Sketch and one example to try. Chords with nothing to change say why (two chords in
  a row, room in a bar to split one, and it works on the loop) and offer the same.
