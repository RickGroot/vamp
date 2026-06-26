import { describe, it, expect } from 'vitest';
import { Note } from 'tonal';
import { nearestMidi, voiceKeyboard, voiceGuitar, voiceSequence } from './voicing';

const chromaOf = (m: number) => ((m % 12) + 12) % 12;
const chromaSet = (midi: number[]) => new Set(midi.map(chromaOf));
const expectedChroma = (pcs: string[]) => new Set(pcs.map((p) => Note.chroma(p)!));

describe('nearestMidi', () => {
	it('picks the closest octave for a pitch class', () => {
		expect(nearestMidi(0, 64)).toBe(60); // C nearest to 64
		expect(nearestMidi(7, 64)).toBe(67); // G
		expect(nearestMidi(4, 64)).toBe(64); // E exact
	});
});

describe('voiceKeyboard', () => {
	it('voices the right chord tones near the target', () => {
		const v = voiceKeyboard(['C', 'E', 'G', 'B'], null, 64);
		expect(chromaSet(v)).toEqual(expectedChroma(['C', 'E', 'G', 'B']));
		expect(v.every((m) => m >= 36 && m <= 88)).toBe(true);
	});

	it('places a slash bass below the rest of the voicing', () => {
		const v = voiceKeyboard(['E', 'G', 'C'], 'E', 64); // C/E
		expect(chromaOf(v[0])).toBe(Note.chroma('E'));
		expect(v[0]).toBeLessThan(v[1]);
	});
});

describe('voiceGuitar', () => {
	it('keeps the root in the bass and uses only chord tones', () => {
		const v = voiceGuitar(['C', 'E', 'G', 'B'], null); // Cmaj7
		expect(v.length).toBeGreaterThanOrEqual(4);
		expect(chromaOf(v[0])).toBe(Note.chroma('C')); // root in the bass
		const set = expectedChroma(['C', 'E', 'G', 'B']);
		expect(v.every((m) => set.has(chromaOf(m)))).toBe(true);
		expect(v.every((m) => m >= 40 && m <= 88)).toBe(true);
	});

	it('honours a slash bass', () => {
		const v = voiceGuitar(['E', 'G', 'C'], 'E'); // C/E
		expect(chromaOf(v[0])).toBe(Note.chroma('E'));
	});
});

describe('voiceSequence', () => {
	it('keeps keyboard voicings in a stable register (voice-leading)', () => {
		const seq = voiceSequence(['C', 'G', 'Am', 'F'], 'piano', 4);
		expect(seq.length).toBe(4);
		for (const v of seq) {
			expect(v.length).toBeGreaterThan(0);
			expect(v.every((m) => m >= 36 && m <= 88)).toBe(true);
		}
		// Centroids stay close — no big octave jumps between chords.
		const centroids = seq.map((v) => v.reduce((a, b) => a + b, 0) / v.length);
		for (let i = 1; i < centroids.length; i++) {
			expect(Math.abs(centroids[i] - centroids[i - 1])).toBeLessThan(8);
		}
	});

	it('returns [] for rests and unparseable symbols', () => {
		const seq = voiceSequence(['C', '', 'Xyz'], 'piano', 4);
		expect(seq[0].length).toBeGreaterThan(0);
		expect(seq[1]).toEqual([]);
		expect(seq[2]).toEqual([]);
	});

	it('uses the guitar voicer for the guitar instrument', () => {
		const seq = voiceSequence(['C'], 'guitar', 3);
		expect(chromaOf(seq[0][0])).toBe(Note.chroma('C'));
	});
});
