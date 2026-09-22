import { describe, it, expect } from 'vitest';
import { Note } from 'tonal';
import { drillPlan, type DrillPlanOptions } from './plan';
import { resolveDrill } from './resolve';
import { drillById } from './patterns';
import { rangeFor } from './range';
import type { DrillRunOptions } from './types';

const KEYS = rangeFor('keys');
const chroma = (m: number) => ((m % 12) + 12) % 12;

const runOpts = (over: Partial<DrillRunOptions> = {}): DrillRunOptions => ({
	root: 'C',
	keyMode: 'off',
	reps: 1,
	offset: 0,
	range: KEYS,
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
	drumStyle: 'swing',
	instrument: 'piano',
	countIn: false,
	...over
});

const build = (o: Partial<DrillRunOptions> = {}, p: Partial<DrillPlanOptions> = {}) =>
	drillPlan(resolveDrill(drillById('scale-1235')!, runOpts(o)), planOpts(p));

describe('drillPlan', () => {
	it('declares itself a drill, so the progression store leaves it alone', () => {
		expect(build().source).toBe('drill');
	});

	it('starts at the first repetition’s tempo', () => {
		expect(build({ tempo: 132 }).tempo).toBe(132);
	});

	// The two highlight channels must stay disjoint, or a drill lights up a chord
	// slot in the user's song.
	it('sets cueIndex and never slotIndex on the lead line', () => {
		const lead = build().events.filter((e) => e.kind === 'lead');
		expect(lead.length).toBeGreaterThan(0);
		expect(lead.every((e) => e.slotIndex === null)).toBe(true);
		lead.forEach((e, i) => expect(e.cueIndex).toBe(i));
	});

	it('never sets slotIndex on any event, backing included', () => {
		const plan = build({}, { backing: 'drums' });
		expect(plan.events.every((e) => e.slotIndex === null)).toBe(true);
	});

	it('emits one lead event per resolved note', () => {
		const run = resolveDrill(drillById('scale-1235')!, runOpts());
		const plan = drillPlan(run, planOpts());
		expect(plan.events.filter((e) => e.kind === 'lead')).toHaveLength(run.notes.length);
	});

	it('sounds concert pitch for a transposing instrument', () => {
		// Written C for a Bb trumpet must sound concert Bb.
		const run = resolveDrill(drillById('scale-up')!, runOpts({ root: 'Bb', offset: 2 }));
		const plan = drillPlan(run, planOpts());
		const first = plan.events.find((e) => e.kind === 'lead')!;
		expect(run.notes[0].name).toBe('C');
		expect(chroma(first.midi[0])).toBe(Note.chroma('Bb'));
	});

	it('keeps a rest as a silent event so the highlight keeps advancing', () => {
		const run = resolveDrill(
			drillById('scale-up')!,
			runOpts({ reps: 2, keyMode: 'fourths', restBars: 1 })
		);
		const plan = drillPlan(run, planOpts());
		const restIndex = run.notes.findIndex((n) => n.role === 'rest');
		expect(restIndex).toBeGreaterThan(-1);
		const rest = plan.events.filter((e) => e.kind === 'lead')[restIndex];
		expect(rest.midi).toEqual([]);
		expect(rest.cueIndex).toBe(restIndex);
	});

	describe('backing', () => {
		it('none: the line and nothing else', () => {
			const plan = build({}, { backing: 'none' });
			expect(plan.events.every((e) => e.kind === 'lead')).toBe(true);
			expect(plan.voices.drums).toBe(false);
		});

		it('click: adds a metronome, no drums', () => {
			const plan = build({}, { backing: 'click' });
			expect(plan.events.some((e) => e.kind === 'click')).toBe(true);
			expect(plan.events.some((e) => e.kind === 'drum')).toBe(false);
			expect(plan.voices.drums).toBe(false);
		});

		it('drums: adds a kit and asks for it to be loaded', () => {
			const plan = build({}, { backing: 'drums' });
			expect(plan.events.some((e) => e.kind === 'drum')).toBe(true);
			expect(plan.voices.drums).toBe(true);
		});

		it('never adds chords or bass', () => {
			for (const backing of ['none', 'click', 'drums'] as const) {
				const plan = build({}, { backing });
				expect(plan.events.some((e) => e.kind === 'chord' || e.kind === 'bass')).toBe(false);
			}
			expect(build().voices.bass).toBeNull();
		});
	});

	it('covers the whole run, including the rests', () => {
		const run = resolveDrill(
			drillById('scale-up')!,
			runOpts({ reps: 3, keyMode: 'fourths', restBars: 1 })
		);
		const plan = drillPlan(run, planOpts());
		expect(plan.totalQuarters).toBe(run.totalQuarters);
		const lead = plan.events.filter((e) => e.kind === 'lead');
		const last = lead[lead.length - 1];
		expect(last.atQuarters + last.durQuarters).toBeCloseTo(plan.totalQuarters, 10);
	});

	it('reports the bar length for the trade-fours windows', () => {
		expect(build().quartersPerBar).toBe(4);
	});

	it('adds a count-in only when asked', () => {
		expect(build({}, { countIn: false }).countIn).toBeNull();
		expect(build({}, { countIn: true }).countIn).toEqual({ beats: 4, quartersPerBeat: 1 });
	});

	it('loads the chosen lead instrument', () => {
		expect(build({}, { instrument: 'rhodes' }).voices.chords).toBe('rhodes');
	});
});
