// Licks, call and response: grading a lick played back on a MIDI keyboard.
// The pure side only: the window that collects the notes played in the turn,
// when to grade, the marks and words to show, and the one rule that decides
// what the keyboard's verdict and the learner's own say do to the record.
//
// Pure: no `tone`, no stores. Time is always injected.

import { gradeLine, type LineGrade } from './grade';
import type { CallPhase, Verdict } from './lickCall';

export type { Verdict };

/** The most notes one turn keeps. */
export const MAX_PLAYED = 256;
/** A note played this long before the turn opened still counts (an early entry). */
export const GRACE_MS = 60;
/** The same key again within this is a contact bounce, not a note. */
export const DEDUPE_MS = 30;
/** Silence after a complete line before it is graded. */
export const SETTLE_MS = 600;
/** Notes kept from before the turn opens, for the grace. */
export const RING_MAX = 8;

export interface PlayedNote {
	midi: number;
	atMs: number;
}

export interface TurnWindow {
	armed: boolean;
	state: 'closed' | 'open' | 'over' | 'graded';
	/** Notes heard before the turn opened (newest RING_MAX). */
	ring: PlayedNote[];
	/** Notes of the turn itself. */
	notes: PlayedNote[];
	openedAt: number | null;
}

export const CLOSED_WINDOW: TurnWindow = { armed: false, state: 'closed', ring: [], notes: [], openedAt: null };

export type WindowEvent =
	| { type: 'arm' }
	| { type: 'disarm' }
	| { type: 'phase'; phase: CallPhase; atMs: number }
	| { type: 'note'; midi: number; atMs: number }
	| { type: 'graded' };

export function windowStep(w: TurnWindow, ev: WindowEvent): TurnWindow {
	switch (ev.type) {
		case 'arm':
			return { ...CLOSED_WINDOW, armed: true };
		case 'disarm':
			return CLOSED_WINDOW;
		case 'graded':
			return { ...w, state: 'graded' };
		case 'phase': {
			if (ev.phase === 'ready') return CLOSED_WINDOW;
			if (!w.armed) return w;
			if (ev.phase === 'turn' && w.state === 'closed') {
				const from = ev.atMs - GRACE_MS;
				return { ...w, state: 'open', openedAt: ev.atMs, notes: w.ring.filter((n) => n.atMs >= from), ring: [] };
			}
			if (ev.phase === 'done' && (w.state === 'closed' || w.state === 'open')) return { ...w, state: 'over' };
			return w;
		}
		case 'note': {
			if (!w.armed) return w;
			if (!Number.isInteger(ev.midi) || ev.midi < 0 || ev.midi > 127 || !Number.isFinite(ev.atMs)) return w;
			if (w.state === 'over' || w.state === 'graded') return w;
			const list = w.state === 'open' ? w.notes : w.ring;
			const prev = list[list.length - 1];
			if (prev && prev.midi === ev.midi && Math.abs(ev.atMs - prev.atMs) < DEDUPE_MS) return w;
			const note = { midi: ev.midi, atMs: ev.atMs };
			if (w.state === 'open') {
				if (w.notes.length >= MAX_PLAYED) return w;
				return { ...w, notes: [...w.notes, note] };
			}
			return { ...w, ring: [...w.ring, note].slice(-RING_MAX) };
		}
	}
}

export interface GradeDue {
	due: boolean;
	waitMs: number | null;
	reason: 'complete' | 'finished' | null;
}

/** Is it time to grade? Complete + settled, or the turn is over. */
export function gradeDue(w: TurnWindow, expected: number[], nowMs: number): GradeDue {
	const no: GradeDue = { due: false, waitMs: null, reason: null };
	if (w.state === 'graded' || w.state === 'closed') return no;
	if (w.state === 'over') return { due: true, waitMs: 0, reason: 'finished' };
	if (expected.length > 0 && w.notes.length > 0 && gradeLine(expected, w.notes.map((n) => n.midi)).missed === 0) {
		const wait = w.notes[w.notes.length - 1].atMs + SETTLE_MS - nowMs;
		return { due: wait <= 0, waitMs: Math.max(0, wait), reason: wait <= 0 ? 'complete' : null };
	}
	return no;
}

export type NoteMark = 'hit' | 'missed' | null;

/** One mark per note of the line: the k-th sounding note takes marks[k], rests none. */
export function marksByNote(notes: { midi: number | null }[], marks: ('hit' | 'missed')[] | null): NoteMark[] {
	let k = 0;
	return notes.map((n) => {
		if (n.midi === null) return null;
		const m = marks && marks.length > k ? marks[k] : null;
		k++;
		return m ?? null;
	});
}

/** What went wrong, in words: "Missed: note 2, note 5. One extra note." */
export function missedWords(grade: LineGrade | null, withStrays = true): string {
	if (!grade || grade.verdict === 'none') return '';
	const parts: string[] = [];
	const missed = grade.marks.flatMap((m, i) => (m === 'missed' ? [i + 1] : []));
	if (missed.length) parts.push(`Missed: ${missed.map((n) => `note ${n}`).join(', ')}.`);
	if (withStrays && grade.strays.length) parts.push(grade.strays.length === 1 ? 'One extra note.' : `${grade.strays.length} extra notes.`);
	return parts.join(' ');
}

export interface AnswerState {
	shown: Verdict | null;
	locked: boolean;
	source: 'keyboard' | 'self' | null;
}

export const OPEN_ANSWER: AnswerState = { shown: null, locked: false, source: null };

export type AnswerEvent = { from: 'keyboard' | 'self'; verdict: Verdict };

export type RecordCall = { how: 'first' | 'overwrite'; verdict: Verdict } | null;

/**
 * What the keyboard's verdict and the learner's own word do to the answer and
 * the record. The keyboard answers first (recorded as a first answer); the
 * learner may correct it once, which overwrites that record (rerecord) rather
 * than recording a second answer. A self answer with no keyboard verdict is a
 * first record; one that agrees records nothing.
 */
export function answerStep(s: AnswerState, ev: AnswerEvent): { state: AnswerState; record: RecordCall } {
	const same = { state: s, record: null };
	if (ev.from === 'keyboard') {
		if (s.shown !== null || s.locked) return same;
		return { state: { shown: ev.verdict, locked: false, source: 'keyboard' }, record: { how: 'first', verdict: ev.verdict } };
	}
	if (s.locked) return same;
	if (s.shown === null) {
		return { state: { shown: ev.verdict, locked: true, source: 'self' }, record: { how: 'first', verdict: ev.verdict } };
	}
	if (s.shown === ev.verdict) return { state: { ...s, locked: true }, record: null };
	return { state: { shown: ev.verdict, locked: true, source: 'self' }, record: { how: 'overwrite', verdict: ev.verdict } };
}
