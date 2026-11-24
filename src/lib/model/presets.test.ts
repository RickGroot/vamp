import { describe, it, expect } from 'vitest';
import { PRESETS, buildPresetChord, buildPresetChords } from './presets';
import { isValidChordSymbol } from '$lib/audio/chord';

const preset = (id: string) => PRESETS.find((p) => p.id === id)!;

describe('buildPresetChords', () => {
	it('builds the pop progression in C', () => {
		expect(buildPresetChords('C', preset('pop'))).toEqual(['C', 'G', 'Am', 'F']);
	});

	it('builds the jazz ii–V–I in C', () => {
		expect(buildPresetChords('C', preset('jazz-251'))).toEqual(['Dm7', 'G7', 'Cmaj7']);
	});

	it('builds a 12-bar blues with the right length and dominants', () => {
		const blues = buildPresetChords('C', preset('blues12'));
		expect(blues).toHaveLength(12);
		expect(blues[0]).toBe('C7');
		expect(blues[4]).toBe('F7');
		expect(blues[8]).toBe('G7');
	});

	it('respects the chosen root', () => {
		expect(buildPresetChords('G', preset('pop'))).toEqual(['G', 'D', 'Em', 'C']);
	});

	it('every preset produces only valid chord symbols in every root', () => {
		for (const p of PRESETS) {
			for (const root of ['C', 'F#', 'Bb', 'A']) {
				for (const chord of buildPresetChords(root, p)) {
					expect(isValidChordSymbol(chord), `${p.id} in ${root}: ${chord}`).toBe(true);
				}
			}
		}
	});
});

describe('buildPresetChord with a bass', () => {
	it('writes a slash chord when the bass differs from the root', () => {
		expect(buildPresetChord('C', { semitones: 5, quality: '', bass: 0 })).toBe('F/C');
		expect(buildPresetChord('G', { semitones: 5, quality: 'm', bass: 0 })).toBe('Cm/G');
		expect(buildPresetChord('Bb', { semitones: 7, quality: '7', bass: 0 })).toBe('F7/Bb');
	});

	it('writes the plain chord when the bass is the root, in any octave, or absent', () => {
		expect(buildPresetChord('C', { semitones: 5, quality: '', bass: 5 })).toBe('F');
		expect(buildPresetChord('C', { semitones: 5, quality: '', bass: 17 })).toBe('F');
		expect(buildPresetChord('C', { semitones: 5, quality: '' })).toBe('F');
	});

	it('every slash chord it makes is valid, in every root', () => {
		for (const root of ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']) {
			for (const bass of [0, 7]) {
				for (const semitones of [0, 2, 5, 7, 10]) {
					expect(isValidChordSymbol(buildPresetChord(root, { semitones, quality: '', bass })), `${root} ${semitones}/${bass}`).toBe(true);
				}
			}
		}
	});
});
