import { describe, it, expect } from 'vitest';
import { Note } from 'tonal';
import { chordCore, collapseChanges, detectProgressions, type CoreQuality } from './analysis';
import { PRESETS, PRESET_ROOTS, buildPresetChords } from './presets';
import { EXAMPLES, buildExample } from './examples';
import { inferKey, type KeyInfo } from './key';
import { createSlot, newId } from './factory';
import type { Bar } from './types';

/** One 4-beat slot per symbol (the shape examples.ts builds). */
const barsOf = (...symbols: string[]): Bar[] =>
	symbols.map((s) => ({ id: newId(), slots: [createSlot(s, 4)] }));
/** One bar holding all the symbols as slots. */
const splitBar = (...symbols: string[]): Bar[] => [
	{ id: newId(), slots: symbols.map((s) => createSlot(s, 1)) }
];

const C_MAJOR: KeyInfo = { tonic: 'C', mode: 'major' };
const detect = (bars: Bar[], key: KeyInfo = C_MAJOR) => detectProgressions(bars, key);
const ids = (bars: Bar[], key?: KeyInfo) => detect(bars, key).map((d) => d.patternId);

describe('chordCore', () => {
	const cases: [string, number, CoreQuality][] = [
		['Gmaj9', 7, 'maj'],
		['G6', 7, 'maj'],
		['D7', 2, 'dom'],
		['D13', 2, 'dom'],
		['C7#5', 0, 'dom'], // dom before aug
		['Am11', 9, 'min'],
		['AmMaj7', 9, 'min'],
		['Bm7b5', 11, 'halfdim'],
		['Cdim7', 0, 'dim'],
		['Caug', 0, 'aug'],
		['Dsus4', 2, 'sus'],
		['G7sus4', 7, 'sus'], // sus before dom
		['C5', 0, 'sus'], // documented power-chord bucket
		['C/E', 0, 'maj'] // slash bass ignored
	];
	it('reduces symbols to root pitch class + core quality', () => {
		for (const [symbol, chroma, core] of cases) {
			expect(chordCore(symbol), symbol).toEqual({ chroma, core });
		}
	});
	it('returns null for rests and unparseable text', () => {
		expect(chordCore('')).toBeNull();
		expect(chordCore('   ')).toBeNull();
		expect(chordCore('???')).toBeNull();
	});
});

describe('collapseChanges', () => {
	it('merges same-core runs and tracks slot/bar ranges + first symbol', () => {
		const bars = splitBar('Gmaj9', 'Gmaj9', 'G6', 'D', 'D7');
		const ch = collapseChanges(bars);
		expect(ch).toHaveLength(3); // Gmaj9+Gmaj9+G6 | D | D7 (maj vs dom split)
		expect(ch[0]).toMatchObject({ symbol: 'Gmaj9', startSlot: 0, endSlot: 2, startBar: 0, endBar: 0 });
		expect(ch[1]).toMatchObject({ symbol: 'D', startSlot: 3, endSlot: 3 });
		expect(ch[2]).toMatchObject({ symbol: 'D7', startSlot: 4, endSlot: 4 });
	});

	it('a rest splits segments', () => {
		const ch = collapseChanges(barsOf('Dm7', 'G7', '', 'Cmaj7'));
		expect(ch).toHaveLength(3);
		expect(ch[0].seg).toBe(ch[1].seg);
		expect(ch[2].seg).not.toBe(ch[1].seg);
	});
});

describe('jazz ii–V–I', () => {
	it('detects Dm7–G7–Cmaj7 in C', () => {
		const d = detect(barsOf('Dm7', 'G7', 'Cmaj7'));
		expect(d).toHaveLength(1);
		expect(d[0]).toMatchObject({
			patternId: 'jazz-251',
			localTonic: 'C',
			relation: null,
			chords: ['Dm7', 'G7', 'Cmaj7'],
			startBar: 0,
			endBar: 2
		});
	});

	it('matches decorated qualities and a sus V', () => {
		expect(ids(barsOf('Dm9', 'G13', 'Cmaj9'))).toContain('jazz-251');
		expect(ids(barsOf('Dm7', 'G7sus4', 'Cmaj7'))).toContain('jazz-251');
	});

	it('does not match into a minor I (only the closing cadence fires)', () => {
		const d = detect(barsOf('Dm7', 'G7', 'Cm7'));
		expect(d.map((x) => x.patternId)).toEqual(['cadence-authentic']);
	});

	it('is transposition-invariant across all preset roots', () => {
		const preset = PRESETS.find((p) => p.id === 'jazz-251')!;
		for (const root of PRESET_ROOTS) {
			const d = detect(barsOf(...buildPresetChords(root, preset)), inferKey(buildPresetChords(root, preset)));
			const m = d.find((x) => x.patternId === 'jazz-251');
			expect(m, root).toBeDefined();
			expect(Note.chroma(m!.localTonic)).toBe(Note.chroma(root));
		}
	});
});

describe('preset round-trip', () => {
	const expected: Record<string, string | null> = {
		pop: 'pop',
		doowop: 'doowop',
		'vi-iv-i-v': 'pop', // rotation variant
		'i-iv-v': null, // deliberately unnamed (too generic)
		'jazz-251': 'jazz-251',
		'minor-251': 'minor-251',
		canon: 'canon',
		andalusian: 'andalusian',
		blues12: 'blues12'
	};

	it('recognises each preset it should (and skips I–IV–V)', () => {
		for (const preset of PRESETS) {
			const chords = buildPresetChords('C', preset);
			const found = ids(barsOf(...chords), inferKey(chords));
			const want = expected[preset.id];
			if (want === null) expect(found, preset.id).toEqual([]);
			else expect(found, preset.id).toContain(want);
		}
	});

	it('blues12 spans the whole 12 bars with the standard formula', () => {
		const chords = buildPresetChords('C', PRESETS.find((p) => p.id === 'blues12')!);
		const d = detect(barsOf(...chords), inferKey(chords));
		const blues = d.find((x) => x.patternId === 'blues12')!;
		expect(blues.startBar).toBe(0);
		expect(blues.endBar).toBe(11);
		expect(blues.formula).toBe('I7–IV7–I7–V7–IV7–I7–V7');
	});

	it('vi–IV–I–V reports the rotation formula', () => {
		const chords = buildPresetChords('C', PRESETS.find((p) => p.id === 'vi-iv-i-v')!);
		const d = detect(barsOf(...chords), inferKey(chords));
		expect(d.find((x) => x.patternId === 'pop')!.formula).toBe('vi–IV–I–V');
	});
});

describe('local keys + relation naming', () => {
	it('finds a ii–V–I in the V of the global key', () => {
		const d = detect(barsOf('C', 'Am7', 'D7', 'Gmaj7', 'C'));
		const m = d.find((x) => x.patternId === 'jazz-251')!;
		expect(m.localTonic).toBe('G');
		expect(m.relation).toBe('V');
		expect(m.startBar).toBe(1);
		expect(m.endBar).toBe(3);
	});
});

describe('segment boundaries', () => {
	it('a rest inside the window kills the match', () => {
		expect(detect(barsOf('Dm7', 'G7', '', 'Cmaj7'))).toEqual([]);
	});
});

describe('cadences (end-anchored)', () => {
	it('authentic V–I only at the end', () => {
		expect(ids(barsOf('F', 'G7', 'C'))).toEqual(['cadence-authentic']);
		expect(ids(barsOf('G7', 'C', 'Am', 'F'))).not.toContain('cadence-authentic');
	});

	it('deceptive and plagal at the end', () => {
		expect(ids(barsOf('C', 'F', 'G7', 'Am'))).toContain('cadence-deceptive');
		expect(ids(barsOf('C', 'G', 'F', 'C'))).toContain('cadence-plagal');
	});
});

describe('overlap policy', () => {
	it('keeps a turnaround AND the ii–V–I resolving out of it; suppresses the contained V–I', () => {
		const found = ids(barsOf('C', 'Am', 'Dm7', 'G7', 'C'));
		expect(found).toContain('turnaround');
		expect(found).toContain('jazz-251');
		expect(found).not.toContain('cadence-authentic');
	});

	it('quick-change blues wins over the contained standard variant', () => {
		const chords = ['C7', 'F7', 'C7', 'C7', 'F7', 'F7', 'C7', 'C7', 'G7', 'F7', 'C7', 'G7'];
		const d = detect(barsOf(...chords), inferKey(chords));
		const blues = d.filter((x) => x.patternId === 'blues12');
		expect(blues).toHaveLength(1);
		expect(blues[0].formula).toContain('quick change');
	});
});

describe('repeat merging', () => {
	it('a looped pop progression is ONE detection with repeats=3', () => {
		const loop = ['C', 'G', 'Am', 'F'];
		const d = detect(barsOf(...loop, ...loop, ...loop));
		expect(d).toHaveLength(1);
		expect(d[0]).toMatchObject({
			patternId: 'pop',
			formula: 'I–V–vi–IV',
			repeats: 3,
			startBar: 0,
			endBar: 11
		});
	});
});

describe('blues slot-span guard', () => {
	it('a 6-slot toy I–IV–I–V–IV–I is not a 12-bar blues', () => {
		expect(ids(barsOf('C7', 'F7', 'C7', 'G7', 'F7', 'C7'))).not.toContain('blues12');
	});
});

describe('degenerate inputs', () => {
	it('returns [] for empty/rest/garbage/single-chord sketches', () => {
		expect(detect([])).toEqual([]);
		expect(detect(barsOf('', '', ''))).toEqual([]);
		expect(detect(barsOf('Cmaj7'))).toEqual([]);
		expect(detect(barsOf(...Array.from({ length: 64 }, () => '???')))).toEqual([]);
	});
});

describe('examples smoke', () => {
	it('every example analyses without throwing', () => {
		for (const e of EXAMPLES) {
			const bars = buildExample(e).bars;
			const symbols = bars.flatMap((b) => b.slots.map((s) => s.chord));
			expect(() => detectProgressions(bars, inferKey(symbols))).not.toThrow();
		}
	});

	it('blues-in-a is recognised as a 12-bar blues in A', () => {
		const e = EXAMPLES.find((x) => x.id === 'blues-in-a')!;
		const bars = buildExample(e).bars;
		const symbols = bars.flatMap((b) => b.slots.map((s) => s.chord));
		const d = detectProgressions(bars, inferKey(symbols));
		const blues = d.find((x) => x.patternId === 'blues12')!;
		expect(Note.chroma(blues.localTonic)).toBe(Note.chroma('A'));
	});

	it('pachelbel is recognised as the Canon', () => {
		const e = EXAMPLES.find((x) => x.id === 'pachelbel')!;
		const bars = buildExample(e).bars;
		const symbols = bars.flatMap((b) => b.slots.map((s) => s.chord));
		expect(detectProgressions(bars, inferKey(symbols)).map((x) => x.patternId)).toContain('canon');
	});
});
