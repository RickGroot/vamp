// What each chord in your song is doing in its key: diatonic, a secondary
// dominant, borrowed from the parallel key, a tritone sub, a passing diminished,
// or a colour from outside the key. One label and one short sentence per chord,
// for Learn's "Your song" mode.
//
// A chord's function depends on where it goes (A7 is the V7 of ii only if Dm7
// comes next), so each chord is read together with the NEXT one. Songs are read
// as their chord CHANGES (analysis.ts collapseChanges): repeated slots of one
// chord get one label, rests and unparseable symbols get none, and a rest ends
// the phrase, so the next chord is never looked up across it.
//
// Numerals follow the chart's convention (numerals.ts): a chord's own numeral is
// numeralOf, and the function label is built from the same pieces ('V7' of 'ii').
// Sentences are original and name no pitches: they are lists of parts (words,
// numerals, concert note names) so the UI can draw the numerals and show the
// note names in written pitch.
//
// The order of the checks is load-bearing, see `explainChord`.
//
// Pure: tonal + model siblings only, never persisted.

import { Chord, Note } from 'tonal';
import type { Bar } from './types';
import { flattenSlots } from './slots';
import { chordCore, collapseChanges, type Change, type CoreQuality } from './analysis';
import { diatonicQuality, NOTE_NAMES, scaleSemitones, type KeyInfo } from './key';
import { numeralOf, spokenNumeral } from './numerals';

export type HarmonyRole =
	| 'diatonic'
	| 'secondary-dominant'
	| 'borrowed'
	| 'tritone-sub'
	| 'passing-dim'
	| 'chromatic';

/**
 * A piece of a sentence: words, a numeral (ASCII b / #, drawn by the UI) or a
 * CONCERT note name, a key's tonic (shown by the UI in written pitch).
 */
export type Part = string | { numeral: string } | { note: string };

export interface ChordExplanation {
	role: HarmonyRole;
	/** The chord's own numeral, exactly as the Sketch chart prints it (numeralOf). */
	numeral: string;
	/**
	 * The function part of its label: 'V7' in V7/ii, 'subV' in subV/I. For the
	 * roles without a target it is the numeral itself.
	 */
	fn: string;
	/** The chord it leads to as a triad numeral ('ii'), for the roles that point somewhere. */
	target: string | null;
	/** True when the next chord really is that target. */
	resolves: boolean;
	/** ♭VII7 → I. */
	backdoor: boolean;
	/** The parallel key a borrowed chord comes from. */
	from: KeyInfo | null;
	/** One short original sentence. */
	text: Part[];
}

/** One chord change of a song with its explanation. */
export interface ExplainedChange extends ChordExplanation {
	change: Change;
	/** The change it was read with, or null (a rest follows, or the song ends). */
	next: Change | null;
}

const mod12 = (n: number) => ((n % 12) + 12) % 12;

type Seventh = '' | '7' | 'maj7' | 'dim7';

interface Read {
	chroma: number;
	core: CoreQuality;
	seventh: Seventh;
	/** Pitch classes of the chord's notes. */
	pcs: number[];
}

function read(symbol: string): Read | null {
	const core = chordCore(symbol);
	if (!core) return null;
	const chord = Chord.get(symbol.trim());
	const has = (iv: string) => chord.intervals.includes(iv);
	const seventh: Seventh = has('7m') ? '7' : has('7M') ? 'maj7' : has('7d') ? 'dim7' : '';
	const pcs = chord.notes.map((n) => Note.chroma(n)).filter((c): c is number => c != null);
	return { ...core, seventh, pcs };
}

const otherMode = (mode: KeyInfo['mode']): KeyInfo['mode'] => (mode === 'major' ? 'minor' : 'major');

/** The seventh the scale stacks on a degree: '7' (minor seventh) or 'maj7'. */
function scaleSeventh(semis: number, mode: KeyInfo['mode']): Seventh {
	const degrees = scaleSemitones(mode);
	const i = degrees.indexOf(semis);
	if (i < 0) return '';
	const gap = mod12(degrees[(i + 6) % 7] - semis);
	return gap === 11 ? 'maj7' : gap === 10 ? '7' : 'dim7';
}

/**
 * Does the chord (root `semis` above the tonic) belong to the key's scale? By
 * core quality, so extensions and alterations don't matter (G7♭9 is still V7 in
 * C), but a stated seventh has to be the scale's (Gmaj7 isn't in C). In minor,
 * `harmonic` adds the raised seventh's chords: V, V7, vii° and vii°7. Sus chords
 * have no third to judge, so every note must be on the scale.
 */
function fits(r: Read, semis: number, mode: KeyInfo['mode'], harmonic: boolean): boolean {
	if (mode === 'minor' && harmonic) {
		if (semis === 7 && (r.core === 'dom' || (r.core === 'maj' && r.seventh === ''))) return true;
		if (semis === 11 && r.core === 'dim') return true;
	}
	if (r.core === 'sus') {
		const degrees = scaleSemitones(mode);
		const tonic = mod12(r.chroma - semis);
		return r.pcs.length > 0 && r.pcs.every((pc) => degrees.includes(mod12(pc - tonic)));
	}
	const triad = diatonicQuality(semis, mode);
	if (!triad) return false;
	const seventh = scaleSeventh(semis, mode);
	switch (r.core) {
		case 'maj':
			return triad === 'M' && (r.seventh === '' || r.seventh === seventh);
		case 'dom':
			return triad === 'M' && seventh === '7';
		case 'min':
			return triad === 'm' && (r.seventh === '' || r.seventh === seventh);
		case 'halfdim':
			return triad === 'dim';
		case 'dim':
			return triad === 'dim' && r.seventh === '';
		case 'aug':
			return false;
	}
}

/** A triad numeral, the way a target is written after the slash: 'ii7' → 'ii', 'viiø7' → 'vii°'. */
function triadNumeral(symbol: string, key: KeyInfo): string {
	return numeralOf(symbol, key)
		.replace(/(maj7|7)$/, '')
		.replace('ø', '°');
}

const TRIAD_SUFFIX = { M: '', m: 'm', dim: 'dim' } as const;

/**
 * The numeral of the chord a dominant points at on a degree. A diatonic degree
 * is named by its diatonic triad — so the chain E7–A7–D7–G7 reads V7/vi, V7/ii,
 * V7/V, V7, the way it is analysed — unless the chord that follows is itself
 * diatonic there (G in C minor is V, Gm is v). Minor's dominant degree defaults
 * to the raised V. Off the scale, the next chord names itself.
 */
function targetNumeral(semis: number, key: KeyInfo, next: string | null): string | null {
	const t = mod12(semis);
	const nextRead = next ? read(next) : null;
	if (next && nextRead && mod12(nextRead.chroma - tonicChroma(key)) === t && fits(nextRead, t, key.mode, true))
		return triadNumeral(next, key);
	const triad = key.mode === 'minor' && t === 7 ? 'M' : diatonicQuality(t, key.mode);
	if (triad) return triadNumeral(`${NOTE_NAMES[mod12(tonicChroma(key) + t)]}${TRIAD_SUFFIX[triad]}`, key);
	return next ? triadNumeral(next, key) : null;
}

/** A degree a dominant can make sound like home: on the scale, major or minor (not ii° / vii°). */
function tonicizable(semis: number, mode: KeyInfo['mode']): boolean {
	const q = diatonicQuality(semis, mode);
	return q === 'M' || q === 'm';
}

const tonicChroma = (key: KeyInfo) => mod12(Note.chroma(key.tonic) ?? 0);

const N = (numeral: string): Part => ({ numeral });
const keyName = (key: KeyInfo): Part[] => [{ note: key.tonic }, ` ${key.mode}`];

/** Sentences for the diatonic chords, by mode and degree. */
function diatonicText(r: Read, semis: number, mode: KeyInfo['mode']): Part[] {
	if (r.core === 'sus') return ['In the key, with the third left out: it hangs between major and minor.'];
	if (mode === 'major') {
		switch (semis) {
			case 0:
				return ['Home. Every other chord in the key pulls back toward it.'];
			case 2:
				return ['A step away from home, usually on its way to ', N('V'), '.'];
			case 4:
				return ['Shares two notes with ', N('I'), ': a softer, darker stand-in for home.'];
			case 5:
				return ['Away from home without tension. ', N('IV'), ' back to ', N('I'), ' is the "Amen" sound.'];
			case 7:
				return ['The strongest pull home: its third is the leading tone, a half step under the tonic.'];
			case 9:
				return ['The relative minor. It shares two notes with ', N('I'), ', so it can stand in for home and darken it.'];
			default:
				return ['Built on the leading tone, it does the job of ', N('V'), ' without its root.'];
		}
	}
	switch (semis) {
		case 0:
			return ['Home, in a minor key.'];
		case 2:
			return ['On its way to ', N('V'), ', with the bite of its flat fifth.'];
		case 3:
			return ['The relative major: the brightest chord a minor key has.'];
		case 5:
			return ['Away from home, and darker than the major ', N('IV'), ' of a major key.'];
		case 7:
			return r.core === 'min'
				? ['A minor ', N('v'), ' has no leading tone, so it pulls home only gently.']
				: ['Its third is raised, as in the harmonic minor, so a leading tone pulls hard to ', N('i'), '.'];
		case 8:
			return ['Shares two notes with ', N('i'), ': a warm step away from home.'];
		case 10:
			return ['The whole step below home: the folk and rock way back to ', N('i'), '.'];
		default:
			return ['Built on the raised leading tone, it pulls to ', N('i'), ' the way ', N('V'), ' does.'];
	}
}

/** Sentences for chords borrowed from the parallel key. */
function borrowedText(r: Read, semis: number, key: KeyInfo, from: KeyInfo): Part[] {
	const src = ['Borrowed from ', ...keyName(from)];
	if (key.mode === 'major') {
		if (semis === 10) return [...src, ': a major chord a whole step below home, the rock way back to ', N('I'), '.'];
		if (semis === 8)
			return [...src, ': a darker, wider stand-in for ', N('vi'), '. It often climbs through ', N('bVII'), ' back to ', N('I'), '.'];
		if (semis === 3) return [...src, ': a bold major chord on the minor third, a colour the major key lacks.'];
		if (semis === 5 && r.core === 'min') return [...src, ': ', N('IV'), ' turned minor, a sigh on the way home.'];
		if (semis === 0) return [...src, ': home itself, turned minor.'];
		if (semis === 2) return [...src, ': a darker ', N('ii'), ' that leans harder into ', N('V'), '.'];
		if (semis === 7) return [...src, ': ', N('V'), ' without its leading tone, so it pulls home only gently.'];
		if (semis === 11) return [...src, ': the full diminished seventh on the leading tone, pulling hard to ', N('I'), '.'];
		return [...src, ', the minor key on the same home note.'];
	}
	if (semis === 5) return [...src, ': a major four in a minor key, the brighter Dorian colour.'];
	if (semis === 0)
		return [...src, ': home turned major. As the last chord of a minor song it is called a Picardy third.'];
	return [...src, ', the major key on the same home note.'];
}

/** I7 and IV7 that lead nowhere: the blues' own dominants, coloured by the parallel key. */
function bluesText(semis: number, key: KeyInfo, from: KeyInfo): Part[] {
	if (key.mode === 'major')
		return semis === 0
			? ['A blues home chord: the major chord with the flat seven of ', ...keyName(from), ' on top. In a blues it needs no resolving.']
			: ['A blues four chord: a dominant seventh that colours the key rather than leading anywhere. Its seventh is a blue note.'];
	return semis === 0
		? ['Home turned major, with a flat seven: a bluesy colour that wants to move on.']
		: ['A major four with a flat seven: the Dorian and blues colour in a minor key.'];
}

function chromaticText(r: Read, semis: number, key: KeyInfo, n: Read | null): Part[] {
	if ((r.core === 'min' || r.core === 'halfdim') && n && (n.core === 'dom' || n.core === 'maj') && mod12(n.chroma - r.chroma) === 5)
		return ['Outside the key, it works as the ', N('ii'), ' of the next chord: a ', N('ii'), '–', N('V'), ' aimed somewhere new.'];
	if (r.core === 'dim' && n && n.chroma === r.chroma)
		return ["A diminished chord on the next chord's root: it decorates that chord just before it arrives."];
	if (r.core === 'aug') return ['Augmented: its raised fifth is a note from outside the key, pushing upward.'];
	if (diatonicQuality(semis, key.mode))
		return ['Its root is in ', ...keyName(key), ", but this quality isn't: a colour from outside the key."];
	return ['Its root is outside ', ...keyName(key), ': a colour from outside the key.'];
}

/**
 * Explain one chord in a key, reading where it goes (`next`, a concert symbol,
 * or nothing when a rest or the end follows). Null for a rest or a symbol that
 * doesn't parse.
 *
 * The checks run in order, and the order is the analysis:
 * 1. diatonic (by core quality; minor adds V, V7 and vii°7);
 * 2. a dominant seventh falling a fifth → secondary dominant, whatever it lands
 *    on (E♭7 → A♭ is V7/♭VI); a plain major triad only when it lands on a
 *    diatonic chord, so the borrowed E♭ → A♭ stays borrowed;
 * 3. a dominant seventh sliding down a half step → tritone sub;
 * 4. ♭VII7 → I in major → the backdoor (borrowed);
 * 5. diminished, a half step from the next root → passing (named by its target:
 *    the chart would print C♯°7 as ♭ii°7);
 * 6. on the parallel key's scale → borrowed;
 * 7. I7 / IV7 leading nowhere → the blues' dominants (borrowed, by their ♭7 or ♭3);
 * 8. a dominant shape that points at a diatonic degree but goes elsewhere →
 *    secondary dominant, unresolved;
 * 9. anything else → chromatic.
 */
export function explainChord(symbol: string, key: KeyInfo, next?: string | null): ChordExplanation | null {
	const r = read(symbol);
	if (!r) return null;
	const nextSymbol = next?.trim() ? next.trim() : null;
	const n = nextSymbol ? read(nextSymbol) : null;
	const nextSym = n ? nextSymbol : null;
	const tonic = tonicChroma(key);
	const semis = mod12(r.chroma - tonic);
	const numeral = numeralOf(symbol, key);
	const parallel: KeyInfo = { tonic: key.tonic, mode: otherMode(key.mode) };

	const base: Omit<ChordExplanation, 'role' | 'text'> = {
		numeral,
		fn: numeral,
		target: null,
		resolves: false,
		backdoor: false,
		from: null
	};
	const make = (role: HarmonyRole, text: Part[], extra: Partial<ChordExplanation> = {}): ChordExplanation => ({
		...base,
		role,
		text,
		...extra
	});

	const dominant = r.core === 'dom' || (r.core === 'sus' && r.seventh === '7');
	const majorTriad = r.core === 'maj' && r.seventh === '';
	const fallsFifth = !!n && mod12(n.chroma - r.chroma) === 5;
	const fallsHalf = !!n && mod12(n.chroma - r.chroma) === 11;
	const risesHalf = !!n && mod12(n.chroma - r.chroma) === 1;
	const nextFits = !!n && fits(n, mod12(n.chroma - tonic), key.mode, true);

	/** A secondary dominant pointing at the degree a fifth below. */
	const secondary = (resolves: boolean): ChordExplanation | null => {
		const target = targetNumeral(semis + 5, key, resolves ? nextSym : null);
		if (!target) return null;
		const targetRoot = NOTE_NAMES[mod12(r.chroma + 5)];
		const fn = numeralOf(symbol, { tonic: targetRoot, mode: 'major' });
		const text: Part[] = resolves
			? ['Borrows the pull of a dominant to make ', N(target), ' sound like home for a moment.']
			: n
				? ['Sets up ', N(target), ' the way a dominant would, then the song goes somewhere else.']
				: ['Sets up ', N(target), ' the way a dominant would. Here nothing follows it.'];
		return make('secondary-dominant', text, { fn, target, resolves });
	};

	// 1. In the key. (A sus seventh falling a fifth is a dominant first: D7sus4 → G
	// in C is V7/V, though all its notes are in C.)
	if (!(dominant && r.core === 'sus' && fallsFifth && semis !== 7) && fits(r, semis, key.mode, key.mode === 'minor'))
		return make('diatonic', diatonicText(r, semis, key.mode));

	// 2. Secondary dominant, resolved.
	if (fallsFifth && (dominant || (majorTriad && nextFits))) {
		const ex = secondary(true);
		if (ex) return ex;
	}

	// 3. Tritone sub: the dominant a tritone from the usual one, sliding down.
	if (r.core === 'dom' && fallsHalf && nextSym) {
		const target = targetNumeral(semis - 1, key, nextSym);
		if (target)
			return make(
				'tritone-sub',
				[
					'Stands in for the dominant of ',
					N(target),
					', a tritone away. It keeps the same two tension notes, and its root slides down a half step instead of falling a fifth.'
				],
				{ fn: 'subV', target, resolves: true }
			);
	}

	// 4. The backdoor: ♭VII7 → I.
	if (key.mode === 'major' && r.core === 'dom' && semis === 10 && n && n.chroma === tonic)
		return make(
			'borrowed',
			['The backdoor dominant: borrowed from ', ...keyName(parallel), ', it slips into ', N('I'), ' from a whole step below instead of from ', N('V'), '.'],
			{ target: triadNumeral(nextSym!, key), resolves: true, backdoor: true, from: parallel }
		);

	// 5. Passing diminished, named by where it goes.
	if (r.core === 'dim' && (risesHalf || fallsHalf) && nextSym) {
		const target = targetNumeral(mod12(n!.chroma - tonic), key, nextSym)!;
		const text: Part[] = risesHalf
			? ['A passing chord: it sits a half step below ', N(target), ' and slides straight into it.']
			: ['A passing chord: it sits a half step above ', N(target), ' and slides down into it.'];
		return make('passing-dim', text, { target, resolves: true });
	}

	// 6. Borrowed from the parallel key (the minor's harmonic chords count: vii°7 in major).
	if (fits(r, semis, parallel.mode, parallel.mode === 'minor'))
		return make('borrowed', borrowedText(r, semis, key, parallel), { from: parallel });

	// 7. The blues' I7 and IV7.
	if (r.core === 'dom' && (semis === 0 || semis === 5))
		return make('borrowed', bluesText(semis, key, parallel), { from: parallel });

	// 8. A dominant that points at a diatonic degree but goes elsewhere.
	if ((dominant || majorTriad) && tonicizable(mod12(semis + 5), key.mode) && mod12(semis + 5) !== 0) {
		const ex = secondary(false);
		if (ex) return ex;
	}

	return make('chromatic', chromaticText(r, semis, key, n));
}

/**
 * Explain every chord change of a song. `loop` reads the song as a repeating
 * form, as Vamp plays it: the last chord leads back into the first, unless a
 * rest sits at the seam. Slot and bar indices are GLOBAL (flattenSlots over
 * `bars`), so pass the whole song's bars to light the editor's slots.
 */
export function explainSong(bars: Bar[], key: KeyInfo, opts: { loop?: boolean } = {}): ExplainedChange[] {
	const changes = collapseChanges(bars);
	if (changes.length === 0) return [];
	const totalSlots = flattenSlots(bars).length;
	const first = changes[0];
	const last = changes[changes.length - 1];
	// No rest before the first chord or after the last one.
	const seamless = first.startSlot === 0 && last.endSlot === totalSlots - 1;

	const out: ExplainedChange[] = [];
	changes.forEach((change, i) => {
		let next: Change | null = changes[i + 1] ?? null;
		if (next && next.seg !== change.seg) next = null;
		if (!next && i === changes.length - 1 && opts.loop && seamless && changes.length > 1) next = first;
		const ex = explainChord(change.symbol, key, next?.symbol ?? null);
		if (ex) out.push({ ...ex, change, next });
	});
	return out;
}

/** The label as plain text: 'V7/ii', 'subV/I', 'passing into ii', or the numeral. */
export function labelText(ex: ChordExplanation): string {
	if (ex.role === 'passing-dim') return `passing into ${ex.target}`;
	if ((ex.role === 'secondary-dominant' || ex.role === 'tritone-sub') && ex.target) return `${ex.fn}/${ex.target}`;
	return ex.fn;
}

/** The label as a screen reader should say it ('five seven of two minor'). */
export function spokenLabel(ex: ChordExplanation): string {
	if (ex.role === 'passing-dim' && ex.target) return `passing into ${spokenNumeral(ex.target)}`;
	if (ex.role === 'tritone-sub' && ex.target) return `tritone sub for the five of ${spokenNumeral(ex.target)}`;
	if (ex.role === 'secondary-dominant' && ex.target) return `${spokenNumeral(ex.fn)} of ${spokenNumeral(ex.target)}`;
	return spokenNumeral(ex.fn);
}

/** A sentence as plain text, numerals in ASCII and notes in concert pitch (tests, titles). */
export function plainText(parts: Part[]): string {
	return parts.map((p) => (typeof p === 'string' ? p : 'numeral' in p ? p.numeral : p.note)).join('');
}

/** What a role is called, for the row's small print. */
export const ROLE_NAMES: Record<HarmonyRole, string> = {
	diatonic: 'In the key',
	'secondary-dominant': 'Secondary dominant',
	borrowed: 'Borrowed',
	'tritone-sub': 'Tritone sub',
	'passing-dim': 'Passing',
	chromatic: 'Outside the key'
};
