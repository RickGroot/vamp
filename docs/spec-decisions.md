# Spec decisions

Decisions locked in with Spec Deck, newest first. Claude checks this log before asking, so a settled question isn't asked again. To revisit one, ask Claude to deal it as a card.

## 2026-11-24 · licks · Phase 3 (build)
Document: `docs/licks-design.md`

- **Review item ids**: `call-<slug>` (the lick id without `lick-`), not `lick:<id>`, because the persisted id grammar has no colon _(settled by the code, `storage/learn.ts` `ID_RE`)_
- **The call-and-response producer**: `lickCallRun` on top of `learnPlan`, not a separate `lickCallPlan` _(Claude's recommendation)_
- **Range and tempo in Learn**: the fixed keys range, default tempo 90 (70 / 90 / 110 selectable) _(Claude's recommendation)_
- **Rhythm**: not graded in v1; only the pitches' order is, in Phase 4 _(as decided in round 1)_

## 2026-11-09 · licks · round 1 (spec)
Document: `docs/licks-design.md`

- **Where licks live**: Split: Practice plays, Learn teaches _(Claude's recommendation)_
- **How a lick's notes are written**: Relative to the key _(Claude's recommendation)_
- **Adding your own licks**: Type degrees + rhythm _(Claude's recommendation)_
- **Call-and-response**: MIDI graded, else self-check _(Claude's recommendation)_
- **Rhythm scope**: Eighths+, rests, swung playback _(Claude's recommendation)_
- **Fit a lick into your own song's changes**: deferred
- **Library size and styles per phase**: deferred
- **MIDI recording of licks**: deferred
- **Keyboard grading of a lick (Licks Phase 4)**: the keyboard's verdict is recorded first; Got it / Not yet may correct it once through `rerecord` _(Claude's recommendation)_

## 2026-11-24 · licks · as built
Document: `docs/licks-design.md`

- **Skipping a lick in Review**: Review offers "Skip this lick", which moves on and records no verdict (the lick stays due). Deviates from §5.12, which had every review question answered; a lick can't be played back on the spot in every setting (no instrument to hand), and a forced "Not yet" would send it to box 1. _(Claude's call, confirmed 2026-11-24)_
