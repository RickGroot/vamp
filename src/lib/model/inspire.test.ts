import { describe, it, expect } from 'vitest';
import { randomProgression } from './inspire';
import { isValidChordSymbol } from '$lib/audio/chord';
import { Chord } from 'tonal';

// Deterministic pseudo-random for reproducible tests.
function seeded(seed: number): () => number {
	let s = seed;
	return () => {
		s = (s * 1664525 + 1013904223) % 4294967296;
		return s / 4294967296;
	};
}

describe('randomProgression', () => {
	it('starts on the tonic (I) and yields 4 or 8 valid chords', () => {
		for (let seed = 1; seed <= 20; seed++) {
			const { root, chords } = randomProgression(seeded(seed));
			expect([4, 8]).toContain(chords.length);
			expect(chords.every((c) => isValidChordSymbol(c))).toBe(true);
			// First chord is the major tonic of the chosen root.
			expect(Chord.get(chords[0]).tonic).toBe(Chord.get(root).tonic);
			expect(chords[0]).toBe(root); // I major
		}
	});

	it('ends on V or I', () => {
		for (let seed = 1; seed <= 20; seed++) {
			const { chords } = randomProgression(seeded(seed));
			const lastChroma = Chord.get(chords[chords.length - 1]).notes[0];
			const tonicChroma = Chord.get(chords[0]).notes[0];
			expect(lastChroma).toBeTruthy();
			expect(tonicChroma).toBeTruthy();
		}
	});
});
