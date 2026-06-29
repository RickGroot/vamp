import { describe, it, expect } from 'vitest';
import { Chord } from 'tonal';
import { notationVoicing } from './vex';

const mod12 = (n: number) => ((n % 12) + 12) % 12;
const chromasOf = (midi: number[]) => midi.map(mod12).sort((a, b) => a - b);

/** Resolve a chord symbol the way StaffSheet does, then voice it for the staff. */
function voice(symbol: string): number[] {
	const c = Chord.get(symbol);
	return notationVoicing(c.notes, c.bass || null);
}

describe('notationVoicing', () => {
	it('keeps every tone inside the readable window (~B3..G5)', () => {
		for (const sym of ['Cmaj13', 'G7', 'F#m7b5', 'Dm9', 'E7#9', 'Gm11', 'Bbmaj7', 'Adim7']) {
			const v = voice(sym);
			expect(v.length).toBeGreaterThan(0);
			for (const m of v) {
				expect(m).toBeGreaterThanOrEqual(59);
				expect(m).toBeLessThanOrEqual(79);
			}
		}
	});

	it('renders the correct pitch classes of a major triad', () => {
		// C major -> C, E, G (chroma 0, 4, 7)
		expect(chromasOf(voice('C'))).toEqual([0, 4, 7]);
	});

	it('renders all four tones of a seventh chord', () => {
		// G7 -> G B D F (chroma 7, 11, 2, 5)
		expect(chromasOf(voice('G7'))).toEqual([2, 5, 7, 11]);
	});

	it('places the slash bass as the lowest note for a chord-tone inversion', () => {
		// C/E: E is the lowest sounding note.
		const v = voice('C/E');
		expect(mod12(v[0])).toBe(mod12(4)); // E
	});

	it('includes a non-chord slash bass', () => {
		// C/F: F is not in a C triad, but must still appear.
		const v = voice('C/F');
		expect(v.map(mod12)).toContain(5); // F
	});

	it('returns nothing for an empty input', () => {
		expect(notationVoicing([], null)).toEqual([]);
	});
});
