import { describe, it, expect } from 'vitest';
import { Chord, Note } from 'tonal';
import { isValidChordSymbol } from '$lib/audio/chord';
import { detectProgressions } from '$lib/model/analysis';
import { createSlot, MAX_SLOTS_PER_BAR, newId } from '$lib/model/factory';
import { explainSong, plainText, type HarmonyRole } from '$lib/model/harmony';
import type { KeyInfo } from '$lib/model/key';
import { numeralOf, numeralToChord, parseNumeral } from '$lib/model/numerals';
import { flattenSlots } from '$lib/model/slots';
import type { Bar } from '$lib/model/types';
import { KEY_ROOTS } from './keys';
import {
	findReharms,
	KIND_ABOUT,
	KIND_NAMES,
	reharmAt,
	REHARM_KINDS,
	WINDOW_BARS,
	type Reharm,
	type ReharmKind
} from './reharm';

const C: KeyInfo = { tonic: 'C', mode: 'major' };
const Am: KeyInfo = { tonic: 'A', mode: 'minor' };
const MAJOR_KEYS: KeyInfo[] = KEY_ROOTS.major.map((tonic) => ({ tonic, mode: 'major' }));
const MINOR_KEYS: KeyInfo[] = KEY_ROOTS.minor.map((tonic) => ({ tonic, mode: 'minor' }));

/** One 4-beat bar per entry; an array is a split bar. */
const barsOf = (...bars: (string | string[])[]): Bar[] =>
	bars.map((b) => {
		const symbols = Array.isArray(b) ? b : [b];
		return { id: newId(), slots: symbols.map((s) => createSlot(s, 4 / symbols.length)) };
	});

/** Bars from numerals in a key, one bar each (numerals.ts spells the chords). */
const song = (key: KeyInfo, ...numerals: string[]): Bar[] =>
	barsOf(
		...numerals.map((n) => {
			const symbol = numeralToChord(n, key);
			if (!symbol) throw new Error(`bad numeral ${n}`);
			return symbol;
		})
	);

const symbolsOf = (bars: Bar[]) => bars.map((b) => b.slots.map((s) => s.chord));
const ofKind = (rs: Reharm[], kind: ReharmKind) => rs.filter((r) => r.kind === kind);
const only = (rs: Reharm[], kind: ReharmKind) => {
	const found = ofKind(rs, kind);
	if (found.length !== 1) throw new Error(`expected one ${kind}, got ${found.length}`);
	return found[0];
};
const chroma = (symbol: string) => Note.chroma(Chord.get(symbol).tonic ?? '')!;
const mod12 = (n: number) => ((n % 12) + 12) % 12;
/** Pitch classes of the chord tones at these intervals. */
const tonesAt = (symbol: string, intervals: string[]) => {
	const c = Chord.get(symbol);
	return new Set(
		c.intervals.flatMap((iv, k) => (intervals.includes(iv) ? [Note.chroma(c.notes[k])!] : []))
	);
};

/** The role explainSong gives the move's new chord, read in the reharmonised song. */
function roleOfNew(r: Reharm, key: KeyInfo, loop = false) {
	const slot = r.slots[0];
	const ex = explainSong(r.bars, key, { loop }).find(
		(e) => e.change.startSlot <= slot && slot <= e.change.endSlot
	);
	if (!ex) throw new Error(`no explanation for ${r.chord}`);
	return ex;
}

/** Every rule a reharm must keep, whatever the move. */
function expectSound(r: Reharm, input: Bar[]) {
	expect(r.bars).toHaveLength(input.length);
	r.bars.forEach((bar, b) => {
		const was = input[b].slots.reduce((s, x) => s + x.beats, 0);
		const now = bar.slots.reduce((s, x) => s + x.beats, 0);
		expect(now).toBeCloseTo(was, 9);
		expect(bar.slots.length).toBeLessThanOrEqual(MAX_SLOTS_PER_BAR);
		expect(bar.id).toBe(input[b].id);
		for (const slot of bar.slots) {
			expect(slot.beats).toBeGreaterThan(0);
			if (slot.chord.trim()) expect(isValidChordSymbol(slot.chord)).toBe(true);
		}
	});
	// Only the host's bars change.
	r.bars.forEach((bar, b) => {
		if (b < r.startBar || b > r.endBar) expect(bar.slots.map((s) => s.chord)).toEqual(input[b].slots.map((s) => s.chord));
	});
	// The new chord: valid, its root spelled simply, in the slots it names.
	expect(isValidChordSymbol(r.chord)).toBe(true);
	const root = Chord.get(r.chord).tonic!;
	expect(Note.simplify(root)).toBe(root);
	const flat = flattenSlots(r.bars);
	expect(r.slots.length).toBeGreaterThan(0);
	for (const i of r.slots) expect(flat[i].slot.chord).toBe(r.chord);
	// The A/B window: real bars, no repeats, the touched bars inside it.
	expect(new Set(r.window).size).toBe(r.window.length);
	for (const b of r.window) expect(b >= 0 && b < input.length).toBe(true);
	for (let b = r.startBar; b <= r.endBar; b++) expect(r.window).toContain(b);
	// Numerals in the sentence are the chart's (they parse).
	for (const p of r.text) if (typeof p !== 'string' && 'numeral' in p) expect(parseNumeral(p.numeral)).not.toBeNull();
}

describe('findReharms: the rules every move keeps', () => {
	const MAJOR_SONGS = [
		['I', 'IV', 'V7', 'I'],
		['I', 'vi', 'ii', 'V7'],
		['I', 'ii', 'IV', 'V', 'vi'],
		['Imaj7', 'vi7', 'ii7', 'V7', 'iii7', 'VI7', 'ii7', 'V7'],
		['I', 'V', 'vi', 'IV'],
		['I7', 'IV7', 'I7', 'V7', 'IV7', 'I7']
	];
	const MINOR_SONGS = [
		['i', 'iv', 'V7', 'i'],
		['i', 'bVII', 'bVI', 'V'],
		['i7', 'iv7', 'bVII7', 'bIIImaj7']
	];

	it('keeps bar count and beats, splits within MAX_SLOTS_PER_BAR, and writes valid symbols — 12 keys, both modes', () => {
		let seen = 0;
		for (const loop of [false, true]) {
			for (const key of MAJOR_KEYS)
				for (const numerals of MAJOR_SONGS) {
					const bars = song(key, ...numerals);
					const before = JSON.stringify(bars);
					for (const r of findReharms(bars, key, { loop })) {
						expectSound(r, bars);
						seen++;
					}
					expect(JSON.stringify(bars)).toBe(before); // never mutates its input
				}
			for (const key of MINOR_KEYS)
				for (const numerals of MINOR_SONGS) {
					const bars = song(key, ...numerals);
					for (const r of findReharms(bars, key, { loop })) {
						expectSound(r, bars);
						seen++;
					}
				}
		}
		expect(seen).toBeGreaterThan(500);
	});

	it('gives every move a name and an about line with numerals that parse', () => {
		for (const kind of REHARM_KINDS) {
			expect(plainText(KIND_NAMES[kind]).length).toBeGreaterThan(0);
			for (const p of [...KIND_NAMES[kind], ...KIND_ABOUT[kind]])
				if (typeof p !== 'string' && 'numeral' in p) expect(parseNumeral(p.numeral)).not.toBeNull();
		}
	});

	it('lists each move by where it lands in the song', () => {
		// V7/I for the first C lands in the loop's last bar, so it comes last.
		const rs = ofKind(findReharms(barsOf('C', 'F', 'Dm', 'Am'), C, { loop: true }), 'secondary');
		expect(rs.map((r) => r.startBar)).toEqual([0, 1, 2, 3]);
		expect(rs.map((r) => r.chord)).toEqual(['C7', 'A7', 'E7', 'G7']);
	});

	it('ids are unique within a song', () => {
		const rs = findReharms(song(C, 'Imaj7', 'vi7', 'ii7', 'V7', 'iii7', 'VI7', 'ii7', 'V7'), C, { loop: true });
		expect(new Set(rs.map((r) => r.id)).size).toBe(rs.length);
	});

	it('offers nothing on a blank song, a lone chord, or garbage', () => {
		expect(findReharms(barsOf('', ''), C)).toEqual([]);
		expect(findReharms(barsOf('C'), C, { loop: true })).toEqual([]);
		expect(findReharms(barsOf('xyz', '???'), C)).toEqual([]);
	});

	it('never reads a neighbour across a rest', () => {
		const rs = findReharms(barsOf('C', '', 'F', 'G7', ''), C, { loop: true });
		// F comes after a rest: nothing leads into it, so no V7/IV across the gap.
		expect(rs.filter((r) => r.about.symbol === 'F' && r.kind === 'secondary')).toEqual([]);
		// A rest sits at the seam, so G7 doesn't wrap round into C: no sub.
		expect(ofKind(rs, 'tritone')).toEqual([]);
		// Without the rest at the seam it does.
		expect(ofKind(findReharms(barsOf('C', '', 'F', 'G7'), C, { loop: true }), 'tritone')).toHaveLength(1);
	});
});

describe('splitting time', () => {
	it('splits a one-bar chord into two halves', () => {
		const r = only(findReharms(barsOf('C', 'G7', 'C'), C), 'ii-v');
		expect(symbolsOf(r.bars)).toEqual([['C'], ['Dm7', 'G7'], ['C']]);
		expect(r.bars[1].slots.map((s) => s.beats)).toEqual([2, 2]);
		expect(r.before).toEqual(['G7']);
		expect(r.after).toEqual(['Dm7', 'G7']);
		expect(r.how).toBe('insert');
	});

	it('takes whole slots of a longer chord, nearest the middle', () => {
		// A two-bar V: the ii takes the first bar.
		const two = only(findReharms(barsOf('C', 'G7', 'G7', 'C'), C), 'ii-v');
		expect(symbolsOf(two.bars)).toEqual([['C'], ['Dm7'], ['G7'], ['C']]);
		// Three bars: a tie, so the new chord gets the shorter part.
		const three = only(findReharms(barsOf('G7', 'G7', 'G7', 'C'), C), 'ii-v');
		expect(symbolsOf(three.bars)).toEqual([['Dm7'], ['G7'], ['G7'], ['C']]);
		// Half-bar slots of one chord: the dominant takes the second half.
		const half = findReharms(barsOf(['C', 'C'], 'Dm'), C).find((r) => r.kind === 'secondary' && r.about.symbol === 'Dm')!;
		expect(symbolsOf(half.bars)).toEqual([['C', 'A7'], ['Dm']]);
	});

	it('offers nothing when a bar is full or a half would be under a beat', () => {
		const full = barsOf(['C', 'Am', 'Dm', 'G7'], 'C');
		const rs = findReharms(full, C);
		expect(ofKind(rs, 'ii-v')).toEqual([]);
		expect(ofKind(rs, 'secondary')).toEqual([]);
		expect(ofKind(rs, 'passing-dim')).toEqual([]);
		// The tritone sub replaces, so it needs no room.
		expect(ofKind(rs, 'tritone')).toHaveLength(1);
		// A one-beat chord (3/4, three to a bar is fine; a half beat is not).
		const short: Bar[] = [{ id: newId(), slots: [createSlot('C', 1), createSlot('G7', 1), createSlot('C', 1)] }];
		expect(ofKind(findReharms(short, C), 'ii-v')).toEqual([]);
	});

	it('the borrowed iv replaces the IV when it cannot split', () => {
		const r = only(findReharms(barsOf(['C', 'F', 'G', 'C']), C), 'borrowed-iv');
		expect(r.how).toBe('replace');
		expect(symbolsOf(r.bars)).toEqual([['C', 'Fm', 'G', 'C']]);
	});
});

describe('ii–V', () => {
	it('inserts the ii, and the result is detected as a ii–V–I — 12 major keys', () => {
		for (const key of MAJOR_KEYS) {
			for (const v of ['V7', 'V']) {
				const r = only(findReharms(song(key, 'I', 'IV', v, 'I'), key), 'ii-v');
				expect(r.chord).toBe(numeralToChord('ii7', key));
				expect(detectProgressions(r.bars, key).map((d) => d.patternId)).toContain('jazz-251');
				expect(roleOfNew(r, key).role).toBe<HarmonyRole>('diatonic');
			}
		}
	});

	it('into a minor chord it is the minor ii–V (iiø7) — 12 minor keys', () => {
		for (const key of MINOR_KEYS) {
			const r = only(findReharms(song(key, 'i', 'iv', 'V7', 'i'), key), 'ii-v');
			expect(Chord.get(r.chord).intervals).toEqual(['1P', '3m', '5d', '7m']);
			expect(chroma(r.chord)).toBe(mod12(Note.chroma(key.tonic)! + 2));
			expect(detectProgressions(r.bars, key).map((d) => d.patternId)).toContain('minor-251');
			expect(roleOfNew(r, key).role).toBe<HarmonyRole>('diatonic');
		}
	});

	it('works for any dominant, naming the secondary ii–V', () => {
		// D7 → G in C: Am7 in front of it (the ii of V/V).
		const r = findReharms(barsOf('C', 'D7', 'G', 'C'), C).find((x) => x.kind === 'ii-v' && x.about.symbol === 'D7')!;
		expect(r.chord).toBe('Am7');
		expect(plainText(r.text)).toBe('vi7 now comes before II7: it is that dominant’s own ii, so the roots fall by fifths into V.');
	});

	it('is not offered when the ii is already there, or on a chord that is not a dominant', () => {
		expect(ofKind(findReharms(song(C, 'ii7', 'V7', 'I'), C), 'ii-v')).toEqual([]);
		expect(ofKind(findReharms(song(C, 'II7', 'V7', 'I'), C), 'ii-v').map((r) => r.about.symbol)).toEqual(['D7']);
		expect(ofKind(findReharms(song(C, 'I', 'IV', 'vi'), C), 'ii-v')).toEqual([]);
		// A plain triad counts only on the key's own V.
		expect(ofKind(findReharms(barsOf('C', 'D', 'G'), C), 'ii-v')).toEqual([]);
	});
});

describe('secondary dominants (V7/x)', () => {
	it('puts a dominant seventh a fifth above x — 12 keys, both modes', () => {
		const cases: [KeyInfo[], string[]][] = [
			[MAJOR_KEYS, ['I', 'vi', 'ii', 'iii', 'IV', 'V']],
			[MINOR_KEYS, ['i', 'iv', 'bVI', 'bIII', 'bVII', 'v']]
		];
		for (const [keys, numerals] of cases)
			for (const key of keys)
				for (const loop of [false, true]) {
					const rs = ofKind(findReharms(song(key, ...numerals), key, { loop }), 'secondary');
					expect(rs.length).toBeGreaterThanOrEqual(numerals.length - 1);
					for (const r of rs) {
						expect(chroma(r.chord)).toBe(mod12(chroma(r.about.symbol) + 7));
						expect(Chord.get(r.chord).intervals).toEqual(['1P', '3M', '5P', '7m']);
					}
				}
	});

	it('is labelled a secondary dominant, or the plain V7 when x is home — 12 major keys', () => {
		for (const key of MAJOR_KEYS) {
			const rs = ofKind(findReharms(song(key, 'I', 'vi', 'ii', 'IV', 'I'), key), 'secondary');
			expect(rs.map((r) => r.about.startBar)).toEqual([1, 2, 3, 4]);
			for (const r of rs) {
				const ex = roleOfNew(r, key);
				if (r.about.startBar === 4) {
					expect(ex.role).toBe('diatonic');
					expect(ex.numeral).toBe('V7');
				} else {
					expect(ex.role).toBe('secondary-dominant');
					expect(ex.resolves).toBe(true);
				}
			}
		}
	});

	it('turns I into I7 on the way to IV (V7/IV) — 12 major keys', () => {
		for (const key of MAJOR_KEYS) {
			const r = only(findReharms(song(key, 'I', 'IV'), key), 'secondary');
			// By pitch class: in G♭ the IV is spelled B (Note.simplify), so its dominant is F♯7.
			expect(chroma(r.chord)).toBe(chroma(numeralToChord('I7', key)!));
			expect(Chord.get(r.chord).intervals).toEqual(['1P', '3M', '5P', '7m']);
			expect(r.bars[0].slots.map((s) => s.chord)).toEqual([numeralToChord('I', key), r.chord]);
			expect(roleOfNew(r, key).role).toBe<HarmonyRole>('secondary-dominant');
		}
	});

	it('is not offered where a dominant already leads in, or before a diminished chord', () => {
		const rs = ofKind(findReharms(barsOf('G7', 'C', 'Db7', 'C', 'Bb7', 'C', 'Bdim', 'G', 'C'), C), 'secondary');
		// Every C already has its dominant (V7, subV, backdoor), the G has its V triad
		// and Bdim takes none. Left: the dominants themselves (V7 of D♭7, of B♭7) and
		// the G after Bdim.
		expect(rs.map((r) => r.about.startBar)).toEqual([2, 4, 7]);
		// A V triad counts as the dominant already being there.
		expect(ofKind(findReharms(barsOf('G', 'C'), C), 'secondary')).toEqual([]);
	});

	it('round the seam of a loop, the last chord gives up its end', () => {
		const r = findReharms(barsOf('C', 'Am', 'F'), C, { loop: true }).find((x) => x.kind === 'secondary' && x.about.startBar === 0)!;
		expect(r.chord).toBe('G7');
		expect(symbolsOf(r.bars)).toEqual([['C'], ['Am'], ['F', 'G7']]);
		expect(r.window).toEqual([0, 1, 2]); // the window is the whole song: in order
	});
});

describe('tritone sub', () => {
	it('keeps the 3rd and 7th as a pitch-class set, a tritone away — 12 keys, both modes', () => {
		const cases: [KeyInfo[], string[]][] = [
			[MAJOR_KEYS, ['ii7', 'V7', 'Imaj7']],
			[MINOR_KEYS, ['iiø7', 'V7', 'i7']],
			[MAJOR_KEYS, ['I', 'VI7', 'ii7', 'V7']] // a secondary dominant too
		];
		for (const [keys, numerals] of cases)
			for (const key of keys) {
				const rs = ofKind(findReharms(song(key, ...numerals), key), 'tritone');
				expect(rs.length).toBeGreaterThan(0);
				for (const r of rs) {
					const original = r.about.symbol;
					expect(tonesAt(r.chord, ['3M', '7m'])).toEqual(tonesAt(original, ['3M', '7m']));
					expect(mod12(chroma(r.chord) - chroma(original))).toBe(6);
					expect(r.how).toBe('replace');
					expect(roleOfNew(r, key).role).toBe<HarmonyRole>('tritone-sub');
				}
			}
	});

	it('needs a dominant that resolves a fifth down', () => {
		expect(ofKind(findReharms(barsOf('C', 'G7', 'F'), C), 'tritone')).toEqual([]);
		expect(ofKind(findReharms(barsOf('C', 'Gmaj7', 'C'), C), 'tritone')).toEqual([]);
		expect(ofKind(findReharms(barsOf('C', 'G7'), C), 'tritone')).toEqual([]);
		// Round the seam of a loop, the last V resolves into the first I.
		const r = only(findReharms(barsOf('C', 'Am', 'F', 'G'), C, { loop: true }), 'tritone');
		expect(r.chord).toBe('Db7');
		expect(r.startBar).toBe(3);
		expect(r.window).toEqual([0, 1, 2, 3]);
	});
});

describe('backdoor', () => {
	it('swaps the V for ♭VII7, detected as the backdoor — 12 major keys', () => {
		for (const key of MAJOR_KEYS) {
			const r = only(findReharms(song(key, 'I', 'IV', 'V7', 'I'), key), 'backdoor');
			expect(r.how).toBe('replace');
			expect(r.startBar).toBe(2);
			expect(chroma(r.chord)).toBe(mod12(Note.chroma(key.tonic)! + 10));
			expect(detectProgressions(r.bars, key).map((d) => d.patternId)).toContain('backdoor');
			const ex = roleOfNew(r, key);
			expect(ex.role).toBe<HarmonyRole>('borrowed');
			expect(ex.backdoor).toBe(true);
		}
	});

	it('takes the end of any other chord before I — 12 major keys', () => {
		for (const key of MAJOR_KEYS) {
			const r = only(findReharms(song(key, 'I', 'ii', 'IV', 'I'), key), 'backdoor');
			expect(r.how).toBe('insert');
			expect(r.bars[2].slots.map((s) => s.chord)).toEqual([numeralToChord('IV', key), r.chord]);
			expect(detectProgressions(r.bars, key).map((d) => d.patternId)).toContain('backdoor');
			expect(roleOfNew(r, key).backdoor).toBe(true);
		}
	});

	it('only in a major key, only into a major I, never twice', () => {
		expect(ofKind(findReharms(song(Am, 'i', 'iv', 'V7', 'i'), Am), 'backdoor')).toEqual([]);
		expect(ofKind(findReharms(barsOf('F', 'C7'), C), 'backdoor')).toEqual([]);
		expect(ofKind(findReharms(barsOf('F', 'Bb7', 'C'), C), 'backdoor')).toEqual([]);
	});
});

describe('borrowed iv', () => {
	it('turns the IV minor halfway through, labelled borrowed — 12 major keys', () => {
		for (const key of MAJOR_KEYS) {
			for (const [four, iv] of [
				['IV', 'iv'],
				['IVmaj7', 'iv7']
			]) {
				const r = only(findReharms(song(key, 'I', four, 'I'), key), 'borrowed-iv');
				expect(r.chord).toBe(numeralToChord(iv, key));
				expect(r.how).toBe('insert');
				expect(r.bars[1].slots.map((s) => s.chord)).toEqual([numeralToChord(four, key), r.chord]);
				const ex = roleOfNew(r, key);
				expect(ex.role).toBe<HarmonyRole>('borrowed');
				expect(ex.from).toEqual({ tonic: key.tonic, mode: 'minor' });
			}
		}
	});

	it('not in a minor key, not on a IV7, not when the iv already follows', () => {
		expect(ofKind(findReharms(song(Am, 'i', 'iv', 'i'), Am), 'borrowed-iv')).toEqual([]);
		expect(ofKind(findReharms(barsOf('C', 'F7', 'C'), C), 'borrowed-iv')).toEqual([]);
		expect(ofKind(findReharms(barsOf('C', 'F', 'Fm', 'C'), C), 'borrowed-iv')).toEqual([]);
	});
});

describe('passing diminished', () => {
	it('fills a rising whole step with a dim7 a half step below the target — 12 major keys', () => {
		for (const key of MAJOR_KEYS) {
			const rs = ofKind(findReharms(song(key, 'I', 'ii', 'IV', 'V', 'vi'), key), 'passing-dim');
			// I → ii, IV → V, V → vi.
			expect(rs.map((r) => r.host.startBar)).toEqual([0, 2, 3]);
			for (const r of rs) {
				expect(Chord.get(r.chord).intervals).toEqual(['1P', '3m', '5d', '7d']);
				expect(chroma(r.chord)).toBe(mod12(chroma(r.about.symbol) - 1));
				const ex = roleOfNew(r, key);
				expect(ex.role).toBe<HarmonyRole>('passing-dim');
				expect(ex.target).toBe(numeralOf(r.about.symbol, key));
			}
		}
	});

	it('spells the dim7 as the leading tone of its target', () => {
		const r = only(findReharms(barsOf('C', 'Dm'), C), 'passing-dim');
		expect(r.chord).toBe('C#dim7');
		expect(symbolsOf(r.bars)).toEqual([['C', 'C#dim7'], ['Dm']]);
	});

	it('not across a step that is not a rising whole step, nor onto a diminished chord', () => {
		expect(ofKind(findReharms(barsOf('C', 'F', 'Em'), C), 'passing-dim')).toEqual([]);
		expect(ofKind(findReharms(barsOf('A', 'Bdim'), C), 'passing-dim')).toEqual([]);
	});
});

describe('reharmAt and the A/B window', () => {
	it('tries one move on one change', () => {
		const bars = barsOf('C', 'Am', 'Dm', 'G7');
		expect(reharmAt('secondary', bars, C, 2)?.chord).toBe('A7');
		expect(reharmAt('secondary', bars, C, 0)).toBeNull(); // nothing before C without the loop
		expect(reharmAt('secondary', bars, C, 0, { loop: true })).toBeNull(); // the loop's G7 already leads in
		expect(reharmAt('tritone', bars, C, 9)).toBeNull();
	});

	it('plays up to WINDOW_BARS around the move, landing on its target', () => {
		const bars = barsOf('C', 'C', 'F', 'F', 'C', 'C', 'G7', 'G7', 'C', 'C', 'C', 'C');
		const r = only(findReharms(bars, C), 'tritone');
		expect(r.startBar).toBe(6);
		expect(r.endBar).toBe(7);
		expect(r.window).toEqual([5, 6, 7, 8]);
		expect(r.window.length).toBeLessThanOrEqual(WINDOW_BARS);
		// At the very start, it grows forward instead.
		const start = only(findReharms(barsOf('G7', 'C', 'F', 'F', 'F', 'F'), C), 'tritone');
		expect(start.window).toEqual([0, 1, 2, 3]);
	});

	it('wraps round the seam of a loop', () => {
		const bars = barsOf('C', 'Am', 'Dm', 'F', 'Em', 'G7');
		const r = findReharms(bars, C, { loop: true }).find((x) => x.kind === 'tritone' && x.startBar === 5)!;
		expect(r.window).toEqual([4, 5, 0, 1]);
	});
});
