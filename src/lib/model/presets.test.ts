import { describe, it, expect } from 'vitest';
import { PRESETS, buildPresetChords } from './presets';
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
