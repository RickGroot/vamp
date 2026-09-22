// Drill definition + run options -> concrete, spelled, in-range notes.
//
// PITCH DOMAIN — the one thing to get right here.
//
// The KEY PLAN is concert (sequence.ts), matching the repo rule that the store
// keeps concert pitch and playback sounds concert. The RESOLVED NOTES are
// written, and the instrument offset is applied exactly once, at the top, to the
// key root. Playback converts back with `concertMidi`.
//
// Resolving in written pitch is required, not a deviation:
//   - range is a written property (a trumpet's low F#3 is written F#3), so
//     choosing octaves in concert would let phrases drift out of range;
//   - spelling is a written property — the player reads written accidentals, and
//     deriving them from a concert root reintroduces the flats-only midi trap;
//   - `name` and `midi` must never disagree, or voicedToVexKey's letter-based
//     octave solve breaks. notationVoicing already works this way: it is fed
//     displayChord(chord, view.offset), i.e. written midi with a written name.
//
// A DrillRun is transient — the same category as the `detections` derived state,
// never persisted. Only the DEFINITION is stored, and it is key-agnostic and
// offset-free. ScalesSection sets the same precedent: concert root, written display.
//
// Pure: no `tone`, no stores, no DOM.

import { Chord, Interval, Note, Scale } from 'tonal';
import { beatsToQuarters, barBeats } from '$lib/model/time';
import { fitOctave } from './range';
import { readable } from './spelling';
import { buildRunPlan } from './sequence';
import type {
	DrillDefinition,
	DrillDirection,
	DrillNote,
	DrillPhrase,
	DrillRole,
	DrillRun,
	DrillRunOptions,
	DrillSource,
	RangeFailure
} from './types';

/** Octave the pool is built at before the range fitter moves the phrase. */
const NOMINAL_OCTAVE = 4;

const mod = (n: number, m: number): number => ((n % m) + m) % m;

/** Shift a spelled, octave-bearing name by whole octaves, keeping its letter. */
function addOctaves(name: string, octaves: number): string {
	const got = Note.get(name);
	if (got.empty) return name;
	return `${got.pc}${(got.oct ?? NOMINAL_OCTAVE) + octaves}`;
}

/** Interval name -> scale-degree label: '3m' -> 'b3', '4A' -> '#4', '5P' -> '5'. */
function degreeLabel(interval: string): string {
	const iv = Interval.get(interval);
	if (iv.empty) return '';
	const alt = iv.alt ?? 0;
	const accidental = alt < 0 ? 'b'.repeat(-alt) : alt > 0 ? '#'.repeat(alt) : '';
	return `${accidental}${iv.num}`;
}

function roleFor(label: string): DrillRole {
	const num = Number(label.replace(/[^0-9]/g, ''));
	if (num === 1) return 'root';
	if (num === 3) return 'third';
	if (num === 5) return 'fifth';
	if (num === 7) return 'seventh';
	return 'scale';
}

/**
 * The note pool for a source, as a step function over an unbounded integer index
 * (negative steps descend, indices past the pool wrap into the next octave).
 * Returns null when the source can't be resolved at all.
 */
function buildPool(
	source: DrillSource,
	writtenRoot: string
): { step: (i: number) => string; labels: string[]; size: number } | null {
	if (source.kind === 'scale') {
		const scale = Scale.get(`${writtenRoot} ${source.scaleType}`);
		if (!scale.notes.length) return null;
		// tonal's own step function: 0-indexed, sign-aware, octave-aware, and
		// correctly spelled in every key. This is why scale drills are nearly free.
		const steps = Scale.steps(`${writtenRoot}${NOMINAL_OCTAVE} ${source.scaleType}`);
		const labels = scale.intervals.map(degreeLabel);
		return { step: (i) => steps(i), labels, size: scale.notes.length };
	}

	const chord = Chord.get(`${writtenRoot}${source.quality}`);
	if (chord.empty || !chord.notes.length) return null;
	// Stack the chord tones ascending from the nominal octave, then repeat by
	// octaves — the arpeggio equivalent of a scale's steps().
	const stacked: string[] = [];
	let previous = -Infinity;
	for (const pc of chord.notes) {
		let octave = NOMINAL_OCTAVE;
		let midi = Note.midi(`${pc}${octave}`) ?? 60;
		while (midi <= previous) midi = Note.midi(`${pc}${++octave}`) ?? midi + 12;
		stacked.push(`${pc}${octave}`);
		previous = midi;
	}
	const size = stacked.length;
	const labels = chord.intervals.map(degreeLabel);
	return {
		step: (i) => addOctaves(stacked[mod(i, size)], Math.floor(i / size)),
		labels,
		size
	};
}

/** Cell start positions (in pool steps) for a direction. */
function anchors(direction: DrillDirection, cells: number, step: number): number[] {
	const up = Array.from({ length: cells }, (_, i) => i * step);
	const down = Array.from({ length: cells }, (_, i) => (cells - 1 - i) * step);
	switch (direction) {
		case 'down':
			return down;
		case 'updown':
			return [...up, ...down];
		case 'downup':
			return [...down, ...up];
		default:
			return up;
	}
}

/** WRITTEN midi -> CONCERT midi for playback. The single offset seam. */
export const concertMidi = (written: number, offset: number): number => written - offset;

/**
 * Resolve a drill into the exact notes to read and play. Deterministic given
 * `options.rand`, so a whole run is reproducible in tests.
 */
export function resolveDrill(definition: DrillDefinition, options: DrillRunOptions): DrillRun {
	const ts = definition.timeSignature;
	const direction = options.direction ?? definition.direction;
	const cells = Math.max(1, Math.floor(definition.cellsPerKey));
	const rhythm = definition.pattern.rhythm.length ? definition.pattern.rhythm : [1];
	const restQuarters = Math.max(0, options.restBars) * beatsToQuarters(barBeats(ts), ts);

	const plan = buildRunPlan({
		root: options.root,
		keyMode: options.keyMode,
		reps: options.reps,
		tempo: options.tempo,
		tempoStep: options.tempoStep,
		tempoMax: options.tempoMax,
		rand: options.rand
	});

	const notes: DrillNote[] = [];
	const phrases: DrillPhrase[] = [];
	const skipped: { concertRoot: string; reason: RangeFailure }[] = [];
	let cursor = 0;
	let rep = 0;

	for (let i = 0; i < plan.roots.length; i++) {
		const concertRoot = plan.roots[i];
		// The offset is applied HERE and nowhere else.
		const writtenRoot = options.offset
			? Note.simplify(Note.transpose(concertRoot, Interval.fromSemitones(options.offset)))
			: concertRoot;

		const pool = buildPool(definition.source, writtenRoot);
		if (!pool) {
			skipped.push({ concertRoot, reason: 'unresolvable' });
			continue;
		}

		// Spell first, derive MIDI from the spelling — never the reverse.
		const spelled: { name: string; label: string }[] = [];
		for (const anchor of anchors(direction, cells, definition.pattern.step)) {
			for (const cellOffset of definition.pattern.cell) {
				const index = anchor + cellOffset;
				spelled.push({
					name: readable(pool.step(index)),
					label: pool.labels[mod(index, pool.size)] ?? ''
				});
			}
		}
		const rawMidis = spelled.map((s) => Note.midi(s.name) ?? 60);

		const fitted = fitOctave(rawMidis, options.range, options.register);
		if (!fitted.fit) {
			skipped.push({ concertRoot, reason: fitted.reason });
			continue;
		}

		const startQuarters = cursor;
		spelled.forEach((entry, n) => {
			const durQuarters = beatsToQuarters(rhythm[n % rhythm.length], ts);
			notes.push({
				midi: fitted.midis[n],
				// Pitch class only, matching VoicedNote — the octave lives in `midi`.
				name: Note.get(entry.name).pc,
				atQuarters: cursor,
				durQuarters,
				label: entry.label,
				role: roleFor(entry.label),
				rep
			});
			cursor += durQuarters;
		});

		// Rest between repetitions — brass players need real rest, and it still
		// emits an event so the count and highlight keep advancing.
		if (restQuarters > 0 && i < plan.roots.length - 1) {
			notes.push({
				midi: null,
				name: '',
				atQuarters: cursor,
				durQuarters: restQuarters,
				label: '',
				role: 'rest',
				rep
			});
			cursor += restQuarters;
		}

		phrases.push({
			rep,
			concertRoot,
			writtenRoot,
			tempo: plan.tempos[i],
			startQuarters,
			lengthQuarters: cursor - startQuarters
		});
		rep++;
	}

	return {
		definition,
		options,
		notes,
		phrases,
		totalQuarters: cursor,
		skipped
	};
}
