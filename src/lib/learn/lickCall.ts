// Call and response, the pure side: one lick is played (a count-in, the line over
// a band), then a silent turn of the same length for the player to answer in.
//
// The AUDIBLE run is always resolved at offset 0 in a fixed range (what you
// hear never depends on your instrument's transposition); a second run at the
// player's offset is for the staff only. The plan is `source: 'learn'`, play
// once, on the cue channel only: one cue per note, then a silent marker that
// opens the turn.
//
// Pure: no `tone`, no stores.

import { Note } from 'tonal';
import type { CompEvent } from '$lib/audio/comp';
import { countInFor, type PlaybackPlan } from '$lib/audio/plan';
import { lickBacking, swingLead } from '$lib/licks/plan';
import { resolveLick } from '$lib/licks/resolve';
import type { LickDefinition, LickRun } from '$lib/licks/types';
import { TEMPO_MAX, TEMPO_MIN } from '$lib/model/factory';
import { barBeats, beatsToQuarters } from '$lib/model/time';
import { leadEvents } from '$lib/practice/plan';
import { rangeFor } from '$lib/practice/range';
import type { DrillRunOptions, RangeFailure, WrittenRange } from '$lib/practice/types';
import { KEY_ROOTS } from './keys';
import { MAX_STRAY, type LineGrade } from './grade';
import type { LearnCue, LearnRun } from './types';

export { MAX_STRAY };

export const CALL_TEMPO = 90;
export const CALL_TEMPOS = [70, 90, 110] as const;
export const CALL_BACKING = 'drums' as const;
export const CALL_INSTRUMENT = 'piano' as const;
export const CALL_RANGE = rangeFor('keys');
export const CALL_REGISTER = 'middle' as const;

export type MidiStatus = 'off' | 'requesting' | 'on' | 'error';

export interface LickCallOptions {
	/** Starting root, CONCERT pitch. */
	root: string;
	/** The player's transposition offset: the staff only. */
	offset: number;
	tempo?: number;
	/** The written range; the fixed keys range unless a test narrows it. */
	range?: WrittenRange;
}

export interface LickCallRun extends LearnRun {
	lick: LickDefinition;
	/** The audible run: concert, offset 0, the fixed range. */
	run: LickRun;
	/** The run drawn on the staff: the player's written pitch. */
	staff: LickRun;
	/** The call alone (no turn), for hearing it again. */
	hear: LearnRun;
	countInQuarters: number;
	/** The cue index of the silent marker that opens the turn. */
	turnCue: number;
	callQuarters: number;
	turnQuarters: number;
	/** The sounding line, concert MIDI, rests left out. */
	expected: number[];
}

export type LickCallResult = { ok: true; call: LickCallRun } | { ok: false; reason: RangeFailure };

/** The sounding notes of a run, concert MIDI, in order, rests left out. */
export const soundingConcert = (run: LickRun): number[] =>
	run.notes.flatMap((n) => (n.midi === null ? [] : [n.midi]));

/** The line a player is expected to play back. */
export const expected = soundingConcert;

const runOptions = (root: string, offset: number, bpm: number, range: WrittenRange): DrillRunOptions => ({
	root,
	keyMode: 'off',
	reps: 1,
	offset,
	range,
	register: CALL_REGISTER,
	tempo: bpm,
	tempoStep: 0,
	tempoMax: bpm,
	restBars: 0,
	rand: () => 0
});

const sounds = (run: LickRun) => run.notes.some((n) => n.midi !== null);

export function lickCallRun(lick: LickDefinition, opts: LickCallOptions): LickCallResult {
	const asked = opts.tempo;
	const bpm = Math.min(TEMPO_MAX, Math.max(TEMPO_MIN, Number.isFinite(asked) ? (asked as number) : CALL_TEMPO));

	const range = opts.range ?? CALL_RANGE;
	const run = resolveLick(lick, runOptions(opts.root, 0, bpm, range));
	if (!sounds(run)) return { ok: false, reason: run.skipped[0]?.reason ?? 'unresolvable' };
	const staff = opts.offset === 0 ? run : resolveLick(lick, runOptions(opts.root, opts.offset, bpm, range));
	if (!sounds(staff)) return { ok: false, reason: staff.skipped[0]?.reason ?? 'unresolvable' };

	const L = run.totalQuarters;
	const ts = lick.timeSignature;
	const doubled: LickRun = { ...run, chords: [...run.chords, ...run.chords], totalQuarters: 2 * L };
	const band = lickBacking(doubled, ts, CALL_BACKING, 'all', CALL_INSTRUMENT);

	const raw = leadEvents(run, 0);
	const lead = lick.feel === 'swing' ? swingLead(raw, ts) : raw;
	const marker: CompEvent = {
		kind: 'lead',
		atQuarters: L,
		durQuarters: L,
		midi: [],
		slotIndex: null,
		cueIndex: run.notes.length
	};

	const countIn = countInFor(ts);
	const plan: PlaybackPlan = {
		source: 'learn',
		events: [...band.events, ...lead, marker],
		totalQuarters: 2 * L,
		tempo: bpm,
		quartersPerBar: beatsToQuarters(barBeats(ts), ts),
		voices: { chords: CALL_INSTRUMENT, bass: band.bass, drums: band.drums },
		countIn,
		loop: false,
		mix: 'full'
	};

	const noteCues: LearnCue[] = run.notes.map(() => ({ section: 0, chord: null, pass: 0 }));
	const cues: LearnCue[] = [...noteCues, { section: 1, chord: null, pass: 0 }];

	const single = lickBacking(run, ts, CALL_BACKING, 'all', CALL_INSTRUMENT);
	const hear: LearnRun = {
		plan: { ...plan, events: [...single.events, ...lead], totalQuarters: L, voices: { chords: CALL_INSTRUMENT, bass: single.bass, drums: single.drums } },
		cues: noteCues,
		sections: [{ role: 'question' }]
	};

	return {
		ok: true,
		call: {
			plan,
			cues,
			sections: [{ role: 'question' }, { role: 'question' }],
			lick,
			run,
			staff,
			hear,
			countInQuarters: countIn.beats * countIn.quartersPerBeat,
			turnCue: run.notes.length,
			callQuarters: L,
			turnQuarters: L,
			expected: soundingConcert(run)
		}
	};
}

/**
 * A key for the lick: a root of the lick's mode that fits the player's range
 * and is not the previous key. Null when no key fits.
 */
export function pickLickKey(
	lick: LickDefinition,
	offset: number,
	rand: () => number,
	previous?: string
): string | null {
	const roots = [...KEY_ROOTS[lick.mode]];
	for (let i = roots.length - 1; i > 0; i--) {
		const j = Math.floor(rand() * (i + 1));
		[roots[i], roots[j]] = [roots[j], roots[i]];
	}
	const prev = previous === undefined ? null : Note.chroma(previous);
	roots.sort((a, b) => Number(Note.chroma(a) === prev) - Number(Note.chroma(b) === prev));
	return roots.find((r) => lickCallRun(lick, { root: r, offset }).ok) ?? null;
}

export type CallPhase = 'ready' | 'loading' | 'countin' | 'call' | 'turn' | 'done';
export type LearnPhase = 'idle' | 'loading' | 'playing' | 'done';

/** Where the call is, from the learn player's phase and cue. */
export function callPhase(
	learnPhase: LearnPhase,
	cue: number | null,
	turnCue: number,
	activeForMe: boolean,
	clockTurn: boolean
): CallPhase {
	if (!activeForMe) return 'ready';
	switch (learnPhase) {
		case 'loading':
			return 'loading';
		case 'done':
			return 'done';
		case 'playing':
			if ((cue !== null && cue >= turnCue) || clockTurn) return 'turn';
			return cue === null ? 'countin' : 'call';
		default:
			return 'ready';
	}
}

/** Milliseconds from pressing Play to the start of the player's turn. */
export const turnDelayMs = (call: LickCallRun): number =>
	((call.countInQuarters + call.callQuarters) * 60000) / call.plan.tempo;

export type Verdict = 'right' | 'wrong';

export function keyboardLine(s: { status: MidiStatus; device: string | null; offset: number }): string {
	if (s.status === 'requesting') return 'Allow MIDI in the browser’s prompt…';
	if (s.status !== 'on') return 'Play the lick back on a MIDI keyboard and it marks itself.';
	if (!s.device) return 'No keyboard found yet. Plug one in, or use Got it / Not yet.';
	const base = `Listening to ${s.device}: after the call, play the lick back. Any octave counts.`;
	return s.offset === 0
		? base
		: base + ' A keyboard is compared in concert pitch, so play the sounding notes: the staff shows your written pitch.';
}

export interface CallStatusState {
	phase: CallPhase;
	missingLick: boolean;
	noKey: boolean;
	/** A key was picked in the select (so "no key fits" means this key). */
	fixedKey?: boolean;
	kbd: boolean;
	early: number;
	played: number;
	expected: number;
	grade: LineGrade | null;
	answer: Verdict | null;
	source: 'keyboard' | 'self' | null;
	back: string | null;
}

export function callStatus(s: CallStatusState): string {
	const back = s.back ? s.back.charAt(0).toUpperCase() + s.back.slice(1) + '.' : '';
	const tail = back ? ` ${back}` : '';
	const Y = s.expected;
	if (s.missingLick) return 'This lick is no longer in your library.';
	if (s.noKey) {
		return s.fixedKey
			? "This key is out of your instrument's range for this lick. Pick another, or choose Any key."
			: "No key fits your instrument's range for this lick.";
	}
	if (s.answer !== null && s.source === 'keyboard' && s.grade) {
		if (s.grade.verdict === 'right') {
			return `Right: all ${Y} notes.` + (s.grade.strays.length === 1 ? ' One extra note.' : '') + tail;
		}
		const k = s.grade.strays.length;
		return `Not yet: ${Y - s.grade.missed} of ${Y} notes in order.` + (k > 0 ? ` ${k} extra.` : '') + tail;
	}
	if (s.answer === 'right' && s.source === 'self') return `Right.${tail}`;
	if (s.answer === 'wrong' && s.source === 'self') return `Not yet.${tail}`;
	if (s.grade?.verdict === 'none') {
		return "I didn't hear enough notes. Keep this tab in front while you play. Play it again, or say how it went yourself.";
	}
	if (s.kbd && s.early > 0 && (s.phase === 'countin' || s.phase === 'call')) return 'Wait for your turn.';
	switch (s.phase) {
		case 'ready':
			return s.kbd
				? "Press Play. A count-in, then the lick, then it's your turn. Play it back on your keyboard."
				: "Press Play. A count-in, then the lick, then it's your turn.";
		case 'loading':
			return 'Loading the band…';
		case 'countin':
			return 'Count in.';
		case 'call':
			return 'Listen.';
		case 'turn':
			if (!s.kbd) return 'Your turn. Play it back.';
			return s.played === 0 ? 'Your turn. Play it back on your keyboard.' : `Your turn: ${s.played} of ${Y} notes.`;
		case 'done':
			return 'That was your turn. Show the notes, then say how it went.';
	}
}
