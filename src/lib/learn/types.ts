// Learn's own types. A separate namespace, like practice/types.ts: nothing here
// touches the song schema, and everything in this file is TRANSIENT — a run is
// rebuilt from its definition every time, never persisted.
//
// The content model (tracks, lessons, quiz items, progress) joins this file in
// the phases that use it; Phase 0 only needs playback.

import type { PlaybackPlan } from '$lib/audio/plan';

/**
 * What a stretch of a Learn plan is for. A cadence `prefix` and a silent `gap`
 * set the key before a `question`; a lesson plays a `listen`; the reharm lab
 * plays `a` / `b`.
 */
export type SectionRole = 'prefix' | 'gap' | 'question' | 'listen' | 'a' | 'b';

/** One chord in a section: a CONCERT symbol ('' = rest) held for `beats`. */
export interface PlanChord {
	symbol: string;
	beats: number;
}

export interface LearnSection {
	role: SectionRole;
	chords: PlanChord[];
	/** Times to play the section back to back (default 1). Unrolled into the plan. */
	passes?: number;
}

/**
 * What a cue index points at. `chord` is the section's chord index, or null for
 * a rest the packer added to fill a bar; `pass` counts from 0.
 */
export interface LearnCue {
	section: number;
	chord: number | null;
	pass: number;
}

/**
 * A ready-to-play Learn passage. The engine fires `cueIndex` = an index into
 * `cues`, so a component looks the sounding chord up — no index arithmetic, the
 * same way a drill's cue indexes `DrillRun.notes`.
 */
export interface LearnRun {
	plan: PlaybackPlan;
	cues: LearnCue[];
	sections: { role: SectionRole }[];
}
