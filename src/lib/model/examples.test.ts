import { describe, it, expect } from 'vitest';
import { EXAMPLES, buildExample } from './examples';
import { isValidChordSymbol } from '$lib/audio/chord';
import { barBeats, filledBeats } from './time';

describe('example songs', () => {
	it('every example builds a valid, named progression', () => {
		for (const example of EXAMPLES) {
			const prog = buildExample(example);
			expect(prog.name).toBe(example.title);
			expect(prog.tempo).toBe(example.tempo);
			expect(prog.bars.length).toBe(example.bars.length);
			expect(prog.id).toBeTruthy();
		}
	});

	it('every chord in every example is a valid symbol', () => {
		for (const example of EXAMPLES) {
			for (const bar of buildExample(example).bars) {
				for (const slot of bar.slots) {
					expect(isValidChordSymbol(slot.chord), `${example.id}: ${slot.chord}`).toBe(true);
				}
			}
		}
	});

	it('each bar is filled to the time signature', () => {
		for (const example of EXAMPLES) {
			const prog = buildExample(example);
			const expected = barBeats(prog.timeSignature);
			for (const bar of prog.bars) {
				expect(filledBeats(bar)).toBeCloseTo(expected);
			}
		}
	});

	it('split bars produce multiple slots', () => {
		const swingLow = buildExample(EXAMPLES.find((e) => e.id === 'swing-low')!);
		const splitBar = swingLow.bars.find((b) => b.slots.length > 1);
		expect(splitBar).toBeDefined();
	});
});
