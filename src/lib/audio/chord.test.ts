import { describe, it, expect } from 'vitest';
import { Note } from 'tonal';
import { parseChord, isValidChordSymbol, DEFAULT_BASE_OCTAVE } from './chord';

/** Pitch-class set (0-11) of a list of MIDI numbers. */
const chromaSet = (midi: number[]) => new Set(midi.map((m) => ((m % 12) + 12) % 12));
/** Expected pitch-class set from tonal note names. */
const expectedChroma = (notes: string[]) => new Set(notes.map((n) => Note.chroma(n)!));

describe('parseChord', () => {
	it('parses a major seventh into the right notes', () => {
		const c = parseChord('Cmaj7');
		expect(c.valid).toBe(true);
		expect(c.midi).toEqual([60, 64, 67, 71]); // C4 E4 G4 B4
	});

	it('parses a simple minor triad', () => {
		const c = parseChord('Dm');
		expect(c.midi).toEqual([62, 65, 69]); // D4 F4 A4
	});

	it.each([
		['G7', ['G', 'B', 'D', 'F']],
		['F#m7b5', ['F#', 'A', 'C', 'E']],
		['Dsus4', ['D', 'G', 'A']],
		['G7#9', ['G', 'B', 'D', 'F', 'A#']],
		['Bbmaj9', ['Bb', 'D', 'F', 'A', 'C']]
	])('produces the correct pitch classes for %s', (symbol, notes) => {
		const c = parseChord(symbol);
		expect(c.valid).toBe(true);
		expect(c.midi.length).toBe(notes.length);
		expect(chromaSet(c.midi)).toEqual(expectedChroma(notes));
		// strictly ascending voicing
		for (let i = 1; i < c.midi.length; i++) expect(c.midi[i]).toBeGreaterThan(c.midi[i - 1]);
	});

	it('handles slash chords: bass note sits an octave below the voicing', () => {
		const c = parseChord('C/E');
		expect(c.bass).toBe('E');
		// lowest note is the bass pitch class E (chroma 4), and below the rest
		expect(Note.chroma('E')).toBe(c.midi[0]! % 12);
		expect(c.midi[0]).toBe(Note.midi(`E${DEFAULT_BASE_OCTAVE - 1}`));
		expect(c.midi[0]).toBeLessThan(c.midi[1]!);
		// contains a C and a G somewhere above
		expect(chromaSet(c.midi)).toEqual(expectedChroma(['E', 'G', 'C']));
	});

	it('treats a blank symbol as a rest', () => {
		const c = parseChord('   ');
		expect(c.isRest).toBe(true);
		expect(c.empty).toBe(true);
		expect(c.midi).toEqual([]);
	});

	it('flags an unrecognised symbol as empty but not a rest', () => {
		const c = parseChord('Xyz');
		expect(c.empty).toBe(true);
		expect(c.isRest).toBe(false);
		expect(c.midi).toEqual([]);
	});

	it('respects a custom base octave', () => {
		const low = parseChord('Cmaj7', 3);
		expect(low.midi).toEqual([48, 52, 55, 59]); // C3 E3 G3 B3
	});
});

describe('isValidChordSymbol', () => {
	it.each(['Cmaj7', 'Dm', 'G7', 'F#m7b5', 'C/E', 'Dsus4', 'G7#9', 'Bbmaj9', 'Caug', 'Co7'])(
		'accepts %s',
		(s) => expect(isValidChordSymbol(s)).toBe(true)
	);

	it.each(['', '   ', 'Xyz', 'H', 'not-a-chord'])('rejects %s', (s) =>
		expect(isValidChordSymbol(s)).toBe(false)
	);
});
