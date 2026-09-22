// How a generated note gets its written spelling.
//
// The rule here deliberately NARROWS the repo-wide convention "always
// Note.simplify() after Note.transpose()". That rule is right for roots and
// chord symbols and WRONG for melodic notes, because simplify rewrites single
// accidentals too:
//
//   simplify('Cb5') === 'B4'   -> destroys the correct Cb of Gb major
//   simplify('E#4') === 'F4'   -> destroys the correct E# of F# major
//
// But tonal's scales really do produce double accidentals in ordinary keys —
// Ab blues has an Ebb, Eb blues and Gb minor pentatonic have a Bbb, the
// diminished scales have F##/Abb — and nobody reads those. 25 of the 168
// root x scale-type combinations contain at least one.
//
// So: keep the root spelling exactly as given (Eb blues stays Eb blues, never
// "D# blues"), and collapse double accidentals per note. That fixes all 25 with
// zero residual and gives the spelling every fake book prints:
//
//   Eb blues -> Eb Gb Ab A  Bb Db      (the b5 written as a natural)
//   Gb major -> Gb Ab Bb Cb Db Eb F    (Cb kept)
//   F# major -> F# G# A# B  C# D# E#   (E# kept)

import { Note } from 'tonal';

const altOf = (name: string): number => Math.abs(Note.get(name).alt ?? 0);

/**
 * Make a generated note name readable: collapse ONLY double accidentals.
 *
 * Uses `simplify` rather than `enharmonic` because it preserves the accidental's
 * direction — simplify('Fbb4') is 'Eb4' where enharmonic('Fbb4') is 'D#4'.
 *
 * Do NOT widen this to a blanket Note.simplify: spelling.test.ts pins Gb major's
 * Cb and F# major's E# precisely so that change fails loudly.
 */
export function readable(name: string): string {
	return altOf(name) >= 2 ? (Note.simplify(name) as string) : name;
}

/**
 * A chromatic approach note a semitone below/above the target.
 *
 * Interval arithmetic, never MIDI arithmetic: `Note.transpose('E4', '-2m')` is
 * D#4 (the leading tone, correctly spelled), whereas midi-1 plus a flats-only
 * midiToNoteName would give Eb4.
 */
export function approachNote(target: string, from: 'below' | 'above'): string {
	return readable(Note.transpose(target, from === 'below' ? '-2m' : '2m'));
}
