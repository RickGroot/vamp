import { describe, it, expect } from 'vitest';
import { Chord, Note } from 'tonal';
import { SWING_OFFBEAT } from '$lib/audio/comp';
import { drillPlan, type DrillPlanOptions } from '$lib/practice/plan';
import { rangeFor } from '$lib/practice/range';
import type { DrillRunOptions } from '$lib/practice/types';
import { lickGroove, swingLead, swingTime } from './plan';
import { resolveLick } from './resolve';
import type { LickDefinition } from './types';

const FOUR = { numerator: 4, denominator: 4 };

const runOpts = (over: Partial<DrillRunOptions> = {}): DrillRunOptions => ({
	root: 'C',
	keyMode: 'off',
	reps: 1,
	offset: 0,
	range: rangeFor('keys'),
	register: 'middle',
	tempo: 120,
	tempoStep: 0,
	tempoMax: 200,
	restBars: 0,
	...over
});

const planOpts = (over: Partial<DrillPlanOptions> = {}): DrillPlanOptions => ({
	backing: 'click',
	clickFeel: 'all',
	drumStyle: 'bossa',
	instrument: 'piano',
	countIn: false,
	...over
});

const lick = (over: Partial<LickDefinition> = {}): LickDefinition => ({
	schemaVersion: 1,
	id: 'test',
	name: 'test',
	description: '',
	createdAt: 0,
	updatedAt: 0,
	mode: 'major',
	changes: [
		{ numeral: 'ii7', beats: 4 },
		{ numeral: 'V7', beats: 4 },
		{ numeral: 'Imaj7', beats: 8 }
	],
	notes: ['2', '4', '6', '8', '_7', '2', '4', '6', '3'],
	rhythm: [0.5, 0.5, 0.5, 0.5, 1, 1, 1, 0.5, 11.5],
	feel: 'straight',
	timeSignature: FOUR,
	style: 'jazz',
	...over
});

const build = (l = lick(), r: Partial<DrillRunOptions> = {}, p: Partial<DrillPlanOptions> = {}) => {
	const run = resolveLick(l, runOpts(r));
	return { run, plan: drillPlan(run, planOpts(p)) };
};

const chroma = (midi: number[]) => [...new Set(midi.map((m) => m % 12))].sort((a, b) => a - b);
const symbolChroma = (symbol: string) =>
	[...new Set(Chord.get(symbol).notes.map((n) => Note.chroma(n)!))].sort((a, b) => a - b);

describe('drillPlan — a lick brings its band', () => {
	it('keeps the highlight channels apart: the band has neither slotIndex nor cueIndex', () => {
		const { plan } = build(lick(), { keyMode: 'fourths', reps: 3, restBars: 1 });
		const band = plan.events.filter((e) => e.kind !== 'lead');
		expect(band.length).toBeGreaterThan(0);
		for (const e of plan.events) expect(e.slotIndex).toBeNull();
		for (const e of band) expect('cueIndex' in e).toBe(false);
		const lead = plan.events.filter((e) => e.kind === 'lead');
		expect(lead.map((e) => e.cueIndex)).toEqual(lead.map((_, i) => i));
	});

	it('plays the run’s changes where the run puts them, in every key', () => {
		const { run, plan } = build(lick(), { keyMode: 'fourths', reps: 3, restBars: 1 });
		const chords = plan.events.filter((e) => e.kind === 'chord' && e.midi.length > 0);
		let at = 0;
		const expected: { at: number; symbol: string }[] = [];
		for (const c of run.chords) {
			if (c.symbol) expected.push({ at, symbol: c.symbol });
			at += c.beats;
		}
		expect(at).toBeCloseTo(run.totalQuarters, 9);
		// Block comping: one attack per (bar-tiled) chord.
		expect(chords.map((e) => e.atQuarters)).toEqual(expected.map((x) => x.at));
		chords.forEach((e, i) => expect(chroma(e.midi)).toEqual(symbolChroma(expected[i].symbol)));
	});

	it('leaves the rest bars between keys silent', () => {
		const { run, plan } = build(lick(), { keyMode: 'fourths', reps: 2, restBars: 1 });
		const restAt = run.phrases[0].startQuarters + 16;
		const inRest = plan.events.filter(
			(e) => (e.kind === 'chord' || e.kind === 'bass') && e.atQuarters >= restAt - 1e-9 && e.atQuarters < restAt + 4 - 1e-9
		);
		expect(inRest.every((e) => e.midi.length === 0)).toBe(true);
	});

	it('loads the voices its style needs', () => {
		const jazz = build(lick(), {}, { backing: 'none' }).plan;
		expect(jazz.voices).toEqual({ chords: 'piano', bass: 'upright', drums: false });
		const rock = build(lick({ style: 'rock' }), {}, { backing: 'drums', instrument: 'rhodes' }).plan;
		expect(rock.voices).toEqual({ chords: 'rhodes', bass: 'electric', drums: true });
		expect(jazz.source).toBe('drill');
		expect(jazz.totalQuarters).toBe(16);
	});

	it('walks the bass for jazz and plays roots for blues and rock', () => {
		const bassStarts = (style: LickDefinition['style']) =>
			build(lick({ style }), {}, { backing: 'none' }).plan.events.filter((e) => e.kind === 'bass' && e.midi.length);
		// Walking: a note on every beat of the four bars.
		expect(bassStarts('jazz').length).toBe(16);
		expect(bassStarts('blues').length).toBeLessThan(16);
		expect(bassStarts('rock').length).toBeGreaterThan(0);
	});

	it('adds the click only for "click", the kit only for "drums"', () => {
		const kinds = (backing: DrillPlanOptions['backing'], style: LickDefinition['style'] = 'jazz') =>
			new Set(build(lick({ style }), {}, { backing }).plan.events.map((e) => e.kind));
		expect(kinds('click').has('click')).toBe(true);
		expect(kinds('click').has('drum')).toBe(false);
		expect(kinds('drums').has('drum')).toBe(true);
		expect(kinds('drums').has('click')).toBe(false);
		expect(kinds('none').has('click')).toBe(false);
		expect(kinds('none').has('drum')).toBe(false);
		// The band itself plays under every backing.
		for (const b of ['click', 'drums', 'none'] as const) {
			expect(kinds(b).has('chord')).toBe(true);
			expect(kinds(b).has('bass')).toBe(true);
		}
	});

	it('ignores the drill drum style: a lick’s kit is its style’s', () => {
		const a = build(lick({ style: 'rock' }), {}, { backing: 'drums', drumStyle: 'bossa' }).plan;
		const b = build(lick({ style: 'rock' }), {}, { backing: 'drums', drumStyle: 'swing' }).plan;
		expect(a.events).toEqual(b.events);
		expect(lickGroove('rock', 'drums').drums).toBe('rock');
		expect(lickGroove('jazz', 'drums').drums).toBe('swing');
		expect(lickGroove('blues', 'click')).toMatchObject({ metronome: true, drums: 'none' });
	});

	it('still has a backing when no key could be played', () => {
		const { run, plan } = build(lick({ notes: ['r'] }));
		expect(run.notes).toHaveLength(0);
		expect(plan.events.filter((e) => e.kind === 'chord' || e.kind === 'bass')).toHaveLength(0);
	});
});

describe('swing', () => {
	it('moves the off-beat eighth and keeps the beat', () => {
		expect(swingTime(0)).toBe(0);
		expect(swingTime(1)).toBe(1);
		expect(swingTime(3)).toBe(3);
		expect(swingTime(0.5)).toBeCloseTo(SWING_OFFBEAT, 9);
		expect(swingTime(2.5)).toBeCloseTo(2 + SWING_OFFBEAT, 9);
	});

	it('is monotonic, so notes stay in order', () => {
		let prev = -1;
		for (let t = 0; t <= 8; t += 0.125) {
			const s = swingTime(t);
			expect(s).toBeGreaterThan(prev);
			prev = s;
		}
	});

	it('swings a swing lick’s line, contiguous, and never its band', () => {
		const straight = build(lick({ feel: 'straight' })).plan;
		const swung = build(lick({ feel: 'swing' })).plan;
		const lead = (p: typeof swung) => p.events.filter((e) => e.kind === 'lead');
		const s = lead(swung);
		// The eighths: 0, .5, 1, 1.5 → 0, S, 1, 1+S.
		expect(s.slice(0, 4).map((e) => e.atQuarters)).toEqual([0, SWING_OFFBEAT, 1, 1 + SWING_OFFBEAT].map((x) => expect.closeTo(x, 9)));
		expect(s[0].durQuarters).toBeCloseTo(SWING_OFFBEAT, 9);
		expect(s[1].durQuarters).toBeCloseTo(1 - SWING_OFFBEAT, 9);
		for (let i = 1; i < s.length; i++) {
			expect(s[i].atQuarters).toBeCloseTo(s[i - 1].atQuarters + s[i - 1].durQuarters, 9);
		}
		// Quarters on the beat don't move.
		expect(s[4].atQuarters).toBe(2);
		expect(s[5].atQuarters).toBe(3);
		// The band, and a straight lick's line, are untouched.
		expect(swung.events.filter((e) => e.kind !== 'lead')).toEqual(straight.events.filter((e) => e.kind !== 'lead'));
		expect(lead(straight).slice(0, 4).map((e) => e.atQuarters)).toEqual([0, 0.5, 1, 1.5]);
	});

	it('leaves the run (and so the staff) straight', () => {
		const { run } = build(lick({ feel: 'swing' }));
		expect(run.notes.slice(0, 4).map((n) => n.atQuarters)).toEqual([0, 0.5, 1, 1.5]);
	});

	it('does not swing a compound meter', () => {
		const events = [{ atQuarters: 0.5, durQuarters: 0.5, midi: [60], kind: 'lead' as const, slotIndex: null }];
		expect(swingLead(events, { numerator: 6, denominator: 8 })).toBe(events);
		expect(swingLead(events, FOUR)[0].atQuarters).toBeCloseTo(SWING_OFFBEAT, 9);
	});
});
