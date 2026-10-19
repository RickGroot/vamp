// Learn passages → PlaybackPlan. The third plan producer, beside
// progressionPlan (schedule.ts) and drillPlan (practice/plan.ts).
//
// A passage is a list of sections (a cadence that sets the key, a silent bar, the
// question; or a lesson's loop; or the lab's A and B). Each section is packed
// into bars and handed to progressionPlan through a throwaway Progression, so a
// quiz is voiced, comped and grooved by exactly the code that plays your song —
// it sounds like the band, not like an ear-training app.
//
// Then three things make it a Learn plan:
// - `source: 'learn'`, so the song and drill stores ignore it;
// - every highlight moves from `slotIndex` to `cueIndex`. slotIndex is the
//   editor's channel; a quiz setting it would light a chord in the user's song;
// - play once with the full band (`loop: false`, `mix: 'full'`) unless asked.
//
// Pure: no tone, no stores.

import type { Bar, Groove, InstrumentId, TimeSignature } from '$lib/model/types';
import {
	createBar,
	createProgression,
	createSlot,
	DEFAULT_TIME_SIGNATURE,
	MAX_SLOTS_PER_BAR
} from '$lib/model/factory';
import { barBeats } from '$lib/model/time';
import type { KeyInfo } from '$lib/model/key';
import { numeralToChord } from '$lib/model/numerals';
import { progressionPlan } from '$lib/audio/schedule';
import type { LearnCue, LearnRun, LearnSection, PlanChord } from './types';

/**
 * Learn's default band: the cached-first voices (piano, upright bass, no kit),
 * block chords so every chord is one clear attack, the bass on the root so the
 * ear has the function in the low end.
 */
export const LEARN_GROOVE: Groove = {
	pattern: 'block',
	bass: 'root',
	bassInstrument: 'upright',
	metronome: false,
	drums: 'none'
};

export const LEARN_TEMPO = 100;

export interface LearnPlanOptions {
	tempo?: number;
	timeSignature?: TimeSignature;
	instrument?: InstrumentId;
	groove?: Groove;
	/** Loop the passage instead of playing it once (a lesson's listen step). */
	loop?: boolean;
	countIn?: boolean;
}

/** A packed slot and the chord it came from (null = filler rest). */
export interface PackedSlot {
	symbol: string;
	beats: number;
	chord: number | null;
}

const EPS = 1e-9;

/**
 * Lay a section's chords into bars of `barBeats(ts)`, starting on a fresh bar.
 * Positions are kept exactly for chords that tile the bar; otherwise the rules
 * are, in order:
 * - a chord longer than what is left of the bar closes the bar with a rest and
 *   starts the next one (a chord can't cross a barline in this model);
 * - a chord longer than a whole bar is held across bars (one slot per bar);
 * - the last bar is filled with a rest;
 * - a bar never holds more than MAX_SLOTS_PER_BAR slots: when a chord would be
 *   the fifth, the fourth stretches to fill the bar instead.
 * Non-finite or non-positive beats are dropped, so a bad input can never
 * corrupt the tick maths.
 */
export function packBars(chords: PlanChord[], ts: TimeSignature): PackedSlot[][] {
	const full = barBeats(ts);
	const bars: PackedSlot[][] = [];
	let bar: PackedSlot[] = [];
	let used = 0;

	const close = () => {
		if (bar.length === 0) return;
		const left = full - used;
		if (left > EPS) {
			if (bar.length < MAX_SLOTS_PER_BAR) bar.push({ symbol: '', beats: left, chord: null });
			else bar[bar.length - 1].beats += left;
		}
		bars.push(bar);
		bar = [];
		used = 0;
	};

	chords.forEach((c, index) => {
		if (!Number.isFinite(c.beats) || c.beats <= 0) return;
		let remaining = c.beats;
		while (remaining > EPS) {
			const left = full - used;
			if (bar.length >= MAX_SLOTS_PER_BAR || (remaining > left + EPS && used > EPS)) close();
			const take = Math.min(remaining, full - used);
			bar.push({ symbol: c.symbol, beats: take, chord: index });
			used += take;
			remaining -= take;
			if (full - used <= EPS) close();
		}
	});
	close();
	return bars;
}

/**
 * Build a Learn passage. Sections play in order, each starting on a new bar;
 * a section with `passes` is repeated back to back (pre-generated, never left
 * to the transport). The cue table is indexed by the built progression's global
 * slot index — exactly what the remapped events carry.
 */
export function learnPlan(sections: LearnSection[], opts: LearnPlanOptions = {}): LearnRun {
	const ts = opts.timeSignature ?? DEFAULT_TIME_SIGNATURE;
	const bars: Bar[] = [];
	const cues: LearnCue[] = [];

	sections.forEach((section, sectionIndex) => {
		const passes = Math.max(1, Math.floor(section.passes ?? 1));
		for (let pass = 0; pass < passes; pass++) {
			for (const packed of packBars(section.chords, ts)) {
				bars.push(createBar(ts, packed.map((s) => createSlot(s.symbol, s.beats))));
				for (const s of packed) cues.push({ section: sectionIndex, chord: s.chord, pass });
			}
		}
	});

	const song = createProgression({
		name: 'Learn',
		tempo: opts.tempo ?? LEARN_TEMPO,
		timeSignature: ts,
		instrument: opts.instrument ?? 'piano',
		groove: { ...(opts.groove ?? LEARN_GROOVE) },
		bars,
		loopRange: null
	});
	const base = progressionPlan(song, { countIn: opts.countIn ?? false });

	return {
		plan: {
			...base,
			source: 'learn',
			events: base.events.map((ev) =>
				ev.slotIndex === null
					? ev
					: { ...ev, slotIndex: null, cueIndex: ev.slotIndex }
			),
			loop: opts.loop ?? false,
			mix: 'full'
		},
		cues,
		sections: sections.map((s) => ({ role: s.role }))
	};
}

/**
 * The key-setting cadence before a question: I–IV–V–I (i–iv–V–i in minor, the
 * harmonic-minor V that makes it a cadence) in half-bar chords, then one silent
 * bar so the question starts clean. Two sections, so their cues read as
 * `prefix` and `gap`.
 */
export function cadenceSections(key: KeyInfo, ts: TimeSignature = DEFAULT_TIME_SIGNATURE): LearnSection[] {
	const numerals = key.mode === 'minor' ? ['i', 'iv', 'V', 'i'] : ['I', 'IV', 'V', 'I'];
	const half = barBeats(ts) / 2;
	return [
		{
			role: 'prefix',
			chords: numerals.map((n) => ({ symbol: numeralToChord(n, key) ?? key.tonic, beats: half }))
		},
		{ role: 'gap', chords: [{ symbol: '', beats: barBeats(ts) }] }
	];
}
