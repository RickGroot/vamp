import { describe, it, expect } from 'vitest';
import {
	CLOSED_WINDOW,
	DEDUPE_MS,
	GRACE_MS,
	MAX_PLAYED,
	OPEN_ANSWER,
	RING_MAX,
	SETTLE_MS,
	answerStep,
	gradeDue,
	marksByNote,
	missedWords,
	windowStep,
	type AnswerState,
	type TurnWindow,
	type Verdict,
	type WindowEvent
} from './lickTurn';
import { gradeLine } from './grade';
import type { CallPhase } from './lickCall';

const run = (events: WindowEvent[], from: TurnWindow = CLOSED_WINDOW) => events.reduce(windowStep, from);
const note = (midi: number, atMs: number): WindowEvent => ({ type: 'note', midi, atMs });
const phase = (p: CallPhase, atMs: number): WindowEvent => ({ type: 'phase', phase: p, atMs });

describe('windowStep', () => {
	it('arm opens a closed armed window; disarm closes everything', () => {
		const a = run([{ type: 'arm' }]);
		expect(a).toEqual({ ...CLOSED_WINDOW, armed: true });
		expect(run([{ type: 'arm' }, phase('turn', 0), { type: 'disarm' }])).toEqual(CLOSED_WINDOW);
	});
	it('ignores notes when not armed', () => {
		expect(run([note(60, 1)])).toEqual(CLOSED_WINDOW);
	});
	it('ignores bad midi and bad time', () => {
		const w = run([{ type: 'arm' }, note(-1, 1), note(128, 1), note(60.5, 1), note(60, NaN), note(60, Infinity)]);
		expect(w.ring).toEqual([]);
	});
	it('keeps a note played before the turn in the ring, newest RING_MAX', () => {
		const w = run([{ type: 'arm' }, ...Array.from({ length: RING_MAX + 3 }, (_, i) => note(40 + i, i * 100))]);
		expect(w.ring).toHaveLength(RING_MAX);
		expect(w.ring[0].midi).toBe(43);
	});
	it('the turn takes ring notes within the grace, no earlier', () => {
		const inside = run([{ type: 'arm' }, note(60, 1000 - GRACE_MS), phase('turn', 1000)]);
		expect(inside.notes.map((n) => n.midi)).toEqual([60]);
		const outside = run([{ type: 'arm' }, note(60, 1000 - GRACE_MS - 1), phase('turn', 1000)]);
		expect(outside.notes).toEqual([]);
		expect(outside.state).toBe('open');
		expect(outside.openedAt).toBe(1000);
	});
	it('appends notes while open and caps at MAX_PLAYED', () => {
		let w = run([{ type: 'arm' }, phase('turn', 0)]);
		for (let i = 0; i < MAX_PLAYED + 10; i++) w = windowStep(w, note(i % 2 ? 60 : 62, 100 + i * 100));
		expect(w.notes).toHaveLength(MAX_PLAYED);
	});
	it('drops a bounce under DEDUPE_MS, keeps it at DEDUPE_MS, while closed and open', () => {
		const closed = run([{ type: 'arm' }, note(60, 100), note(60, 100 + DEDUPE_MS - 1)]);
		expect(closed.ring).toHaveLength(1);
		const closedKept = run([{ type: 'arm' }, note(60, 100), note(60, 100 + DEDUPE_MS)]);
		expect(closedKept.ring).toHaveLength(2);
		const open = run([{ type: 'arm' }, phase('turn', 0), note(60, 100), note(60, 100 + DEDUPE_MS - 1), note(62, 131)]);
		expect(open.notes.map((n) => n.midi)).toEqual([60, 62]);
	});
	it('a different note inside the dedupe window is kept', () => {
		expect(run([{ type: 'arm' }, note(60, 100), note(62, 101)]).ring).toHaveLength(2);
	});
	it('done ends an open or closed armed window; later notes are ignored', () => {
		const over = run([{ type: 'arm' }, phase('turn', 0), note(60, 10), phase('done', 20)]);
		expect(over.state).toBe('over');
		expect(windowStep(over, note(62, 500))).toBe(over);
		expect(run([{ type: 'arm' }, phase('done', 20)]).state).toBe('over');
	});
	it('ready resets to closed, even when armed', () => {
		expect(run([{ type: 'arm' }, phase('turn', 0), note(60, 5), phase('ready', 9)])).toEqual(CLOSED_WINDOW);
	});
	it('other phases change nothing; phases on an unarmed window change nothing', () => {
		const a = run([{ type: 'arm' }]);
		expect(windowStep(a, phase('call', 5))).toBe(a);
		expect(windowStep(CLOSED_WINDOW, phase('turn', 5))).toBe(CLOSED_WINDOW);
	});
	it('graded freezes the window', () => {
		const g = run([{ type: 'arm' }, phase('turn', 0), { type: 'graded' }]);
		expect(g.state).toBe('graded');
		expect(windowStep(g, note(60, 10))).toBe(g);
		expect(windowStep(g, phase('done', 10))).toBe(g);
	});
	it('does not mutate its input', () => {
		const w = Object.freeze(run([{ type: 'arm' }, note(60, 1)]));
		expect(() => windowStep(w, note(62, 500))).not.toThrow();
		expect(() => windowStep(w, phase('turn', 600))).not.toThrow();
		expect(w.ring).toHaveLength(1);
	});
});

describe('gradeDue', () => {
	const open = (midis: number[], t0 = 1000): TurnWindow =>
		run([{ type: 'arm' }, phase('turn', 0), ...midis.map((m, i) => note(m, t0 + i * 200))]);
	it('closed and graded are never due', () => {
		expect(gradeDue(CLOSED_WINDOW, [60], 1e9).due).toBe(false);
		expect(gradeDue(windowStep(open([60]), { type: 'graded' }), [60], 1e9).due).toBe(false);
	});
	it('over is due now, finished', () => {
		const over = windowStep(open([60]), phase('done', 5));
		expect(gradeDue(over, [60, 62], 0)).toEqual({ due: true, waitMs: 0, reason: 'finished' });
	});
	it('a complete line waits SETTLE_MS after its last note', () => {
		const w = open([60, 62]); // last at 1200
		expect(gradeDue(w, [60, 62], 1200 + SETTLE_MS - 1)).toEqual({ due: false, waitMs: 1, reason: null });
		expect(gradeDue(w, [60, 62], 1200 + SETTLE_MS)).toEqual({ due: true, waitMs: 0, reason: 'complete' });
		expect(gradeDue(w, [60, 62], 1200 + SETTLE_MS + 1).due).toBe(true);
	});
	it('an incomplete line is not due while open', () => {
		expect(gradeDue(open([60]), [60, 62], 1e9)).toEqual({ due: false, waitMs: null, reason: null });
	});
	it('no expected line or no notes is not due', () => {
		expect(gradeDue(open([60]), [], 1e9).due).toBe(false);
		expect(gradeDue(open([]), [60], 1e9).due).toBe(false);
	});
	it('completes in any octave', () => {
		expect(gradeDue(open([72, 74]), [60, 62], 1e9).due).toBe(true);
	});
});

describe('marksByNote', () => {
	const line = [{ midi: 60 }, { midi: null }, { midi: 62 }, { midi: 64 }];
	it('maps the k-th sounding note to marks[k], rests to null', () => {
		expect(marksByNote(line, ['hit', 'missed', 'hit'])).toEqual(['hit', null, 'missed', 'hit']);
	});
	it('is total for null or short marks', () => {
		expect(marksByNote(line, null)).toEqual([null, null, null, null]);
		expect(marksByNote(line, ['hit'])).toEqual(['hit', null, null, null]);
		expect(marksByNote([], ['hit'])).toEqual([]);
	});
});

describe('missedWords', () => {
	it('is empty for null, none and a clean right', () => {
		expect(missedWords(null)).toBe('');
		expect(missedWords(gradeLine([60, 62, 64], [60]))).toBe('');
		expect(missedWords(gradeLine([60, 62], [60, 62]))).toBe('');
	});
	it('names missed notes by position in sounding order', () => {
		expect(missedWords(gradeLine([60, 62, 64, 65, 67], [60, 64, 65]))).toBe('Missed: note 2, note 5.');
		expect(missedWords(gradeLine([60, 62, 64], [60, 64, 62].slice(0, 2)))).toContain('Missed: note');
	});
	it('says one missed note in the singular form', () => {
		expect(missedWords(gradeLine([60, 62, 64], [60, 64]))).toBe('Missed: note 2.');
	});
	it('counts extra notes', () => {
		expect(missedWords(gradeLine([60, 64], [60, 61, 62, 64]))).toBe('2 extra notes.');
		expect(missedWords(gradeLine([60, 64], [60, 61, 64]))).toBe('One extra note.');
		expect(missedWords(gradeLine([60, 62, 64, 65], [60, 61, 64, 65]))).toBe('Missed: note 2. One extra note.');
	});
});

describe('answerStep', () => {
	const kb = (verdict: Verdict) => ({ from: 'keyboard' as const, verdict });
	const self = (verdict: Verdict) => ({ from: 'self' as const, verdict });
	it('the keyboard answers first, right or wrong, as a first record', () => {
		for (const v of ['right', 'wrong'] as Verdict[]) {
			const r = answerStep(OPEN_ANSWER, kb(v));
			expect(r.state).toEqual({ shown: v, locked: false, source: 'keyboard' });
			expect(r.record).toEqual({ how: 'first', verdict: v });
		}
	});
	it('a second keyboard verdict changes nothing', () => {
		const s = answerStep(OPEN_ANSWER, kb('wrong')).state;
		expect(answerStep(s, kb('right'))).toEqual({ state: s, record: null });
	});
	it('a self answer with nothing shown is a first record and locks', () => {
		const r = answerStep(OPEN_ANSWER, self('right'));
		expect(r.state).toEqual({ shown: 'right', locked: true, source: 'self' });
		expect(r.record).toEqual({ how: 'first', verdict: 'right' });
	});
	it('a self answer that agrees locks and records nothing', () => {
		const s = answerStep(OPEN_ANSWER, kb('right')).state;
		const r = answerStep(s, self('right'));
		expect(r.state.locked).toBe(true);
		expect(r.record).toBeNull();
	});
	it('a self answer that disagrees overwrites once', () => {
		const s = answerStep(OPEN_ANSWER, kb('wrong')).state;
		const r = answerStep(s, self('right'));
		expect(r.state).toEqual({ shown: 'right', locked: true, source: 'self' });
		expect(r.record).toEqual({ how: 'overwrite', verdict: 'right' });
	});
	it('after a lock nothing from either source changes anything', () => {
		const locked = answerStep(answerStep(OPEN_ANSWER, kb('wrong')).state, self('right')).state;
		for (const ev of [kb('wrong'), self('wrong'), self('right')]) expect(answerStep(locked, ev)).toEqual({ state: locked, record: null });
	});
	it('does not mutate its input', () => {
		const s = Object.freeze({ ...OPEN_ANSWER });
		expect(() => answerStep(s, kb('right'))).not.toThrow();
		expect(s).toEqual(OPEN_ANSWER);
	});
	it('property: at most 2 records, an overwrite only after a keyboard first, final shown is the last learner say', () => {
		let seed = 12345;
		const rand = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
		for (let t = 0; t < 500; t++) {
			let s: AnswerState = OPEN_ANSWER;
			let records = 0;
			let lastFirstFromKeyboard = false;
			let lastSelf: Verdict | null = null;
			let lastKb: Verdict | null = null;
			for (let i = 0; i < 6; i++) {
				const from = rand() < 0.5 ? 'keyboard' : 'self';
				const verdict: Verdict = rand() < 0.5 ? 'right' : 'wrong';
				const before = s;
				const r = answerStep(s, { from, verdict });
				s = r.state;
				if (r.record) {
					records++;
					if (r.record.how === 'first') lastFirstFromKeyboard = from === 'keyboard';
					else expect(lastFirstFromKeyboard && before.source === 'keyboard').toBe(true);
				}
				if (from === 'self' && !before.locked) lastSelf = verdict;
				if (from === 'keyboard' && before.shown === null && !before.locked) lastKb = verdict;
			}
			expect(records).toBeLessThanOrEqual(2);
			if (lastSelf) expect(s.shown).toBe(lastSelf);
			else if (lastKb) expect(s.shown).toBe(lastKb);
		}
	});
});

describe('missedWords without strays', () => {
	it('leaves the strays sentence out on request', () => {
		const g = { verdict: 'wrong', marks: ['hit', 'missed'], strays: [1], missed: 1 } as unknown as Parameters<typeof missedWords>[0];
		expect(missedWords(g, false)).toBe('Missed: note 2.');
		expect(missedWords(g)).toBe('Missed: note 2. One extra note.');
	});
});
