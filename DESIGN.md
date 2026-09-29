# Vamp — design

**Golden hour.** The app is a sky. **Sunrise** (the light theme) is a pale
morning blue warming through peach to gold at the horizon; **Sunset** (the dark
theme) is indigo deepening through plum to a rose glow. The sun sits on the
horizon behind a wildflower meadow and rises when the band starts. Chord
qualities are the colours of the light, the chart is hand-lettered like a lead
sheet, the play button is the sun, and the key is a sunflower. Everything that
moves, moves with the music — and holds still in silence.

Tokens live in `src/app.scss` and nowhere else. Components use `var(--…)`.

## Theme

Sunrise · Auto · Sunset, switched in the header (three radio segments). Auto
follows the system; a pinned choice lives in `vamp:theme` (`'day'` / `'night'`)
and is applied **before first paint** by the inline script in `app.html`
(`data-theme` on `<html>`). `view.night` is the resolved answer for anything
drawn outside CSS. `theme-color` follows `--ground`.

## Sky, paper and ink

| Token | Sunrise | Sunset | Use |
|---|---|---|---|
| `--sky` | `#e6ecfb → #f1e6f3 → #fde4d6 → #ffe6b8` | `#1b1541 → #2c1a52 → #4a2160 → #5e2550 → #7a3048` | The page, fixed behind everything, with `--grain` over it |
| `--ground` | `#fdf0ea` | `#2a1a4f` | The page's representative tone (browser chrome, solid fills) |
| `--paper` | `#fffbf6` | `#2e2458` | Raised sheets: the deck, fields, popovers, buttons |
| `--wash` | `#fbe9dc` | `#3a2e66` | Hover, pressed |
| `--ink` | `#2b2250` | `#fff0e0` | Text, strong barlines, focus |
| `--ink-2` | `#574d78` | `#e6d3dc` | Secondary text, inner barlines |
| `--ink-3` | `#645b84` | `#cdb6c9` | Hints, units — ≥4.5:1 on every stop of the sky |
| `--ink-4` | `#b3abc6` | `#85709a` | Disabled and placeholder marks only |
| `--edge` | `#8a81a6` | `#a58fb2` | Control borders |
| `--rule` | `#efdcd2` | `#4a3b72` | Hairlines, staff lines |
| `--spot` | `#ff6a3d` | `#ffb347` | **The sun: play, Start, anything switched on**, the playhead. `--on-spot` text on it |
| `--sun` / `--sun-core` | `#ffc233` / `#ffcf5a` | `#ffd166` / `#ff9a4a` | The play disc's highlight, the horizon sun, petals |
| `--grass` | `#5aa65b` | `#150f33` | The meadow — green at dawn, silhouettes at dusk |
| `--lift` | warm shadow | glow | How lit things sit on the page |
| `--text-glow` | warm halo | glow | The wordmark, the song title |

## Chord colours — the light

| Family | Colour | Sunrise | Sunset |
|---|---|---|---|
| major | gold | `#f2a900` | `#ffc94d` |
| minor | lilac | `#8b6fd6` | `#c2a8ff` |
| dominant | coral | `#ff6a3d` | `#ff9466` |
| diminished | rose | `#e8456b` | `#ff7096` |
| augmented | sky | `#3d8fe0` | `#7cb8ff` |
| suspended | lagoon | `#1fa8a0` | `#5ed8cc` |
| other | haze | `#a39aa8` | `#bfb2c6` |

Every chord sits on its colour: **by day** a light wash (`--w-{family}`); **at
dusk** a glowing outline round the paper (`--ring`), because a dark fill of any
of these hues turns brown or grey. The chord **sounding now** is a solid block of
its colour with `--on-pigment` text, glowing, with a small pop as it lands. A
stroke of the colour sits under every chord. The symbol always carries the
quality as text too, so colour is never the only cue.

## Type

- **System face** (`--font-ui`) for everything you operate.
- **Petaluma Script** (`--font-hand`, self-hosted, OFL): the wordmark, the song
  title, chord symbols, the stand's chord, drill names, scale notes, tune and
  sketch names.
- `.label` for field names and group titles; `.hint` for sentences.

## Shape and depth

- `--radius: 8px`, `--radius-sm: 5px`; the deck 18px (14px on a phone). Round
  things are round: the sun, pills (history, stepper, theme), the dock.
- `--lift` on lit things; soft shadows on floating things. No hard offsets.
- One focus ring: 2px ink, offset 2px. Underlined fields double their underline.
- Touch: every control ≥44px on a coarse pointer (`--tap`).

## The top of Sketch

Grouped by intent, and laid out by the editor's own width (container queries),
never by ragged wrapping:
- **Song bar:** the title; history (undo/redo as two icons in one pill); the file
  (File · Share); the two ways to play along (Stand · Practise this). Desktop:
  one row. Narrower: title above, actions in a row. Phone: history + File + Share,
  then Stand and Practise as equal halves.
- **The deck** (TransportBar): one paper panel — the sun (play, growth rings,
  session line) on the left, the sunflower (key, name, transpose) on the right,
  tempo (− n + stepper, Tap, Count-in) and Time · Loop between. Desktop: one
  row. Tablet: two. Phone: sun + tempo, then the key, then time and loop.
- **Add chords:** Preset · Examples · Suggest · Inspire me — one row everywhere
  (short labels on a phone).
- **The chart's header:** the pattern chips, and the Roman-numerals toggle, which
  is about reading the chart, so it lives with it.

## The chart

A lead sheet: four measures to a line (two on a phone). Inner barlines are the
lighter ink; repeat signs (loop) and the final barline stay full ink. One slash
per beat on a single-line staff. The playhead is a bar of the sun colour across
the measure that's sounding. Bars outside the loop recede and desaturate.

## Nature — always on

No toggle: it's still whenever nothing plays, so it costs nothing at rest.
Rules for anything in this family:
1. **The music is the only input** — `engine.clock()` and the progression.
2. **Silence is stillness.** Stop, and it settles within a second and holds.
3. **Behind the content, never over it.**
4. **Reduced motion gets a still picture that still carries meaning.**

The pieces:
- **Harmonic weather:** the light takes the sounding chord's colour — high in the
  sky and along the horizon (resting: the song's most-used family), over a beat.
- **The sun** on the horizon, behind the meadow: it rises when you press play
  and settles when you stop (a transition, not a clock).
- **Wildflower meadow:** grass sways once per two beats and gusts from the
  sounding bar; the flowers are your song's garden — shares by chord family,
  buds at rest, blooming when their family sounds. At sunset the grass is a
  silhouette and the flowers glow.
- **Growth rings** round the play button: one arc per looped bar, one ring per
  chorus, and a session summary on stop.

## The sunflower (key compass)

The circle of fifths as a Vogel seedhead ringed with petals. At rest your song's
notes are lit in the colour of the family that uses each most; the tonic is ink;
the sounding chord swells its florets and the petals take a breath. Transposing
turns the flower the short way round. In the deck (96px, 72 on a phone), on the
Stand, and on Practice, where it walks the circle of fifths with the drill.

## The start screen

A blank canvas offers the sketches that recently left it (`vamp:recent`, up to
five, saved or not), four starters (ii–V–I, 12-bar blues, Rising Sun, Surprise
me), and "try Dm7" in bar 1.

## The stand

Full-screen, for when your hands are on your instrument: one chord you can read
from two metres, glowing in its colour; the next *change* and how far off it is;
the chart compact below; the sunflower; tempo and the sun in the thumb zone. The
screen stays awake while music plays.
