import { describe, it, expect } from 'vitest';
import { Note } from 'tonal';
import { parseChord } from '$lib/audio/chord';
import { MAX_SLOTS_PER_BAR } from '$lib/model/factory';
import { cadenceSections, learnPlan, LEARN_GROOVE, packBars } from './plan';
import type { LearnSection } from './types';

const chromaOf = (m: number) => ((m % 12) + 12) % 12;
const chromaSet = (midi: number[]) => new Set(midi.map(chromaOf));
const expectedChroma = (symbol: string) =>
	new Set(parseChord(symbol).notes.map((n) => Note.chroma(n)!));

const FOUR: { numerator: number; denominator: number } = { numerator: 4, denominator: 4 };
const C = { tonic: 'C', mode: 'major' as const };

const question = (symbols: string[], passes = 1): LearnSection => ({
	role: 'question',
	chords: symbols.map((symbol) => ({ symbol, beats: 4 })),
	passes
});

describe('packBars', () => {
	const sum = (bar: { beats: number }[]) => bar.reduce((n, s) => n + s.beats, 0);

	it('keeps chords that tile the bar exactly where they are', () => {
		const bars = packBars(
			[
				{ symbol: 'C', beats: 2 },
				{ symbol: 'F', beats: 2 },
				{ symbol: 'G', beats: 4 }
			],
			FOUR
		);
		expect(bars.map((b) => b.map((s) => [s.symbol, s.beats, s.chord]))).toEqual([
			[
				['C', 2, 0],
				['F', 2, 1]
			],
			[['G', 4, 2]]
		]);
	});

	it('fills every bar to the meter, with a rest when the chords run out', () => {
		const bars = packBars([{ symbol: 'C', beats: 3 }], FOUR);
		expect(bars).toHaveLength(1);
		expect(sum(bars[0])).toBe(4);
		expect(bars[0][1]).toEqual({ symbol: '', beats: 1, chord: null });
	});

	it("moves a chord that doesn't fit to the next bar instead of crossing the barline", () => {
		const bars = packBars(
			[
				{ symbol: 'C', beats: 3 },
				{ symbol: 'G', beats: 2 }
			],
			FOUR
		);
		expect(bars).toHaveLength(2);
		expect(bars[0].map((s) => s.symbol)).toEqual(['C', '']);
		expect(bars[1][0]).toEqual({ symbol: 'G', beats: 2, chord: 1 });
	});

	it('holds a chord longer than a bar across bars, one slot per bar', () => {
		const bars = packBars([{ symbol: 'Am', beats: 8 }], FOUR);
		expect(bars.map((b) => b.map((s) => [s.symbol, s.beats, s.chord]))).toEqual([
			[['Am', 4, 0]],
			[['Am', 4, 0]]
		]);
	});

	it(`never puts more than ${MAX_SLOTS_PER_BAR} slots in a bar, and every bar sums to the meter`, () => {
		const eighths = Array.from({ length: 9 }, (_, i) => ({ symbol: i % 2 ? 'G' : 'C', beats: 0.5 }));
		const bars = packBars(eighths, FOUR);
		for (const bar of bars) {
			expect(bar.length).toBeLessThanOrEqual(MAX_SLOTS_PER_BAR);
			expect(sum(bar)).toBeCloseTo(4, 9);
		}
	});

	it('drops non-finite and non-positive durations instead of corrupting the bar', () => {
		const bars = packBars(
			[
				{ symbol: 'C', beats: Number.NaN },
				{ symbol: 'F', beats: -2 },
				{ symbol: 'G', beats: 0 },
				{ symbol: 'Am', beats: 4 }
			],
			FOUR
		);
		expect(bars).toEqual([[{ symbol: 'Am', beats: 4, chord: 3 }]]);
	});

	it('works in 3/4 and 6/8', () => {
		for (const ts of [
			{ numerator: 3, denominator: 4 },
			{ numerator: 6, denominator: 8 }
		]) {
			const bars = packBars([{ symbol: 'C', beats: 2 }, { symbol: 'G', beats: 5 }], ts);
			for (const bar of bars) expect(sum(bar)).toBeCloseTo(ts.numerator, 9);
		}
	});
});

describe('learnPlan', () => {
	const run = learnPlan([...cadenceSections(C), question(['Am', 'F', 'G'])]);

	it('declares itself as a Learn plan that plays once with the full band', () => {
		expect(run.plan.source).toBe('learn');
		expect(run.plan.loop).toBe(false);
		expect(run.plan.mix).toBe('full');
		expect(learnPlan([question(['C'])], { loop: true }).plan.loop).toBe(true);
	});

	it('never sets slotIndex — Learn highlights only on the cue channel', () => {
		expect(run.plan.events.every((e) => e.slotIndex === null)).toBe(true);
		expect(run.plan.events.some((e) => e.cueIndex !== undefined)).toBe(true);
	});

	it('every cueIndex points into the cue table, and the table runs in time order', () => {
		for (const e of run.plan.events) if (e.cueIndex !== undefined) expect(e.cueIndex).toBeLessThan(run.cues.length);
		const cued = run.plan.events
			.filter((e) => e.cueIndex !== undefined)
			.sort((a, b) => a.atQuarters - b.atQuarters)
			.map((e) => e.cueIndex!);
		expect(cued).toEqual([...cued].sort((a, b) => a - b));
		for (let i = 1; i < run.cues.length; i++)
			expect(run.cues[i].section).toBeGreaterThanOrEqual(run.cues[i - 1].section);
	});

	it('names the sections, and lays the cadence, the gap and the question out bar by bar', () => {
		expect(run.sections.map((s) => s.role)).toEqual(['prefix', 'gap', 'question']);
		// 2 bars of half-bar cadence chords + 1 gap bar + 3 question bars, in 4/4.
		expect(run.plan.totalQuarters).toBe(24);
		expect(run.cues.map((c) => [c.section, c.chord])).toEqual([
			[0, 0], [0, 1], [0, 2], [0, 3],
			[1, 0],
			[2, 0], [2, 1], [2, 2]
		]);
	});

	it('sounds exactly each cued chord', () => {
		const sections = [...cadenceSections(C), question(['Am', 'F', 'G7', 'Cmaj7'])];
		const r = learnPlan(sections);
		for (const e of r.plan.events) {
			if (e.kind !== 'chord' || e.cueIndex === undefined) continue;
			const cue = r.cues[e.cueIndex];
			const symbol = cue.chord === null ? '' : sections[cue.section].chords[cue.chord].symbol;
			if (symbol === '') expect(e.midi).toEqual([]);
			else expect(chromaSet(e.midi), symbol).toEqual(expectedChroma(symbol));
		}
	});

	it('the gap bar is silent but still drives the highlight', () => {
		const gapCue = run.cues.findIndex((c) => run.sections[c.section].role === 'gap');
		const gapEvents = run.plan.events.filter((e) => e.cueIndex === gapCue);
		expect(gapEvents).toHaveLength(1);
		expect(gapEvents[0]).toMatchObject({ kind: 'chord', midi: [], atQuarters: 8, durQuarters: 4 });
		const inGap = (at: number) => at >= 8 && at < 12;
		expect(run.plan.events.some((e) => e.midi.length > 0 && inGap(e.atQuarters))).toBe(false);
	});

	it('unrolls passes into the plan, numbering each repetition', () => {
		const r = learnPlan([question(['C', 'G'], 3)]);
		expect(r.plan.totalQuarters).toBe(24);
		expect(r.cues.map((c) => [c.chord, c.pass])).toEqual([
			[0, 0], [1, 0], [0, 1], [1, 1], [0, 2], [1, 2]
		]);
	});

	it('loads only the voices the groove uses', () => {
		expect(run.plan.voices).toEqual({ chords: 'piano', bass: 'upright', drums: false });
		const plain = learnPlan([question(['C'])], {
			groove: { ...LEARN_GROOVE, bass: 'none', drums: 'swing' },
			instrument: 'rhodes'
		});
		expect(plain.plan.voices).toEqual({ chords: 'rhodes', bass: null, drums: true });
	});

	it('carries tempo and meter', () => {
		const r = learnPlan([question(['C'])], { tempo: 132, timeSignature: { numerator: 3, denominator: 4 } });
		expect(r.plan.tempo).toBe(132);
		expect(r.plan.quartersPerBar).toBe(3);
		expect(r.plan.countIn).toBeNull();
	});
});

describe('cadenceSections', () => {
	it('is I–IV–V–I in major and i–iv–V–i in minor, then a silent bar', () => {
		const major = cadenceSections(C);
		expect(major[0].chords.map((c) => c.symbol)).toEqual(['C', 'F', 'G', 'C']);
		expect(major[1]).toEqual({ role: 'gap', chords: [{ symbol: '', beats: 4 }] });
		const minor = cadenceSections({ tonic: 'A', mode: 'minor' });
		expect(minor[0].chords.map((c) => c.symbol)).toEqual(['Am', 'Dm', 'E', 'Am']);
	});

	it('spells every root in every key', () => {
		for (const tonic of ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'])
			for (const mode of ['major', 'minor'] as const) {
				const [prefix] = cadenceSections({ tonic, mode });
				for (const c of prefix.chords) expect(parseChord(c.symbol).midi.length, `${c.symbol} in ${tonic}`).toBeGreaterThan(0);
			}
	});
});
