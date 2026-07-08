import { describe, it, expect } from 'vitest';
import { Chord } from 'tonal';
import { notationVoicing, voicedToVexKey } from './vex';

const mod12 = (n: number) => ((n % 12) + 12) % 12;
const chromasOf = (midi: number[]) => midi.map(mod12).sort((a, b) => a - b);

/** Resolve a chord symbol the way StaffSheet does, then voice it for the staff. */
function voice(symbol: string) {
	const c = Chord.get(symbol);
	return notationVoicing(c.notes, c.bass || null);
}
const midisOf = (symbol: string) => voice(symbol).map((v) => v.midi);

describe('notationVoicing', () => {
	it('keeps every tone inside the readable window (~B3..G5)', () => {
		for (const sym of ['Cmaj13', 'G7', 'F#m7b5', 'Dm9', 'E7#9', 'Gm11', 'Bbmaj7', 'Adim7']) {
			const v = midisOf(sym);
			expect(v.length).toBeGreaterThan(0);
			for (const m of v) {
				expect(m).toBeGreaterThanOrEqual(59);
				expect(m).toBeLessThanOrEqual(79);
			}
		}
	});

	it('renders the correct pitch classes of a major triad', () => {
		// C major -> C, E, G (chroma 0, 4, 7)
		expect(chromasOf(midisOf('C'))).toEqual([0, 4, 7]);
	});

	it('renders all four tones of a seventh chord', () => {
		// G7 -> G B D F (chroma 7, 11, 2, 5)
		expect(chromasOf(midisOf('G7'))).toEqual([2, 5, 7, 11]);
	});

	it('places the slash bass as the lowest note for a chord-tone inversion', () => {
		// C/E: E is the lowest sounding note.
		const v = midisOf('C/E');
		expect(mod12(v[0])).toBe(mod12(4)); // E
	});

	it('includes a non-chord slash bass', () => {
		// C/F: F is not in a C triad, but must still appear.
		const v = midisOf('C/F');
		expect(v.map(mod12)).toContain(5); // F
	});

	it('returns nothing for an empty input', () => {
		expect(notationVoicing([], null)).toEqual([]);
	});
});

describe('chord spelling on the staff', () => {
	const keysOf = (symbol: string) => voice(symbol).map(voicedToVexKey);

	it('sharp chords render with sharps (not the flat enharmonic)', () => {
		// F#m7 -> F# A C# E; used to render as Gb/Db.
		const keys = keysOf('F#m7');
		expect(keys.map((k) => k.key.split('/')[0])).toEqual(['f#', 'a', 'c#', 'e']);
		expect(keys[0].accidental).toBe('#');
	});

	it('flat chords render with flats', () => {
		// Bb7 -> Bb D F Ab
		const keys = keysOf('Bb7');
		expect(keys.map((k) => k.key.split('/')[0])).toEqual(['bb', 'd', 'f', 'ab']);
	});

	it('the slash bass keeps its own spelling', () => {
		const keys = keysOf('F#m7/C#');
		expect(keys[0].key.split('/')[0]).toBe('c#');
	});

	it('octave follows the LETTER for edge spellings (Cb sits on the C line)', () => {
		// Cb sounds as B (midi 59 = B3) but is written on the C line of octave 4.
		const key = voicedToVexKey({ midi: 59, name: 'Cb' });
		expect(key.key).toBe('cb/4');
		expect(key.accidental).toBe('b');
		// And B# sounds as C (midi 72 = C5) but is written on the B line of octave 4.
		const bs = voicedToVexKey({ midi: 72, name: 'B#' });
		expect(bs.key).toBe('b#/4');
	});

	it('falls back to the flat spelling when the name is unparseable', () => {
		const key = voicedToVexKey({ midi: 61, name: '' });
		expect(key.key).toBe('db/4');
	});
});
