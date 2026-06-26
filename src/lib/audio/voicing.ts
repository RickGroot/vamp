// Chord voicing for playback.
//
// Two strategies:
//  - Keyboard (piano / rhodes / pad): voice-leading. Each chord tone is placed in
//    the octave nearest the previous chord's register, so a progression moves
//    smoothly instead of every chord re-stacking from a fixed octave.
//  - Guitar: a simple fretboard voicing in standard tuning, bass note on the
//    lowest string. This is a pragmatic voicer (one chord tone per reachable
//    string), not a full playability-aware solver — flagged as a PoC shortcut.

import { Note } from 'tonal';
import type { InstrumentId } from '$lib/model/types';
import { parseChord } from './chord';

const MIDI_MIN = 36; // C2
const MIDI_MAX = 88; // E6

/** Nearest MIDI note with the given pitch class (chroma 0-11) to a target. */
export function nearestMidi(chroma: number, target: number): number {
	// Largest m <= target with m % 12 === chroma, then pick the closer of m / m+12.
	let m = target - (((target - chroma) % 12) + 12) % 12;
	if (Math.abs(m + 12 - target) < Math.abs(m - target)) m += 12;
	return Math.max(MIDI_MIN, Math.min(MIDI_MAX, m));
}

const centroid = (midi: number[]): number =>
	midi.length ? Math.round(midi.reduce((a, b) => a + b, 0) / midi.length) : 60;

/**
 * Voice a set of pitch classes near `target`, avoiding duplicate exact notes.
 * A slash-chord bass is added an octave below the lowest voiced note.
 */
export function voiceKeyboard(pcs: string[], bass: string | null, target: number): number[] {
	const used = new Set<number>();
	const voiced: number[] = [];
	for (const pc of pcs) {
		const chroma = Note.chroma(pc);
		if (chroma === undefined) continue;
		let m = nearestMidi(chroma, target);
		while (used.has(m)) m += 12;
		used.add(m);
		voiced.push(m);
	}
	voiced.sort((a, b) => a - b);

	if (bass) {
		const bassChroma = Note.chroma(bass);
		if (bassChroma !== undefined && voiced.length) {
			const bassMidi = nearestMidi(bassChroma, voiced[0] - 7);
			if (bassMidi < voiced[0]) voiced.unshift(bassMidi);
		}
	}
	return voiced;
}

/** Standard guitar tuning, low to high: E2 A2 D3 G3 B3 E4. */
const GUITAR_TUNING = [40, 45, 50, 55, 59, 64];
const GUITAR_MAX_FRET = 7;

/**
 * Map a chord to a low-position guitar voicing: the bass/root is placed on a low
 * string, then chord tones are picked on the higher strings within a fret window,
 * preferring tones not yet sounding so the root/3rd/7th get covered.
 *
 * Pragmatic, not a playability-aware solver (no finger-stretch/muting model) —
 * flagged as a PoC shortcut.
 */
export function voiceGuitar(pcs: string[], bass: string | null): number[] {
	const chordChromas = new Set<number>();
	for (const pc of pcs) {
		const c = Note.chroma(pc);
		if (c !== undefined) chordChromas.add(c);
	}
	if (chordChromas.size === 0) return [];

	// pcs are inversion-ordered, so pcs[0] is the bass for slash chords / root otherwise.
	const bassChroma = (bass ? Note.chroma(bass) : Note.chroma(pcs[0])) ?? [...chordChromas][0];

	// 1) Bass on the lowest reachable string (E/A/D), preferring the bass chroma.
	const findOnLowStrings = (
		wanted: (chroma: number) => boolean
	): { midi: number; string: number; fret: number } | null => {
		for (let s = 0; s < 3; s++) {
			for (let fret = 0; fret <= GUITAR_MAX_FRET; fret++) {
				if (wanted((GUITAR_TUNING[s] + fret) % 12)) {
					return { midi: GUITAR_TUNING[s] + fret, string: s, fret };
				}
			}
		}
		return null;
	};
	const found =
		findOnLowStrings((c) => c === bassChroma) ?? findOnLowStrings((c) => chordChromas.has(c));
	if (!found) return [];
	const { midi: bassMidi, string: bassString, fret: position } = found;

	// 2) Higher strings within a window around the bass position, preferring
	//    chord tones not yet covered.
	const result: number[] = [bassMidi];
	const covered = new Set<number>([bassMidi % 12]);
	const lo = Math.max(0, position - 1);
	const hi = position + 3;
	for (let s = bassString + 1; s < GUITAR_TUNING.length; s++) {
		const open = GUITAR_TUNING[s];
		let anyTone: number | null = null;
		let uncoveredTone: number | null = null;
		for (let fret = lo; fret <= hi; fret++) {
			const chroma = (open + fret) % 12;
			if (!chordChromas.has(chroma)) continue;
			if (anyTone === null) anyTone = open + fret;
			if (!covered.has(chroma)) {
				uncoveredTone = open + fret;
				break;
			}
		}
		const pick = uncoveredTone ?? anyTone;
		if (pick !== null) {
			result.push(pick);
			covered.add(pick % 12);
		}
	}
	return result.sort((a, b) => a - b);
}

/** First-chord register target for keyboard voicing (mid of the base octave). */
function firstTarget(baseOctave: number): number {
	return (baseOctave + 1) * 12 + 4; // e.g. baseOctave 4 -> 64 (E4)
}

/**
 * Voice a sequence of chord symbols in order. Keyboard instruments thread the
 * previous voicing's register for smooth voice-leading; guitar voices each chord
 * independently on the fretboard. Rests / unparseable symbols yield [].
 */
export function voiceSequence(
	symbols: string[],
	instrument: InstrumentId,
	baseOctave: number
): number[][] {
	let target = firstTarget(baseOctave);
	return symbols.map((symbol) => {
		const chord = parseChord(symbol);
		if (chord.empty) return [];
		if (instrument === 'guitar') return voiceGuitar(chord.notes, chord.bass);
		const voiced = voiceKeyboard(chord.notes, chord.bass, target);
		if (voiced.length) target = centroid(voiced);
		return voiced;
	});
}
