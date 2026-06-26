import { describe, it, expect } from 'vitest';
import { inferKey, romanNumeral, diatonicChords } from './key';

describe('inferKey', () => {
	it('detects C major from a I–vi–IV–V', () => {
		expect(inferKey(['C', 'Am', 'F', 'G'])).toEqual({ tonic: 'C', mode: 'major' });
	});

	it('detects A minor', () => {
		expect(inferKey(['Am', 'Dm', 'E', 'Am'])).toEqual({ tonic: 'A', mode: 'minor' });
	});

	it('detects G major from a ii–V–I', () => {
		expect(inferKey(['Am7', 'D7', 'Gmaj7'])).toEqual({ tonic: 'G', mode: 'major' });
	});

	it('falls back to C major for empty input', () => {
		expect(inferKey([])).toEqual({ tonic: 'C', mode: 'major' });
	});
});

describe('romanNumeral', () => {
	const C = { tonic: 'C', mode: 'major' } as const;
	it('maps degrees with the right case', () => {
		expect(romanNumeral('C', C)).toBe('I');
		expect(romanNumeral('Dm', C)).toBe('ii');
		expect(romanNumeral('Em', C)).toBe('iii');
		expect(romanNumeral('F', C)).toBe('IV');
		expect(romanNumeral('G7', C)).toBe('V');
		expect(romanNumeral('Am', C)).toBe('vi');
		expect(romanNumeral('Bdim', C)).toBe('vii°');
	});
	it('marks borrowed / chromatic chords with accidentals', () => {
		expect(romanNumeral('Bb', C)).toBe('bVII');
	});
});

describe('diatonicChords', () => {
	it('lists the C major triads', () => {
		const syms = diatonicChords({ tonic: 'C', mode: 'major' }).map((d) => d.symbol);
		expect(syms).toEqual(['C', 'Dm', 'Em', 'F', 'G', 'Am', 'Bdim']);
	});
	it('lists the A minor triads', () => {
		const syms = diatonicChords({ tonic: 'A', mode: 'minor' }).map((d) => d.symbol);
		expect(syms).toEqual(['Am', 'Bdim', 'C', 'Dm', 'Em', 'F', 'G']);
	});
});
