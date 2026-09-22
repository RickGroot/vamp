import { describe, it, expect } from 'vitest';
import { Note, Scale } from 'tonal';
import { readable, approachNote } from './spelling';
import { SCALE_ROOTS, SCALE_TYPES } from '$lib/model/scales';

const altOf = (name: string) => Math.abs(Note.get(name).alt ?? 0);

describe('readable', () => {
	it('collapses double accidentals', () => {
		expect(readable('Ebb4')).toBe('D4');
		expect(readable('Bbb4')).toBe('A4');
		expect(readable('F##4')).toBe('G4');
		// simplify, not enharmonic — the accidental direction is preserved.
		expect(readable('Fbb4')).toBe('Eb4');
	});

	// These two are the anti-regression pair. They fail the moment someone
	// "fixes" readable into a blanket Note.simplify, which would turn the Cb of
	// Gb major into B and the E# of F# major into F.
	it('leaves single accidentals alone', () => {
		expect(readable('Cb5')).toBe('Cb5');
		expect(readable('E#4')).toBe('E#4');
		expect(readable('Fb4')).toBe('Fb4');
		expect(readable('B#3')).toBe('B#3');
		expect(readable('F#4')).toBe('F#4');
		expect(readable('Bb4')).toBe('Bb4');
	});

	it('keeps the correct spelling of remote keys', () => {
		// Gb major genuinely contains a Cb; F# major genuinely contains an E#.
		expect(Scale.get('Gb major').notes.map(readable)).toContain('Cb');
		expect(Scale.get('F# major').notes.map(readable)).toContain('E#');
	});

	// The whole Ab-blues / Gb-pentatonic / diminished class, in one loop.
	it('leaves no double accidental in any root x scale type', () => {
		const offenders: string[] = [];
		for (const root of SCALE_ROOTS) {
			for (const type of SCALE_TYPES) {
				const bad = Scale.get(`${root} ${type.id}`).notes.map(readable).filter((n) => altOf(n) >= 2);
				if (bad.length) offenders.push(`${root} ${type.id}: ${bad.join(',')}`);
			}
		}
		expect(offenders).toEqual([]);
	});

	it('gives the spelling a fake book prints for flat blues keys', () => {
		// The b5 written as a natural, and the root spelling left alone —
		// "Eb blues", never "D# blues".
		expect(Scale.get('Eb blues').notes.map(readable)).toEqual(['Eb', 'Gb', 'Ab', 'A', 'Bb', 'Db']);
		expect(Scale.get('Ab blues').notes.map(readable)).toEqual(['Ab', 'Cb', 'Db', 'D', 'Eb', 'Gb']);
	});
});

describe('approachNote', () => {
	it('spells the lower neighbour as a leading tone', () => {
		expect(approachNote('E', 'below')).toBe('D#');
		expect(approachNote('F', 'below')).toBe('E');
		expect(approachNote('C', 'below')).toBe('B');
	});

	it('spells the upper neighbour upward', () => {
		expect(approachNote('D', 'above')).toBe('Eb');
		expect(approachNote('B', 'above')).toBe('C');
	});

	it('lands exactly a semitone away, so spelling and pitch agree', () => {
		for (const target of ['C4', 'E4', 'Gb4', 'A#4', 'B4']) {
			const below = approachNote(target, 'below');
			const above = approachNote(target, 'above');
			expect(Note.midi(below)).toBe((Note.midi(target) ?? 0) - 1);
			expect(Note.midi(above)).toBe((Note.midi(target) ?? 0) + 1);
		}
	});
});
