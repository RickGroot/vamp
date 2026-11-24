import { describe, it, expect } from 'vitest';
import { Note } from 'tonal';
import { BUILT_IN_LICKS, lickById } from '$lib/licks/library';
import type { LickDefinition } from '$lib/licks/types';
import { leadEvents } from '$lib/practice/plan';
import { KEY_ROOTS } from './keys';
import { gradeLine, MAX_LINE } from './grade';
import {
	callPhase,
	callStatus,
	CALL_TEMPO,
	keyboardLine,
	lickCallRun,
	pickLickKey,
	soundingConcert,
	turnDelayMs,
	type CallStatusState,
	type LickCallRun
} from './lickCall';

const lcg = (seed: number) => {
	let x = seed >>> 0;
	return () => {
		x = (x * 1664525 + 1013904223) >>> 0;
		return x / 0x100000000;
	};
};
const OFFSETS = [0, 2, 9, 7];
const mk = (lick: LickDefinition, root: string, offset = 0, tempo?: number): LickCallRun => {
	const r = lickCallRun(lick, { root, offset, tempo });
	if (!r.ok) throw new Error(`no call for ${lick.id} in ${root}: ${r.reason}`);
	return r.call;
};
const pc = (m: number) => ((m % 12) + 12) % 12;

describe('lickCallRun', () => {
	it('builds every built-in in 12 keys at every offset, none skipped', () => {
		for (const lick of BUILT_IN_LICKS)
			for (const root of KEY_ROOTS[lick.mode])
				for (const offset of OFFSETS) expect(lickCallRun(lick, { root, offset }).ok).toBe(true);
	});

	it('plan shape: one pass then a silent turn, played once, cue channel only', () => {
		for (const lick of BUILT_IN_LICKS) {
			const c = mk(lick, KEY_ROOTS[lick.mode][0]);
			const L = c.callQuarters;
			expect(c.plan.source).toBe('learn');
			expect(c.plan.loop).toBe(false);
			expect(c.plan.mix).toBe('full');
			expect(c.plan.totalQuarters).toBe(2 * L);
			expect(c.turnQuarters).toBe(L);
			expect(c.plan.quartersPerBar > 0 && L % c.plan.quartersPerBar).toBe(0);
			expect(c.plan.events.every((e) => e.slotIndex === null)).toBe(true);
			const cues = new Set(c.plan.events.filter((e) => e.cueIndex !== undefined).map((e) => e.cueIndex));
			expect([...cues].sort((a, b) => a! - b!)).toEqual(Array.from({ length: c.run.notes.length + 1 }, (_, i) => i));
			expect(c.turnCue).toBe(c.run.notes.length);
			expect(c.cues).toHaveLength(c.run.notes.length + 1);
		}
	});

	it('the line lies within the call, the turn has no lead sound, the marker is silent at the turn', () => {
		for (const lick of BUILT_IN_LICKS) {
			const c = mk(lick, KEY_ROOTS[lick.mode][3]);
			const lead = c.plan.events.filter((e) => e.cueIndex !== undefined);
			const marker = lead.find((e) => e.cueIndex === c.turnCue)!;
			expect(marker.midi).toEqual([]);
			expect(marker.atQuarters).toBe(c.callQuarters);
			for (const e of lead) {
				if (e === marker) continue;
				expect(e.atQuarters).toBeGreaterThanOrEqual(0);
				expect(e.atQuarters + e.durQuarters).toBeLessThanOrEqual(c.callQuarters + 1e-6);
			}
		}
	});

	it('the band plays through both passes', () => {
		const c = mk(lickById('lick-rock-mixolydian')!, 'C');
		const band = c.plan.events.filter((e) => e.cueIndex === undefined && e.kind === 'chord');
		expect(band.some((e) => e.atQuarters < c.callQuarters)).toBe(true);
		expect(band.some((e) => e.atQuarters >= c.callQuarters)).toBe(true);
	});

	it('what you hear and expect does not depend on the offset', () => {
		const lick = lickById('lick-jazz-251-major')!;
		const base = mk(lick, 'C', 0);
		for (const offset of OFFSETS) {
			const c = mk(lick, 'C', offset);
			expect(c.expected).toEqual(base.expected);
			expect(c.plan.events).toEqual(base.plan.events);
			// staff pitch classes = audible + offset
			const staffPcs = c.staff.notes.filter((n) => n.midi !== null).map((n) => pc(n.midi!));
			expect(staffPcs).toEqual(base.expected.map((m) => pc(m + offset)));
		}
	});

	it('swing moves the line but not the band; 6/8 is unswung', () => {
		const swing = lickById('lick-blues-thirds')!;
		expect(swing.feel).toBe('swing');
		const c = mk(swing, 'C');
		const straight = leadEvents(c.run, 0);
		const sounded = c.plan.events.filter((e) => e.cueIndex !== undefined && e.cueIndex < c.turnCue);
		expect(sounded.some((e, i) => e.atQuarters !== straight[i].atQuarters)).toBe(true);
		const six = { ...swing, timeSignature: { numerator: 6, denominator: 8 as const } };
		const r = lickCallRun(six, { root: 'C', offset: 0 });
		if (r.ok) {
			const st = leadEvents(r.call.run, 0);
			const got = r.call.plan.events.filter((e) => e.cueIndex !== undefined && e.cueIndex < r.call.turnCue);
			got.forEach((e, i) => expect(e.atQuarters).toBe(st[i].atQuarters));
		}
	});

	it('a range narrower than the lick fails with the span reason, and the status names a picked key', () => {
		const lick = lickById('lick-jazz-251-major')!;
		const r = lickCallRun(lick, { root: 'C', offset: 0, range: { min: 60, max: 64 } });
		expect(r.ok).toBe(false);
		if (!r.ok) expect(['span', 'octave']).toContain(r.reason);
		const base = { phase: 'ready', missingLick: false, noKey: true, kbd: false, early: 0, played: 0, expected: 6, grade: null, answer: null, source: null, back: null } as const;
		expect(callStatus({ ...base, fixedKey: true })).toMatch(/This key is out of/);
		expect(callStatus({ ...base })).toMatch(/No key fits/);
	});
	it('an unfit lick fails with a reason', () => {
		const wide: LickDefinition = {
			...lickById('lick-blues-thirds')!,
			notes: ['zz', 'zz']
		};
		const r = lickCallRun(wide, { root: 'C', offset: 0 });
		expect(r.ok).toBe(false);
		if (!r.ok) expect(typeof r.reason).toBe('string');
	});

	it('hear has no marker and carries the same line', () => {
		const c = mk(lickById('lick-jazz-flat-nine')!, 'F');
		expect(c.hear.cues).toHaveLength(c.run.notes.length);
		expect(c.hear.plan.totalQuarters).toBe(c.callQuarters);
		expect(c.hear.plan.events.some((e) => e.cueIndex === c.turnCue)).toBe(false);
		expect(c.hear.plan.loop).toBe(false);
	});

	it('tempo: default, options, NaN and clamping; the line is unchanged', () => {
		const lick = lickById('lick-rock-minor-pent')!;
		const root = 'A';
		const d = mk(lick, root);
		expect(d.plan.tempo).toBe(CALL_TEMPO);
		expect(mk(lick, root, 0, 70).plan.tempo).toBe(70);
		expect(mk(lick, root, 0, 110).plan.tempo).toBe(110);
		expect(mk(lick, root, 0, NaN).plan.tempo).toBe(CALL_TEMPO);
		expect(mk(lick, root, 0, 1e6).plan.tempo).toBeLessThanOrEqual(300);
		expect(mk(lick, root, 0, -5).plan.tempo).toBeGreaterThanOrEqual(20);
		expect(mk(lick, root, 0, 70).expected).toEqual(d.expected);
		expect(mk(lick, root, 0, 70).plan.totalQuarters).toBe(d.plan.totalQuarters);
	});
});

describe('pickLickKey', () => {
	it('picks a fitting key, never the previous one, deterministically', () => {
		for (const lick of BUILT_IN_LICKS)
			for (let seed = 1; seed < 20; seed++) {
				const k = pickLickKey(lick, 2, lcg(seed))!;
				expect(KEY_ROOTS[lick.mode]).toContain(k);
				expect(lickCallRun(lick, { root: k, offset: 2 }).ok).toBe(true);
				const next = pickLickKey(lick, 2, lcg(seed + 100), k)!;
				expect(Note.chroma(next)).not.toBe(Note.chroma(k));
				expect(pickLickKey(lick, 2, lcg(seed))).toBe(k);
			}
	});
	it('is null when no key fits', () => {
		const wide: LickDefinition = { ...lickById('lick-blues-thirds')!, notes: ['zz', 'zz'] };
		expect(pickLickKey(wide, 0, lcg(1))).toBeNull();
	});
});

describe('callPhase and turnDelayMs', () => {
	it('maps the learn phase and cue', () => {
		expect(callPhase('playing', 0, 6, false, false)).toBe('ready');
		expect(callPhase('idle', null, 6, true, false)).toBe('ready');
		expect(callPhase('loading', null, 6, true, false)).toBe('loading');
		expect(callPhase('playing', null, 6, true, false)).toBe('countin');
		expect(callPhase('playing', 0, 6, true, false)).toBe('call');
		expect(callPhase('playing', 5, 6, true, false)).toBe('call');
		expect(callPhase('playing', 6, 6, true, false)).toBe('turn');
		expect(callPhase('playing', 2, 6, true, true)).toBe('turn');
		expect(callPhase('done', 6, 6, true, false)).toBe('done');
	});
	it('the turn latches: once reached it never drops back, and the clock is ignored when not active', () => {
		let seen = false;
		for (const cue of [null, 0, 3, 5, 6, 6, 7]) {
			const p = callPhase('playing', cue, 6, true, cue !== null && cue >= 6);
			if (p === 'turn') seen = true;
			if (seen) expect(p).toBe('turn');
		}
		expect(seen).toBe(true);
		expect(callPhase('playing', 0, 6, false, true)).toBe('ready');
		expect(callPhase('idle', null, 6, true, true)).toBe('ready');
	});
	it('the turn opens after the count-in plus the call', () => {
		const c = mk(lickById('lick-rock-mixolydian')!, 'C');
		expect(turnDelayMs(c)).toBeCloseTo(((c.countInQuarters + c.callQuarters) * 60000) / 90);
		expect(turnDelayMs(mk(lickById('lick-rock-mixolydian')!, 'C', 0, 70))).toBeGreaterThan(turnDelayMs(c));
	});
});

describe('callStatus and keyboardLine', () => {
	const base: CallStatusState = {
		phase: 'ready',
		missingLick: false,
		noKey: false,
		kbd: false,
		early: 0,
		played: 0,
		expected: 6,
		grade: null,
		answer: null,
		source: null,
		back: null
	};
	const g = (verdict: 'right' | 'wrong' | 'none', missed: number, strays: number[]) =>
		({ verdict, marks: [], strays, trailing: 0, matched: [], missed, expected: 6, played: 6 }) as never;
	const st = (o: Partial<CallStatusState>) => callStatus({ ...base, ...o });

	it('the rows, verbatim', () => {
		expect(st({ missingLick: true, noKey: true })).toBe('This lick is no longer in your library.');
		expect(st({ noKey: true, answer: 'right', source: 'self' })).toBe("No key fits your instrument's range for this lick.");
		expect(st({ answer: 'right', source: 'keyboard', grade: g('right', 0, []), back: 'back tomorrow' })).toBe('Right: all 6 notes. Back tomorrow.');
		expect(st({ answer: 'right', source: 'keyboard', grade: g('right', 0, [1]) })).toBe('Right: all 6 notes. One extra note.');
		expect(st({ answer: 'wrong', source: 'keyboard', grade: g('wrong', 2, [1, 3]), back: 'back in 2 days' })).toBe(
			'Not yet: 4 of 6 notes in order. 2 extra. Back in 2 days.'
		);
		expect(st({ answer: 'wrong', source: 'keyboard', grade: g('wrong', 2, []) })).toBe('Not yet: 4 of 6 notes in order.');
		expect(st({ answer: 'right', source: 'self', back: 'back tomorrow' })).toBe('Right. Back tomorrow.');
		expect(st({ answer: 'right', source: 'self' })).toBe('Right.');
		expect(st({ answer: 'wrong', source: 'self' })).toBe('Not yet.');
		expect(st({ grade: g('none', 6, []) })).toContain('Keep this tab in front');
		expect(st({ kbd: true, early: 2, phase: 'call' })).toBe('Wait for your turn.');
		expect(st({ kbd: true, early: 2, phase: 'countin' })).toBe('Wait for your turn.');
		expect(st({ kbd: true, early: 2, phase: 'turn' })).toBe('Your turn. Play it back on your keyboard.');
		expect(st({ phase: 'ready', kbd: true })).toBe("Press Play. A count-in, then the lick, then it's your turn. Play it back on your keyboard.");
		expect(st({ phase: 'ready' })).toBe("Press Play. A count-in, then the lick, then it's your turn.");
		expect(st({ phase: 'loading' })).toBe('Loading the band…');
		expect(st({ phase: 'countin' })).toBe('Count in.');
		expect(st({ phase: 'call' })).toBe('Listen.');
		expect(st({ phase: 'turn', kbd: true })).toBe('Your turn. Play it back on your keyboard.');
		expect(st({ phase: 'turn', kbd: true, played: 3 })).toBe('Your turn: 3 of 6 notes.');
		expect(st({ phase: 'turn' })).toBe('Your turn. Play it back.');
		expect(st({ phase: 'done' })).toBe('That was your turn. Show the notes, then say how it went.');
		expect(st({ phase: 'ready' })).not.toMatch(/\bbar\b/i);
	});

	it('a self verdict corrects a keyboard one', () => {
		expect(st({ answer: 'right', source: 'self', grade: g('wrong', 2, []) })).toBe('Right.');
	});

	it('never throws and never returns empty', () => {
		const phases = ['ready', 'loading', 'countin', 'call', 'turn', 'done'] as const;
		for (const phase of phases)
			for (const kbd of [false, true])
				for (const early of [0, 2])
					for (const answer of [null, 'right', 'wrong'] as const)
						for (const source of [null, 'keyboard', 'self'] as const)
							for (const grade of [null, g('right', 0, []), g('wrong', 1, [0]), g('none', 6, [])])
								expect(st({ phase, kbd, early, answer, source, grade }).length).toBeGreaterThan(0);
	});

	it('keyboardLine rows', () => {
		expect(keyboardLine({ status: 'requesting', device: null, offset: 0 })).toBe('Allow MIDI in the browser’s prompt…');
		expect(keyboardLine({ status: 'off', device: null, offset: 0 })).toBe('Play the lick back on a MIDI keyboard and it marks itself.');
		expect(keyboardLine({ status: 'on', device: null, offset: 0 })).toBe('No keyboard found yet. Plug one in, or use Got it / Not yet.');
		const base = 'Listening to Piano: after the call, play the lick back. Any octave counts.';
		expect(keyboardLine({ status: 'on', device: 'Piano', offset: 0 })).toBe(base);
		expect(keyboardLine({ status: 'on', device: 'Piano', offset: 2 })).toBe(
			base + ' A keyboard is compared in concert pitch, so play the sounding notes: the staff shows your written pitch.'
		);
	});
});

describe('grading real licks', () => {
	it('played exactly is right in every key and offset; octave shifts too', () => {
		for (const lick of BUILT_IN_LICKS)
			for (const root of KEY_ROOTS[lick.mode])
				for (const offset of OFFSETS) {
					const exp = mk(lick, root, offset).expected;
					expect(exp.length).toBeLessThanOrEqual(MAX_LINE);
					expect(gradeLine(exp, exp).verdict).toBe('right');
					expect(gradeLine(exp, exp.map((m) => m + 12)).verdict).toBe('right');
					expect(gradeLine(exp, exp.map((m, i) => m + (i % 2 ? -12 : 12))).verdict).toBe('right');
				}
	});
	it('one note dropped is wrong with exactly one missed and no strays', () => {
		for (const lick of BUILT_IN_LICKS) {
			const exp = mk(lick, KEY_ROOTS[lick.mode][0]).expected;
			for (let i = 0; i < exp.length; i++) {
				const played = exp.filter((_, j) => j !== i);
				if (played.length < 2) continue;
				const g = gradeLine(exp, played);
				expect(g.verdict).toBe('wrong');
				expect(g.missed).toBe(1);
				expect(g.strays).toEqual([]);
			}
		}
	});
	it('one extra pitch class is still right, two are wrong', () => {
		const exp = mk(lickById('lick-blues-thirds')!, 'C').expected;
		const extra = (m: number) => m + 1;
		const one = [...exp.slice(0, 2), extra(exp[1]), ...exp.slice(2)];
		const two = [...exp.slice(0, 2), extra(exp[1]), extra(exp[2]), ...exp.slice(2)];
		expect(gradeLine(exp, one).verdict).toBe('right');
		expect(gradeLine(exp, two).verdict).toBe('wrong');
	});
	it('soundingConcert leaves rests out', () => {
		const c = mk(lickById('lick-jazz-251-minor')!, 'C');
		expect(soundingConcert(c.run)).toEqual(c.expected);
		expect(c.expected.length).toBe(c.run.notes.filter((n) => n.midi !== null).length);
	});
});
