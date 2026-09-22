// The key and tempo plan for a run, computed up front.
//
// Sketch's drills step the key and tempo incrementally at each loop boundary.
// Practice precomputes the whole sequence instead, so the runner can show
// "key 3 of 12, next Eb at 132" before a note sounds, and so a seeded rand makes
// a whole run reproducible in tests.
//
// The stepping rules themselves are reused unchanged from audio/drills.ts.

import { Interval, Note } from 'tonal';
import { keyCycleInterval, nextStepTempo, type KeyCycleMode } from '$lib/audio/drills';
import { TEMPO_MAX, TEMPO_MIN } from '$lib/model/factory';

export interface RunPlan {
	/** CONCERT root per repetition, in order. */
	roots: string[];
	/** BPM per repetition, same length as `roots`. */
	tempos: number[];
}

export interface RunPlanOptions {
	/** Starting root, CONCERT. */
	root: string;
	keyMode: KeyCycleMode;
	reps: number;
	tempo: number;
	/** BPM added per repetition (0 = off). */
	tempoStep: number;
	tempoMax: number;
	rand?: () => number;
}

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

export function buildRunPlan(opts: RunPlanOptions): RunPlan {
	const rand = opts.rand ?? Math.random;
	const roots: string[] = [];
	const tempos: number[] = [];

	let root = opts.root;
	let tempo = clamp(Math.round(opts.tempo), TEMPO_MIN, TEMPO_MAX);
	// Bounds live only in model/factory — never redeclared here.
	const ceiling = clamp(Math.round(opts.tempoMax), TEMPO_MIN, TEMPO_MAX);
	const reps = Math.max(1, Math.floor(opts.reps));

	for (let i = 0; i < reps; i++) {
		if (i > 0) {
			const semis = keyCycleInterval(opts.keyMode, rand);
			if (semis !== 0) {
				// simplify IS right here: this is a symbol-grade root, and it matches
				// transposeChordSymbol, keeping the app's flat-spelled roots.
				root = Note.simplify(Note.transpose(root, Interval.fromSemitones(semis)));
			}
			if (opts.tempoStep > 0) tempo = nextStepTempo(tempo, opts.tempoStep, ceiling);
		}
		roots.push(root);
		tempos.push(tempo);
	}
	return { roots, tempos };
}

/** Repetitions needed to walk all twelve keys (any non-zero cycle mode does). */
export const ALL_KEYS = 12;
