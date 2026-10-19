import { describe, it, expect } from 'vitest';
import { NOTE_NAMES, type KeyInfo } from './key';
import { numeralToChord, parseNumeral } from './numerals';
import { createSlot, newId } from './factory';
import { flattenSlots } from './slots';
import type { Bar } from './types';
import {
	explainChord,
	explainSong,
	labelText,
	plainText,
	spokenLabel,
	type ChordExplanation,
	type HarmonyRole,
	type Part
} from './harmony';

const C: KeyInfo = { tonic: 'C', mode: 'major' };
const Cm: KeyInfo = { tonic: 'C', mode: 'minor' };

/** One 4-beat bar per entry; an array is a split bar. */
const barsOf = (...bars: (string | string[])[]): Bar[] =>
	bars.map((b) => {
		const symbols = Array.isArray(b) ? b : [b];
		return { id: newId(), slots: symbols.map((s) => createSlot(s, 4 / symbols.length)) };
	});

const explain = (symbol: string, key: KeyInfo, next?: string | null) => {
	const ex = explainChord(symbol, key, next);
	if (!ex) throw new Error(`no explanation for ${symbol}`);
	return ex;
};

const MAJOR_KEYS: KeyInfo[] = NOTE_NAMES.map((tonic) => ({ tonic, mode: 'major' }));
const MINOR_KEYS: KeyInfo[] = NOTE_NAMES.map((tonic) => ({ tonic, mode: 'minor' }));

/** A chord for a numeral in a key (numerals.ts builds the concert symbol). */
const at = (numeral: string, key: KeyInfo) => {
	const symbol = numeralToChord(numeral, key);
	if (!symbol) throw new Error(`bad numeral ${numeral}`);
	return symbol;
};

/** [chord, next, role, label, resolves] — the brief's chromatic cases, written as numerals. */
type Case = [string, string | null, HarmonyRole, string, boolean];
const CHROMATIC_CASES: Case[] = [
	// secondary dominants
	['VI7', 'ii', 'secondary-dominant', 'V7/ii', true],
	['II7', 'V', 'secondary-dominant', 'V7/V', true],
	['III7', 'vi', 'secondary-dominant', 'V7/vi', true],
	['I7', 'IV', 'secondary-dominant', 'V7/IV', true],
	// tritone subs
	['bII7', 'I', 'tritone-sub', 'subV/I', true],
	['bVI7', 'V', 'tritone-sub', 'subV/V', true],
	// borrowed from the parallel minor
	['bVII', null, 'borrowed', 'bVII', false],
	['bVI', null, 'borrowed', 'bVI', false],
	['bIII', null, 'borrowed', 'bIII', false],
	['iv', null, 'borrowed', 'iv', false],
	// passing diminished, named by its target
	['#i°7', 'ii7', 'passing-dim', 'passing into ii', true]
];

describe('explainChord in C', () => {
	it('reads secondary dominants by where they resolve', () => {
		for (const [chord, next, label] of [
			['A7', 'Dm', 'V7/ii'],
			['D7', 'G', 'V7/V'],
			['E7', 'Am', 'V7/vi'],
			['C7', 'F', 'V7/IV']
		]) {
			const ex = explain(chord, C, next);
			expect(ex.role, chord).toBe('secondary-dominant');
			expect(labelText(ex), chord).toBe(label);
			expect(ex.resolves).toBe(true);
		}
	});

	it('keeps a triad secondary dominant a triad: E → Am is V/vi', () => {
		expect(labelText(explain('E', C, 'Am'))).toBe('V/vi');
	});

	it('names a chain of dominants by the diatonic chords they point at', () => {
		const song = explainSong(barsOf('E7', 'A7', 'D7', 'G7', 'C'), C);
		expect(song.map(labelText)).toEqual(['V7/vi', 'V7/ii', 'V7/V', 'V7', 'I']);
	});

	it('still names an unresolved secondary dominant, without claiming it resolves', () => {
		const ex = explain('A7', C, 'F');
		expect(labelText(ex)).toBe('V7/ii');
		expect(ex.resolves).toBe(false);
		expect(plainText(ex.text)).toContain('somewhere else');
		expect(explain('A7', C).resolves).toBe(false);
	});

	it('reads tritone subs: D♭7 → C = subV/I, A♭7 → G = subV/V', () => {
		expect(labelText(explain('Db7', C, 'C'))).toBe('subV/I');
		expect(labelText(explain('Ab7', C, 'G'))).toBe('subV/V');
		expect(explain('Db7', C, 'Cmaj7').role).toBe('tritone-sub');
	});

	it('reads borrowed chords from C minor', () => {
		for (const chord of ['Bb', 'Ab', 'Eb', 'Fm', 'Fm7', 'Abmaj7', 'Ebmaj7', 'Dm7b5', 'Cm']) {
			const ex = explain(chord, C);
			expect(ex.role, chord).toBe('borrowed');
			expect(ex.from, chord).toEqual(Cm);
		}
		expect(labelText(explain('Bb', C))).toBe('bVII');
		expect(labelText(explain('Fm', C))).toBe('iv');
	});

	it('keeps borrowed triads borrowed when they fall a fifth: E♭ → A♭ is ♭III, not V/♭VI', () => {
		expect(explain('Eb', C, 'Ab').role).toBe('borrowed');
		expect(explain('Bb', C, 'Eb').role).toBe('borrowed');
	});

	it('reads B♭7 → C as the backdoor, and B♭7 elsewhere as borrowed ♭VII7', () => {
		const back = explain('Bb7', C, 'C');
		expect(back.role).toBe('borrowed');
		expect(back.backdoor).toBe(true);
		expect(back.target).toBe('I');
		expect(labelText(back)).toBe('bVII7');
		const plain = explain('Bb7', C, 'F');
		expect(plain.role).toBe('borrowed');
		expect(plain.backdoor).toBe(false);
	});

	it('reads C♯°7 → Dm7 as passing into ii, never as ♭ii°7', () => {
		for (const dim of ['C#dim7', 'C#o7', 'Dbdim7']) {
			const ex = explain(dim, C, 'Dm7');
			expect(ex.role, dim).toBe('passing-dim');
			expect(labelText(ex), dim).toBe('passing into ii');
			expect(labelText(ex)).not.toContain('°');
		}
		// Descending works too: E♭°7 → Dm7.
		expect(labelText(explain('Ebdim7', C, 'Dm7'))).toBe('passing into ii');
	});

	it('keeps every diatonic triad and seventh diatonic, whatever follows', () => {
		const chords = ['C', 'Dm', 'Em', 'F', 'G', 'Am', 'Bdim', 'Cmaj7', 'Dm7', 'Em7', 'Fmaj7', 'G7', 'Am7', 'Bm7b5'];
		for (const chord of chords)
			for (const next of [null, ...chords]) expect(explain(chord, C, next).role, `${chord} → ${next}`).toBe('diatonic');
	});

	it('ignores extensions and alterations, but not a wrong seventh', () => {
		expect(explain('G13', C, 'C').role).toBe('diatonic');
		expect(explain('G7b9', C, 'C').role).toBe('diatonic');
		expect(explain('Cmaj9', C).role).toBe('diatonic');
		expect(explain('Gmaj7', C).role).toBe('chromatic');
	});

	it('reads the 12-bar blues without calling its I7 or IV7 chromatic', () => {
		const blues = explainSong(
			barsOf('C7', 'F7', 'C7', 'C7', 'F7', 'F7', 'C7', 'C7', 'G7', 'F7', 'C7', 'G7'),
			C,
			{ loop: true }
		);
		expect(blues.every((e) => e.role !== 'chromatic')).toBe(true);
		expect(labelText(blues[0])).toBe('V7/IV'); // C7 → F7, the quick change
		expect(blues[1].role).toBe('borrowed'); // F7 → C7: a blues four chord
	});

	it('gives rests and garbage no label', () => {
		expect(explainChord('', C)).toBeNull();
		expect(explainChord('   ', C)).toBeNull();
		expect(explainChord('xyz', C)).toBeNull();
		expect(explainChord('H7', C)).toBeNull();
	});

	it('treats an unparseable next chord like a rest', () => {
		expect(explain('A7', C, 'xyz').resolves).toBe(false);
		expect(explain('A7', C, '').resolves).toBe(false);
	});

	it('uses the chart numeral for the chord itself', () => {
		expect(explain('A7', C, 'Dm').numeral).toBe('VI7');
		expect(explain('C#dim7', C, 'Dm7').numeral).toBe('bii°7');
	});

	it('says the label for screen readers', () => {
		expect(spokenLabel(explain('A7', C, 'Dm'))).toBe('five seven of two minor');
		expect(spokenLabel(explain('C#dim7', C, 'Dm7'))).toBe('passing into two minor');
		expect(spokenLabel(explain('Db7', C, 'C'))).toBe('tritone sub for the five of one major');
		expect(spokenLabel(explain('Bb', C))).toBe('flat seven major');
	});
});

describe('explainChord in minor', () => {
	it('keeps the natural and harmonic minor chords diatonic', () => {
		const numerals = [
			'i', 'ii°', 'bIII', 'iv', 'v', 'bVI', 'bVII',
			'i7', 'iiø7', 'bIIImaj7', 'iv7', 'v7', 'bVImaj7', 'bVII7',
			'V', 'V7', 'vii°', 'vii°7'
		];
		for (const key of MINOR_KEYS)
			for (const numeral of numerals) {
				const ex = explain(at(numeral, key), key, at('i', key));
				expect(ex.role, `${numeral} in ${key.tonic} minor`).toBe('diatonic');
				expect(labelText(ex)).toBe(numeral);
			}
	});

	it('reads IV in minor as borrowed from the parallel major', () => {
		for (const key of MINOR_KEYS) {
			const ex = explain(at('IV', key), key, at('i', key));
			expect(ex.role, key.tonic).toBe('borrowed');
			expect(ex.from).toEqual({ tonic: key.tonic, mode: 'major' });
		}
	});

	it('reads V7/V in minor against the raised V', () => {
		expect(labelText(explain('D7', Cm, 'G7'))).toBe('V7/V');
		expect(labelText(explain('D7', Cm))).toBe('V7/V');
	});

	it('reads the major I before iv as V/iv, not a Picardy third', () => {
		expect(labelText(explain('C', Cm, 'Fm'))).toBe('V/iv');
		expect(explain('C', Cm).role).toBe('borrowed');
	});
});

describe('explainChord in all 12 keys', () => {
	it('reads the brief cases the same way in every major key', () => {
		for (const key of MAJOR_KEYS)
			for (const [chord, next, role, label, resolves] of CHROMATIC_CASES) {
				const name = `${chord} → ${next} in ${key.tonic}`;
				const ex = explain(at(chord, key), key, next ? at(next, key) : null);
				expect(ex.role, name).toBe(role);
				expect(labelText(ex), name).toBe(label);
				expect(ex.resolves, name).toBe(resolves);
			}
	});

	it('reads ♭VII7 → I as the backdoor in every key', () => {
		for (const key of MAJOR_KEYS) {
			const ex = explain(at('bVII7', key), key, at('I', key));
			expect(ex.backdoor, key.tonic).toBe(true);
			expect(ex.role).toBe('borrowed');
		}
	});

	it('keeps every diatonic triad and seventh diatonic in every major key', () => {
		const numerals = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°', 'Imaj7', 'ii7', 'iii7', 'IVmaj7', 'V7', 'vi7', 'viiø7'];
		for (const key of MAJOR_KEYS)
			for (const numeral of numerals)
				for (const next of [null, ...numerals]) {
					const ex = explain(at(numeral, key), key, next ? at(next, key) : null);
					expect(ex.role, `${numeral} → ${next} in ${key.tonic}`).toBe('diatonic');
					expect(labelText(ex)).toBe(numeral);
				}
	});

	it('writes every label from numerals the chart can parse', () => {
		for (const key of [...MAJOR_KEYS, ...MINOR_KEYS])
			for (const [chord, next] of CHROMATIC_CASES) {
				const ex = explain(at(chord, key), key, next ? at(next, key) : null);
				expect(parseNumeral(ex.numeral), ex.numeral).not.toBeNull();
				if (ex.target) expect(parseNumeral(ex.target), ex.target).not.toBeNull();
				if (ex.fn !== 'subV') expect(parseNumeral(ex.fn), ex.fn).not.toBeNull();
				for (const part of ex.text)
					if (typeof part !== 'string' && 'numeral' in part)
						expect(parseNumeral(part.numeral), part.numeral).not.toBeNull();
			}
	});

	it('says the same words in every key: only the pitch names change', () => {
		const words = (parts: Part[]) => parts.map((p) => (typeof p === 'string' ? p : 'numeral' in p ? p.numeral : '·'));
		const reference = (key: KeyInfo, [chord, next]: Case) =>
			words(explain(at(chord, key), key, next ? at(next, key) : null).text);
		for (const c of CHROMATIC_CASES)
			for (const key of MAJOR_KEYS) expect(reference(key, c), `${c[0]} in ${key.tonic}`).toEqual(reference(C, c));
	});

	it('names the parallel key by its tonic, as a pitch the UI can transpose', () => {
		const ex = explain('Bb', C);
		expect(ex.text).toContainEqual({ note: 'C' });
		expect(plainText(ex.text)).toContain('C minor');
	});
});

describe('explainSong', () => {
	const roles = (song: ChordExplanation[]) => song.map((e) => e.role);

	it('gives repeated slots of one chord one label', () => {
		const song = explainSong(barsOf('C', 'C', ['C', 'Cmaj7'], 'A7', 'A7', 'Dm7', 'G7'), C);
		expect(song.map((e) => e.change.symbol)).toEqual(['C', 'A7', 'Dm7', 'G7']);
		expect(song[0].change.startSlot).toBe(0);
		expect(song[0].change.endSlot).toBe(3);
		expect(labelText(song[1])).toBe('V7/ii');
	});

	it('gives rests and garbage no label, and never reads the next chord across them', () => {
		const song = explainSong(barsOf('A7', '', 'Dm', 'E7', 'nonsense', 'Am'), C);
		expect(song.map((e) => e.change.symbol)).toEqual(['A7', 'Dm', 'E7', 'Am']);
		expect(song[0].next).toBeNull();
		expect(song[0].resolves).toBe(false);
		expect(song[2].next).toBeNull();
		expect(song[2].resolves).toBe(false);
		expect(song[1].next?.symbol).toBe('E7');
	});

	it('reads a loop round the seam: the last chord leads into the first', () => {
		const bars = barsOf('Dm7', 'G7', 'Cmaj7', 'A7');
		const looped = explainSong(bars, C, { loop: true });
		expect(looped[3].next?.symbol).toBe('Dm7');
		expect(labelText(looped[3])).toBe('V7/ii');
		expect(looped[3].resolves).toBe(true);

		const once = explainSong(bars, C);
		expect(once[3].next).toBeNull();
		expect(once[3].resolves).toBe(false);
	});

	it('does not wrap across a rest at the seam', () => {
		expect(explainSong(barsOf('Dm7', 'G7', 'Cmaj7', 'A7', ''), C, { loop: true })[3].next).toBeNull();
		expect(explainSong(barsOf('', 'Dm7', 'G7', 'Cmaj7', 'A7'), C, { loop: true })[3].next).toBeNull();
	});

	it('does not read a one-chord song as moving to itself', () => {
		const song = explainSong(barsOf('A7', 'A7'), C, { loop: true });
		expect(song).toHaveLength(1);
		expect(song[0].next).toBeNull();
	});

	it('keeps slot and bar indices global, the editor’s own', () => {
		const bars = barsOf('C', ['Am', 'A7'], 'Dm7', 'G7');
		const flat = flattenSlots(bars);
		const song = explainSong(bars, C);
		for (const e of song) {
			expect(flat[e.change.startSlot].slot.chord).toBe(e.change.symbol);
			expect(flat[e.change.startSlot].barIndex).toBe(e.change.startBar);
		}
		expect(song[2].change).toMatchObject({ symbol: 'A7', startSlot: 2, startBar: 1 });
	});

	it('returns nothing for a blank song', () => {
		expect(explainSong(barsOf('', ''), C)).toEqual([]);
		expect(explainSong([], C)).toEqual([]);
	});

	it('reads a rock song in the key you give it', () => {
		const bars = barsOf('C', 'Bb', 'F', 'C');
		expect(roles(explainSong(bars, C))).toEqual(['diatonic', 'borrowed', 'diatonic', 'diatonic']);
		// inferKey hears C–B♭–F as F major, where B♭ is IV and C is V.
		expect(roles(explainSong(bars, { tonic: 'F', mode: 'major' }))).toEqual(['diatonic', 'diatonic', 'diatonic', 'diatonic']);
	});
});
