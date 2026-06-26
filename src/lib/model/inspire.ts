// Generate a random, musical-ish diatonic major progression — for the
// "Inspire me" button. Starts on I, ends on V or I, draws from common
// diatonic chords (vii° omitted for niceness).

import { Interval, Note } from 'tonal';
import { isValidChordSymbol } from '$lib/audio/chord';

const ROOTS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

interface Degree {
	semitones: number;
	quality: string;
}

const DIATONIC: Degree[] = [
	{ semitones: 0, quality: '' }, // I
	{ semitones: 2, quality: 'm' }, // ii
	{ semitones: 4, quality: 'm' }, // iii
	{ semitones: 5, quality: '' }, // IV
	{ semitones: 7, quality: '' }, // V
	{ semitones: 9, quality: 'm' } // vi
];

function chordFor(root: string, degree: Degree): string {
	const note = Note.simplify(Note.transpose(root, Interval.fromSemitones(degree.semitones)));
	const symbol = `${note}${degree.quality}`;
	return isValidChordSymbol(symbol) ? symbol : note;
}

/** A random diatonic progression. `rand` is injectable for testing. */
export function randomProgression(rand: () => number = Math.random): { root: string; chords: string[] } {
	const root = ROOTS[Math.floor(rand() * ROOTS.length)];
	const length = rand() < 0.5 ? 4 : 8;
	const chords: string[] = [];

	for (let i = 0; i < length; i++) {
		let degree: Degree;
		if (i === 0) degree = DIATONIC[0]; // start on I
		else if (i === length - 1) degree = rand() < 0.6 ? DIATONIC[4] : DIATONIC[0]; // end V or I
		else degree = DIATONIC[Math.floor(rand() * DIATONIC.length)];
		chords.push(chordFor(root, degree));
	}
	return { root, chords };
}
