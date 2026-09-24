// Guide-tone lines: one note per chord, voice-led by nearest motion.
//
// The 3rd and 7th are what actually spell a chord's quality, so a line that
// walks them through a set of changes is the fastest way to hear the harmony
// while playing a single note at a time. Nearest-note motion is not a
// simplification here — it is what produces the textbook result:
//
//   Dm7 -> G7 -> Cmaj7 starting on the 3rd  =  F4 F4 E4   (3-7-3)
//   ...the F is a common tone (3rd of Dm7 IS the 7th of G7), and the 7th of G7
//   falls a semitone to the 3rd of Cmaj7. No special-casing produces that; plain
//   nearest-note does, and the tie-breaks never even fire.
//
// Pure: no `tone`, no stores, no DOM.

import { Chord, Note } from 'tonal';
import { parseChord } from '$lib/audio/chord';
import { beatsToQuarters } from '$lib/model/time';
import { readable } from './spelling';
import { foldIntoRange } from './range';
import type { DrillChord, DrillNote, DrillRole, GuideLine, WrittenRange } from './types';
import type { TimeSignature } from '$lib/model/types';

interface Candidate {
	name: string;
	role: DrillRole;
	label: string;
	chroma: number;
}

const mod = (n: number, m: number): number => ((n % m) + m) % m;

/**
 * The octave of a pitch class nearest a target MIDI note. Unbounded (the range
 * fitter moves the whole phrase afterwards), which is the only difference from
 * `nearestMidi` in audio/voicing.ts.
 */
function nearestOctave(chroma: number, target: number): number {
	const below = target - mod(target - chroma, 12);
	return Math.abs(below + 12 - target) < Math.abs(below - target) ? below + 12 : below;
}

/** Which chord tones a line is allowed to use, best-first. */
function candidatesFor(written: string, line: GuideLine): Candidate[] {
	const chord = Chord.get(written);
	if (chord.empty || !chord.notes.length) return [];
	const notes = chord.notes;
	const pick = (index: number, role: DrillRole, label: string): Candidate | null => {
		const name = notes[index];
		if (!name) return null;
		const chroma = Note.chroma(name);
		return chroma === undefined ? null : { name, role, label, chroma };
	};

	const third = pick(1, 'third', '3');
	// A triad has no 7th — fall back to the 5th rather than emitting nothing, so
	// the line keeps moving through a chart that mixes triads and sevenths.
	const seventh = pick(3, 'seventh', '7') ?? pick(2, 'fifth', '5');
	const root = pick(0, 'root', '1');

	switch (line) {
		case 'thirds':
			return [third].filter((c): c is Candidate => c !== null);
		case 'sevenths':
			return [seventh].filter((c): c is Candidate => c !== null);
		case 'roots':
			return [root].filter((c): c is Candidate => c !== null);
		default:
			return [third, seventh].filter((c): c is Candidate => c !== null);
	}
}

export interface GuideToneOptions {
	/** Changes in WRITTEN pitch, already transposed for the instrument and key. */
	chords: DrillChord[];
	line: GuideLine;
	timeSignature: TimeSignature;
	/** Where in the register to seed the first note (a MIDI number). */
	target: number;
	/** Quarter-note position the phrase starts at. */
	startQuarters: number;
	rep: number;
	/**
	 * Written range to keep the line inside, folding by an octave whenever the
	 * next nearest note would leave it. Omit for an unbounded line.
	 *
	 * Without it, a real-length tune fails outright: each step is small, but a
	 * line that keeps falling a semitone every other chord — which is exactly what
	 * guide tones do through a cycle of fifths — drifts past a trumpet's whole
	 * range within 64 changes, and the phrase is rejected in every key.
	 */
	range?: WrittenRange;
}

/**
 * Trace the line through the changes. Returns notes whose `midi` is nominal —
 * the caller still fits the whole phrase into the playable range by octaves.
 */
export function guideToneLine(opts: GuideToneOptions): DrillNote[] {
	const out: DrillNote[] = [];
	let at = opts.startQuarters;
	let previous: number | null = null;
	let previousRole: DrillRole | null = null;

	for (const chord of opts.chords) {
		const durQuarters = beatsToQuarters(chord.beats, opts.timeSignature);
		const parsed = parseChord(chord.symbol);
		const candidates = parsed.isRest ? [] : candidatesFor(chord.symbol, opts.line);

		if (candidates.length === 0) {
			// A rest, or a chord tonal can't read. Either way the line pauses — and
			// `previous` is deliberately NOT reset, so the next note still voice-leads
			// from where the line actually was, across the gap.
			out.push({
				midi: null,
				name: '',
				atQuarters: at,
				durQuarters,
				label: '',
				role: 'rest',
				rep: opts.rep,
				chord: chord.symbol
			});
			at += durQuarters;
			continue;
		}

		interface Choice {
			candidate: Candidate;
			midi: number;
			distance: number;
		}
		let best: Choice | null = null;
		for (const candidate of candidates) {
			const midi: number =
				previous === null
					? nearestOctave(candidate.chroma, opts.target)
					: nearestOctave(candidate.chroma, previous);
			// On the FIRST chord there is no previous note, so the register seed is
			// what decides which guide tone the line starts on — measuring against it
			// (rather than scoring every candidate 0) is what makes a low seed give
			// the 7-3-7 shape and a mid seed the 3-7-3 one.
			const distance: number =
				previous === null ? Math.abs(midi - opts.target) : Math.abs(midi - previous);
			if (!best) {
				best = { candidate, midi, distance };
				continue;
			}
			if (distance < best.distance) {
				best = { candidate, midi, distance };
			} else if (distance === best.distance) {
				// Equal leaps: prefer changing role (3rd -> 7th -> 3rd is the line you
				// want to hear), then prefer falling — the classic shape descends.
				const alternates = candidate.role !== previousRole && best.candidate.role === previousRole;
				const falls = previous !== null && midi < best.midi;
				if (alternates || (candidate.role !== previousRole && falls)) {
					best = { candidate, midi, distance };
				}
			}
		}
		if (!best) continue;

		// Fold, don't skip. A whole-octave move keeps the spelling and midi in step
		// (the range.ts invariant) and is what a horn player does when the line runs
		// out of room: jump the octave and carry on. The line then continues from
		// where it actually is, so the next step is voice-led from the folded note.
		if (opts.range) best.midi = foldIntoRange(best.midi, opts.range);

		out.push({
			midi: best.midi,
			name: Note.get(readable(best.candidate.name)).pc,
			atQuarters: at,
			durQuarters,
			label: best.candidate.label,
			role: best.candidate.role,
			rep: opts.rep,
			chord: chord.symbol
		});
		previous = best.midi;
		previousRole = best.candidate.role;
		at += durQuarters;
	}

	return out;
}
