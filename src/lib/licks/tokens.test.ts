import { describe, it, expect } from 'vitest';
import { Note } from 'tonal';
import { isRestToken, isValidToken, parseToken, tokenLabel, tokenRole, tokenToNote } from './tokens';

describe('parseToken', () => {
	it('reads degree, accidental and octave', () => {
		expect(parseToken('1')).toEqual({ alter: 0, degree: 1, octave: 0 });
		expect(parseToken('_5')).toEqual({ alter: 0, degree: 5, octave: -1 });
		expect(parseToken('b9')).toEqual({ alter: -1, degree: 2, octave: 1 });
		expect(parseToken('#11')).toEqual({ alter: 1, degree: 4, octave: 1 });
		expect(parseToken('14')).toEqual({ alter: 0, degree: 7, octave: 1 });
		expect(parseToken(' b3 ')).toEqual({ alter: -1, degree: 3, octave: 0 });
	});

	it('refuses what is not a note', () => {
		for (const bad of ['b1', 'b8', '_8', '_0', '0', '15', 'x', '', 'r', '##4', 'bb3', '3b', '_b3']) {
			expect(parseToken(bad), bad).toBeNull();
		}
	});

	it('knows a rest', () => {
		expect(isRestToken('r')).toBe(true);
		expect(isRestToken(' r ')).toBe(true);
		expect(isRestToken('R')).toBe(false);
		expect(isValidToken('r')).toBe(true);
		expect(isValidToken('b5')).toBe(true);
		expect(isValidToken('x')).toBe(false);
	});
});

describe('tokenToNote — the token decides the spelling', () => {
	it('spells from the tonic, an octave either side', () => {
		expect(tokenToNote('1', 'C')).toBe('C4');
		expect(tokenToNote('_5', 'C')).toBe('G3');
		expect(tokenToNote('8', 'C')).toBe('C5');
		expect(tokenToNote('b9', 'C')).toBe('Db5');
		expect(tokenToNote('#9', 'C')).toBe('D#5');
		expect(tokenToNote('b13', 'C')).toBe('Ab5');
	});

	// Pinned: these are the spellings a blanket Note.simplify would destroy.
	it('keeps the spelling the degree names', () => {
		expect(tokenToNote('b5', 'C')).toBe('Gb4');
		expect(tokenToNote('#4', 'C')).toBe('F#4');
		expect(tokenToNote('#4', 'Eb')).toBe('A4');
		expect(tokenToNote('4', 'Gb')).toBe('Cb5');
		expect(tokenToNote('b3', 'E')).toBe('G4');
		expect(tokenToNote('7', 'F#')).toBe('E#5');
		expect(tokenToNote('b7', 'Gb')).toBe('Fb5');
	});

	it('collapses double accidentals only', () => {
		// B + augmented fifth = F##, read as G.
		expect(tokenToNote('#5', 'B')).toBe('G5');
		// Db + diminished fifth = Abb, read as G.
		expect(tokenToNote('b5', 'Db')).toBe('G4');
	});

	it('names a pitch whose MIDI matches its spelling', () => {
		for (const tonic of ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']) {
			const root = Note.midi(`${tonic}4`)!;
			expect(Note.midi(tokenToNote('1', tonic)!)).toBe(root);
			expect(Note.midi(tokenToNote('b3', tonic)!)).toBe(root + 3);
			expect(Note.midi(tokenToNote('#4', tonic)!)).toBe(root + 6);
			expect(Note.midi(tokenToNote('_5', tonic)!)).toBe(root - 5);
			expect(Note.midi(tokenToNote('b9', tonic)!)).toBe(root + 13);
			expect(Note.midi(tokenToNote('13', tonic)!)).toBe(root + 21);
		}
	});

	it('gives null for a rest or garbage', () => {
		expect(tokenToNote('r', 'C')).toBeNull();
		expect(tokenToNote('x', 'C')).toBeNull();
		expect(tokenToNote('1', 'H')).toBeNull();
	});
});

describe('tokenLabel and tokenRole', () => {
	it('drops octave marks but keeps the tension names', () => {
		const labels: [string, string][] = [
			['1', '1'],
			['_5', '5'],
			['_b7', ''], // not a token: the accidental comes first
			['b7', 'b7'],
			['8', '1'],
			['10', '3'],
			['12', '5'],
			['14', '7'],
			['9', '9'],
			['b9', 'b9'],
			['#9', '#9'],
			['#11', '#11'],
			['13', '13'],
			['b13', 'b13'],
			['b3', 'b3'],
			['r', '']
		];
		for (const [token, label] of labels) expect(tokenLabel(token), token).toBe(label);
		expect(tokenLabel('b_7')).toBe('b7');
	});

	it('marks the chord tones of the key', () => {
		expect(['1', '_3', 'b3', '5', 'b7', '2', '#11', 'r'].map(tokenRole)).toEqual([
			'root',
			'third',
			'third',
			'fifth',
			'seventh',
			'scale',
			'scale',
			'rest'
		]);
	});
});
