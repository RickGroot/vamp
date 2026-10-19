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
