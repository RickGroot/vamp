import { describe, it, expect } from 'vitest';
import { Note } from 'tonal';
import { chordCore, collapseChanges, detectProgressions, patternInfo, type CoreQuality } from './analysis';
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

describe('rock and pop additions', () => {
	it('names I–♭VII–IV and ♭VII–IV–I on the home key', () => {
		expect(ids(barsOf('C', 'Bb', 'F'))).toEqual(['mixolydian']);
		expect(detect(barsOf('C', 'Bb', 'F'))[0].formula).toBe('I–♭VII–IV');
		const back = detect(barsOf('Bb', 'F', 'C'));
		expect(back.map((d) => d.patternId)).toContain('mixolydian');
		expect(back.find((d) => d.patternId === 'mixolydian')!.formula).toBe('♭VII–IV–I');
	});

	// Self-anchored, these shapes are everyday diatonic motion seen from V:
	// G–F–C is V–IV–I in C and F–C–G is IV–I–V. Only the song's own tonic counts.
	it('does not name V–IV–I or IV–I–V as Mixolydian in the key of the V', () => {
		expect(ids(barsOf('G', 'F', 'C'))).not.toContain('mixolydian');
		expect(ids(barsOf('F', 'C', 'G'))).not.toContain('mixolydian');
		expect(ids(barsOf('G', 'F', 'C'), { tonic: 'G', mode: 'major' })).toContain('mixolydian');
	});

	it('a looped I–♭VII–IV is one detection, not its rotations', () => {
		const d = detect(barsOf('D', 'C', 'G', 'D', 'C', 'G'), { tonic: 'D', mode: 'major' });
		expect(d).toHaveLength(1);
		expect(d[0]).toMatchObject({ patternId: 'mixolydian', formula: 'I–♭VII–IV', repeats: 2 });
	});

	it('names the hopscotch loop and the Mario cadence', () => {
		expect(ids(barsOf('F', 'G', 'Am', 'C'))).toEqual(['hopscotch']);
		expect(ids(barsOf('Ab', 'Bb', 'C'))).toEqual(['mario']);
		// Self-anchored: a Mario cadence into a new key is still one.
		const up = detect(barsOf('C', 'G', 'Bb', 'C', 'D'));
		expect(up.find((d) => d.patternId === 'mario')).toMatchObject({ localTonic: 'D', relation: 'II' });
	});

	it('names every Axis rotation as the Axis', () => {
		expect(detect(barsOf('F', 'C', 'G', 'Am'))[0]).toMatchObject({ patternId: 'pop', formula: 'IV–I–V–vi' });
		expect(detect(barsOf('G', 'Am', 'F', 'C'))[0]).toMatchObject({ patternId: 'pop', formula: 'V–vi–IV–I' });
	});

	it('reads one Axis, not two, when a pass starts on another chord', () => {
		const d = detect(barsOf('C', 'G', 'Am', 'F', 'C'));
		expect(d.filter((x) => x.patternId === 'pop')).toHaveLength(1);
	});

	it('names iv–I as a minor plagal cadence, not a plagal one', () => {
		expect(ids(barsOf('C', 'Fm', 'C'))).toEqual(['cadence-minor-plagal']);
		expect(ids(barsOf('C', 'F', 'C'))).toEqual(['cadence-plagal']);
		expect(ids(barsOf('Fm', 'C', 'Am'))).toEqual([]); // end-anchored
	});
});

describe('patternInfo', () => {
	it('describes a pattern without exposing the dictionary', () => {
		const info = patternInfo('pop')!;
		expect(info.name).toBe('Pop / Axis');
		expect(info.formulas).toEqual(['I–V–vi–IV', 'vi–IV–I–V', 'IV–I–V–vi', 'V–vi–IV–I']);
		expect(info.blurb.length).toBeGreaterThan(0);
		expect(patternInfo('nope')).toBeNull();
	});
});

// The whole built-in library through the analyser. A change to the dictionary
// may only change what it meant to: any other difference here is a regression
// someone will see over a song they know.
describe('detection snapshot: every example and preset', () => {
	const summary = (bars: Bar[], key: KeyInfo) =>
		detectProgressions(bars, key).map(
			(d) =>
				`${d.patternId} ${d.formula} ${d.localTonic} b${d.startBar}-${d.endBar}${d.repeats > 1 ? ` x${d.repeats}` : ''}`
		);

	const EXPECTED_EXAMPLES: Record<string, string[]> = {
		pachelbel: ['canon I–V–vi–iii–IV–I–IV–V D b0-7'],
		'ode-to-joy': ['cadence-authentic V–I C b5-7'],
		// C–G–Am–F–C: one Axis (the V–vi–IV–I starting a bar later is the same loop).
		greensleeves: ['pop I–V–vi–IV C b1-4', 'pop I–V–vi–IV C b9-12', 'cadence-authentic V–I A b13-15'],
		'rising-sun': [],
		'amazing-grace': ['cadence-authentic V–I G b6-7'],
		saints: ['cadence-authentic V–I C b9-11'],
		'auld-lang-syne': ['cadence-authentic V–I G b6-7'],
		'swing-low': ['cadence-authentic V–I G b6-7'],
		'drunken-sailor': ['cadence-deceptive V–vi F b6-7'],
		'hava-nagila': ['cadence-authentic V–I D b6-7'],
		'oh-susanna': ['cadence-authentic V–I G b5-7'],
		wayfaring: ['cadence-authentic V–I A b5-7'],
		'st-james': ['cadence-authentic V–I A b5-7'],
		korobeiniki: ['cadence-authentic V–I E b6-7'],
		'jingle-bells': ['cadence-authentic V–I G b8-11'],
		'silent-night': ['cadence-authentic V–I C b13-15'],
		'joy-to-the-world': ['cadence-authentic V–I C b5-7'],
		'blues-in-a': ['blues12 I7–IV7–I7–V7–IV7–I7–V7 A b0-11']
	};

	const EXPECTED_PRESETS: Record<string, string[]> = {
		pop: ['pop I–V–vi–IV C b0-3'],
		doowop: ['doowop I–vi–IV–V C b0-3'],
		'vi-iv-i-v': ['pop vi–IV–I–V C b0-3'],
		'i-iv-v': [], // deliberately unnamed
		'jazz-251': ['jazz-251 ii–V–I C b0-2'],
		'minor-251': ['minor-251 iiø–V–i C b0-2'],
		canon: ['canon I–V–vi–iii–IV–I–IV–V C b0-7'],
		andalusian: ['andalusian i–♭VII–♭VI–V C b0-3'],
		blues12: ['blues12 I7–IV7–I7–V7–IV7–I7–V7 C b0-11']
	};

	it('covers every example and preset', () => {
		expect(Object.keys(EXPECTED_EXAMPLES).sort()).toEqual(EXAMPLES.map((e) => e.id).sort());
		expect(Object.keys(EXPECTED_PRESETS).sort()).toEqual(PRESETS.map((p) => p.id).sort());
	});

	it('detects exactly what it did, plus the intended additions', () => {
		for (const e of EXAMPLES) {
			const bars = buildExample(e).bars;
			const symbols = bars.flatMap((b) => b.slots.map((s) => s.chord));
			expect(summary(bars, inferKey(symbols)), e.id).toEqual(EXPECTED_EXAMPLES[e.id]);
		}
		for (const p of PRESETS) {
			const chords = buildPresetChords('C', p);
			expect(summary(barsOf(...chords), inferKey(chords)), p.id).toEqual(EXPECTED_PRESETS[p.id]);
		}
	});

	it('keeps I–IV–V unnamed in every root', () => {
		const preset = PRESETS.find((p) => p.id === 'i-iv-v')!;
		for (const root of PRESET_ROOTS) {
			const chords = buildPresetChords(root, preset);
			expect(detect(barsOf(...chords), inferKey(chords)), root).toEqual([]);
			expect(detect(barsOf(...chords), { tonic: root, mode: 'major' }), root).toEqual([]);
		}
	});
});
