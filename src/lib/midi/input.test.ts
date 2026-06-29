import { describe, it, expect } from 'vitest';
import { Chord } from 'tonal';
import { detectChordSymbol } from './input';

/** Parse the detected symbol back with tonal to assert root + quality robustly. */
const parse = (sym: string) => Chord.get(sym);

describe('detectChordSymbol', () => {
	it('C major triad (C E G)', () => {
		const sym = detectChordSymbol([60, 64, 67]);
		expect(sym).toBeTruthy();
		const c = parse(sym!);
		expect(c.tonic).toBe('C');
		expect(c.quality).toBe('Major');
	});

	it('D minor triad (D F A)', () => {
		const sym = detectChordSymbol([62, 65, 69]);
		const c = parse(sym!);
		expect(c.tonic).toBe('D');
		expect(c.quality).toBe('Minor');
	});

	it('G dominant 7 (G B D F)', () => {
		const sym = detectChordSymbol([55, 59, 62, 65]);
		const c = parse(sym!);
		expect(c.tonic).toBe('G');
		expect(c.aliases).toContain('7');
	});

	it('ignores fewer than two notes', () => {
		expect(detectChordSymbol([60])).toBeNull();
		expect(detectChordSymbol([])).toBeNull();
	});

	it('is octave/duplicate insensitive', () => {
		const sym = detectChordSymbol([67, 60, 64, 72]); // C E G + high C
		expect(parse(sym!).tonic).toBe('C');
	});
});
