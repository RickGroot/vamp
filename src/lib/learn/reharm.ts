// The reharm lab's moves: pure transforms that add or swap one chord of a song,
// and `findReharms`, which says where in the song each move applies.
//
// The moves (the jazz and classical tables in docs/learning-research.md):
// - ii–V: the dominant's own ii in front of it;
// - secondary dominant: a V7 in front of any major, minor or dominant chord;
// - tritone sub: a dominant swapped for the one a tritone away (it must
//   resolve, so the sub can slide down a half step);
// - backdoor: ♭VII7 into I (major keys);
// - borrowed iv: the IV turned minor, from the parallel minor (major keys);
// - passing diminished: a dim7 filling a rising whole step (I–♯I°7–ii).
//
// Rules every move keeps:
// - the bar count and each bar's beats never change. A new chord takes part of
//   a chord's time (the slots on one side of the boundary nearest its middle,
//   or one slot split in two halves of at least a beat), or replaces a chord
//   outright. A bar never holds more than MAX_SLOTS_PER_BAR slots;
// - chords are the literal CONCERT symbols, read with tonal and never cached;
//   every generated root is Note.simplify'd and every symbol must pass
//   isValidChordSymbol, or the move isn't offered;
// - a move is offered only where it does something (no ii in front of a V
//   that already has one, no V7 in front of a chord a dominant already leads to).
//
// Songs are read as their chord CHANGES (analysis.ts collapseChanges), like
// harmony.ts: neighbours never cross a rest, and with `loop` the last chord leads
// into the first unless a rest sits at the seam, which is how Vamp plays a song.
// Slot and bar indices are those of the bars passed in (the lab passes loopBars,
// so the caller adds the loop's start back before writing to the song).
//
// Pure: tonal + model siblings only, never persisted.

import { Chord, Note } from 'tonal';
import { isValidChordSymbol } from '$lib/audio/chord';
import { chordCore, collapseChanges, type Change, type CoreQuality } from '$lib/model/analysis';
import { createSlot, MAX_SLOTS_PER_BAR } from '$lib/model/factory';
import type { Part } from '$lib/model/harmony';
import type { KeyInfo } from '$lib/model/key';
import { numeralOf } from '$lib/model/numerals';
import { flattenSlots } from '$lib/model/slots';
import type { Bar, Slot } from '$lib/model/types';

export type ReharmKind = 'ii-v' | 'secondary' | 'tritone' | 'backdoor' | 'borrowed-iv' | 'passing-dim';

/** The order the lab lists the moves in. */
export const REHARM_KINDS: ReharmKind[] = ['ii-v', 'secondary', 'tritone', 'backdoor', 'borrowed-iv', 'passing-dim'];

export interface Reharm {
	/** `<kind>:<slot>`: unique within one reading of a song. */
	id: string;
	kind: ReharmKind;
	/** The chord the move adds or swaps in (concert). */
	chord: string;
	/** Inserted into part of a chord's time, or replacing a chord outright. */
	how: 'insert' | 'replace';
	/** The chord whose time it takes, or which it replaces. */
	host: Change;
	/** The chord the move is FOR: the V for a ii–V, x for V7/x, the dominant for a sub. */
	about: Change;
	/** The host's chord changes before and after (concert), for a one-line summary. */
	before: string[];
	after: string[];
	/** The bars the move touches (the host's), inclusive. Same indices as the input. */
	startBar: number;
	endBar: number;
	/** The whole song reharmonised: same bar count, same beats per bar. */
	bars: Bar[];
	/** Global slot indices (flattenSlots over `bars`) that hold the new chord. */
	slots: number[];
	/**
	 * The bars to play for A/B, in order: the touched bars, the chord they lead
	 * to, and context around them, up to WINDOW_BARS. May wrap round a loop.
	 */
	window: number[];
	/** One original sentence saying what changed. */
	text: Part[];
}

export interface ReharmOptions {
	/** Read the song as a loop: the last chord leads into the first. */
	loop?: boolean;
}

/** How many bars the lab plays for one A/B comparison, at most (unless the move itself is longer). */
export const WINDOW_BARS = 4;

/** The shortest part a split may leave either chord, in beats of the meter. */
const MIN_BEATS = 1;
const EPS = 1e-9;

const mod12 = (n: number) => ((n % 12) + 12) % 12;
const N = (numeral: string): Part => ({ numeral });

// ---- what a move is called, and what it does -----------------------------

/** A move's name, as parts (numerals are drawn, never uppercased). */
export const KIND_NAMES: Record<ReharmKind, Part[]> = {
	'ii-v': [N('ii'), '–', N('V')],
	secondary: ['Secondary dominant'],
	tritone: ['Tritone sub'],
	backdoor: ['Backdoor ', N('bVII7')],
	'borrowed-iv': ['Borrowed ', N('iv')],
	'passing-dim': ['Passing diminished']
};

/** What a move does, in general: one line for the list. */
export const KIND_ABOUT: Record<ReharmKind, Part[]> = {
	'ii-v': ['Put a dominant’s own ', N('ii'), ' in front of it, so the roots fall by fifths.'],
	secondary: ['Put a dominant seventh in front of a chord, so it sounds like home for a moment.'],
	tritone: ['Swap a dominant for the one a tritone away: the same tension, a bass that slides.'],
	backdoor: ['Reach ', N('I'), ' from a whole step below, with a dominant borrowed from the minor key.'],
	'borrowed-iv': ['Turn ', N('IV'), ' minor, borrowing it from the minor key on the same home note.'],
	'passing-dim': ['Fill a rising whole step with a diminished chord, so the bass climbs by half steps.']
};

// ---- reading chords ---------------------------------------------------------

interface Info {
	/** The root as written ('C', 'F#'). */
	root: string;
	chroma: number;
	core: CoreQuality;
	seventh: '' | '7' | 'maj7' | 'dim7';
	sixth: boolean;
}

function info(symbol: string): Info | null {
	const core = chordCore(symbol);
	if (!core) return null;
	const chord = Chord.get(symbol.trim());
	if (!chord.tonic) return null;
	const has = (iv: string) => chord.intervals.includes(iv);
	return {
		root: chord.tonic,
		...core,
		seventh: has('7m') ? '7' : has('7M') ? 'maj7' : has('7d') ? 'dim7' : '',
		sixth: has('6M')
	};
}

/** A dominant seventh, or a seventh with its third suspended (G7sus4). */
const dominantShaped = (c: Info) => c.core === 'dom' || (c.core === 'sus' && c.seventh === '7');
const majorTriad = (c: Info) => c.core === 'maj' && c.seventh === '';
/** A chord a dominant can point at: it has a third and a perfect fifth. */
const tonicizable = (c: Info) => c.core === 'maj' || c.core === 'min' || c.core === 'dom';

/** A chord on `root` moved by `interval`, spelled simply; null unless tonal reads it. */
function build(root: string, interval: string, suffix: string): string | null {
	const r = Note.simplify(Note.transpose(root, interval));
	if (!r) return null;
	const symbol = `${r}${suffix}`;
	return isValidChordSymbol(symbol) ? symbol : null;
}

// ---- the song as changes ------------------------------------------------------

interface Reading {
	changes: Change[];
	infos: Info[];
	/** The change before / after, within a phrase; round the seam of a loop. */
	prev: (i: number) => number | null;
	next: (i: number) => number | null;
	/** The last chord leads into the first. */
	wraps: boolean;
}

function readSong(bars: Bar[], loop: boolean): Reading {
	const changes = collapseChanges(bars);
	const infos = changes.map((c) => info(c.symbol)!);
	const n = changes.length;
	const totalSlots = flattenSlots(bars).length;
	// No rest before the first chord or after the last one (as explainSong).
	const wraps = loop && n > 1 && changes[0].startSlot === 0 && changes[n - 1].endSlot === totalSlots - 1;
	return {
		changes,
		infos,
		wraps,
		prev: (i) => (i > 0 && changes[i - 1].seg === changes[i].seg ? i - 1 : i === 0 && wraps ? n - 1 : null),
		next: (i) => (i < n - 1 && changes[i + 1].seg === changes[i].seg ? i + 1 : i === n - 1 && wraps ? 0 : null)
	};
}

// ---- the two edits ----------------------------------------------------------

interface Edit {
	bars: Bar[];
	/** The slots holding the new chord, as objects of `bars`. */
	marked: Slot[];
}

const copyBars = (bars: Bar[]): Bar[] =>
	bars.map((b) => ({ id: b.id, slots: b.slots.map((s) => ({ id: s.id, chord: s.chord, beats: s.beats })) }));

/**
 * Give part of a change's time to a new chord: its `start` or its `end`.
 * Several slots: the slots on one side of the slot boundary nearest the middle
 * take the new chord (a tie gives it the shorter part). One slot: it is split
 * in two halves, if its bar has room for another slot and each half is at least
 * a beat. Null when there is no room.
 */
export function splitChange(bars: Bar[], change: Change, symbol: string, side: 'start' | 'end'): Edit | null {
	const out = copyBars(bars);
	const span = flattenSlots(out).slice(change.startSlot, change.endSlot + 1);
	if (span.length === 0) return null;

	if (span.length > 1) {
		const total = span.reduce((sum, f) => sum + f.slot.beats, 0);
		let best = 0;
		let bestDist = Infinity;
		let bestShare = Infinity;
		let acc = 0;
		for (let k = 0; k < span.length - 1; k++) {
			acc += span[k].slot.beats;
			const dist = Math.abs(acc - total / 2);
			const share = side === 'start' ? acc : total - acc;
			if (dist < bestDist - EPS || (Math.abs(dist - bestDist) <= EPS && share < bestShare)) {
				best = k;
				bestDist = dist;
				bestShare = share;
			}
		}
		const taken = side === 'start' ? span.slice(0, best + 1) : span.slice(best + 1);
		for (const f of taken) f.slot.chord = symbol;
		return { bars: out, marked: taken.map((f) => f.slot) };
	}

	const [f] = span;
	const bar = out[f.barIndex];
	const half = f.slot.beats / 2;
	if (bar.slots.length >= MAX_SLOTS_PER_BAR || !(half >= MIN_BEATS)) return null;
	const added = createSlot(symbol, half);
	f.slot.beats = half;
	bar.slots.splice(f.indexInBar + (side === 'start' ? 0 : 1), 0, added);
	return { bars: out, marked: [added] };
}

/** Swap every slot of a change for a new chord. */
export function replaceChange(bars: Bar[], change: Change, symbol: string): Edit {
	const out = copyBars(bars);
	const span = flattenSlots(out).slice(change.startSlot, change.endSlot + 1);
	for (const f of span) f.slot.chord = symbol;
	return { bars: out, marked: span.map((f) => f.slot) };
}

// ---- the moves ----------------------------------------------------------------

interface Move {
	host: number;
	about: number;
	/** The chord the A/B window should land on (null: nothing follows). */
	lands: number | null;
	symbol: string;
	edit: Edit;
	how: Reharm['how'];
	text: Part[];
}

type Finder = (song: Reading, i: number, bars: Bar[], key: KeyInfo) => Move | null;

const tonicChroma = (key: KeyInfo) => mod12(Note.chroma(key.tonic) ?? 0);
const parallelMinor = (key: KeyInfo): Part[] => [{ note: key.tonic }, ' minor'];

/** ii–V: the dominant's own ii takes the first part of the dominant's time. */
const twoFive: Finder = (song, i, bars, key) => {
	const v = song.infos[i];
	const semis = mod12(v.chroma - tonicChroma(key));
	if (!(dominantShaped(v) || (majorTriad(v) && semis === 7))) return null;
	const p = song.prev(i);
	// Its ii's root is already in front of it (as ii, or as II7: V7/V).
	if (p !== null && mod12(song.infos[p].chroma - v.chroma) === 7) return null;
	const n = song.next(i);
	const t = n !== null ? song.infos[n] : null;
	const resolves = !!t && mod12(t.chroma - v.chroma) === 5;
	// Into a minor chord, the minor ii–V: iiø7.
	const minor = resolves ? t!.core === 'min' : key.mode === 'minor' && semis === 7;
	const symbol = build(v.root, '5P', minor ? 'm7b5' : 'm7');
	if (!symbol) return null;
	const edit = splitChange(bars, song.changes[i], symbol, 'start');
	if (!edit) return null;
	const vNum = numeralOf(song.changes[i].symbol, key);
	return {
		host: i,
		about: i,
		lands: resolves ? n : null,
		symbol,
		edit,
		how: 'insert',
		text: [
			N(numeralOf(symbol, key)),
			' now comes before ',
			N(vNum),
			': it is that dominant’s own ',
			N(minor ? 'iiø7' : 'ii'),
			', so the roots fall by fifths',
			...(resolves ? [' into ', N(numeralOf(song.changes[n!].symbol, key))] : []),
			'.'
		]
	};
};

/** V7/x: a dominant seventh a fifth above x, in the last part of the chord before it. */
const secondary: Finder = (song, i, bars, key) => {
	const x = song.infos[i];
	if (!tonicizable(x)) return null;
	const p = song.prev(i);
	if (p === null) return null;
	const before = song.infos[p];
	const gap = mod12(before.chroma - x.chroma);
	const home = mod12(x.chroma - tonicChroma(key)) === 0;
	// A dominant already leads into it: its V7 (or Vsus), its tritone sub, the
	// backdoor, or (into home) the key's own V. A major chord a fifth above any
	// other chord still takes one: I → IV becomes I, I7 → IV.
	if (gap === 7 && (before.core === 'dom' || before.core === 'sus' || (before.core === 'maj' && home))) return null;
	if ((gap === 1 || gap === 10) && before.core === 'dom') return null;
	const symbol = build(x.root, '5P', '7');
	if (!symbol) return null;
	const edit = splitChange(bars, song.changes[p], symbol, 'end');
	if (!edit) return null;
	const dom = N(numeralOf(symbol, key));
	const xNum = N(numeralOf(song.changes[i].symbol, key));
	return {
		host: p,
		about: i,
		lands: i,
		symbol,
		edit,
		how: 'insert',
		text: home
			? [dom, ' now comes before ', xNum, ': the key’s own dominant, so home arrives with a full cadence.']
			: [dom, ' now comes before ', xNum, ': it is the dominant of ', xNum, ', so ', xNum, ' sounds like home for a moment.']
	};
};

/** subV: a resolving dominant swapped for the dominant a tritone away. */
const tritone: Finder = (song, i, bars, key) => {
	const v = song.infos[i];
	const semis = mod12(v.chroma - tonicChroma(key));
	if (!(v.core === 'dom' || (majorTriad(v) && semis === 7))) return null;
	const n = song.next(i);
	if (n === null || mod12(song.infos[n].chroma - v.chroma) !== 5) return null;
	const symbol = build(v.root, '5d', '7');
	if (!symbol) return null;
	const edit = replaceChange(bars, song.changes[i], symbol);
	return {
		host: i,
		about: i,
		lands: n,
		symbol,
		edit,
		how: 'replace',
		text: [
			N(numeralOf(symbol, key)),
			' replaces ',
			N(numeralOf(song.changes[i].symbol, key)),
			': the same two tension notes over a root a tritone away, so the bass slides down a half step into ',
			N(numeralOf(song.changes[n].symbol, key)),
			'.'
		]
	};
};

/**
 * ♭VII7 → I, in a major key. It replaces the chord that leads into I when that
 * is a dominant (the front door: V, or its tritone sub) or already sits on ♭VII;
 * otherwise it takes the last part of that chord's time.
 */
const backdoor: Finder = (song, i, bars, key) => {
	if (key.mode !== 'major') return null;
	const tonic = tonicChroma(key);
	const x = song.infos[i];
	if (mod12(x.chroma - tonic) !== 0 || x.core !== 'maj') return null;
	const p = song.prev(i);
	if (p === null) return null;
	const before = song.infos[p];
	const at = mod12(before.chroma - tonic);
	if (at === 10 && before.core === 'dom') return null; // already the backdoor
	const symbol = build(x.root, '7m', '7');
	if (!symbol) return null;
	const replace =
		(at === 7 && (before.core === 'maj' || before.core === 'sus' || before.core === 'dom')) ||
		(at === 1 && before.core === 'dom') ||
		at === 10;
	const edit = replace ? replaceChange(bars, song.changes[p], symbol) : splitChange(bars, song.changes[p], symbol, 'end');
	if (!edit) return null;
	const b7 = N(numeralOf(symbol, key));
	const xNum = N(numeralOf(song.changes[i].symbol, key));
	return {
		host: p,
		about: i,
		lands: i,
		symbol,
		edit,
		how: replace ? 'replace' : 'insert',
		text: replace
			? [b7, ' replaces ', N(numeralOf(song.changes[p].symbol, key)), ': borrowed from ', ...parallelMinor(key), ', it reaches ', xNum, ' from a whole step below, the same landing through another door.']
			: [b7, ' now comes before ', xNum, ': borrowed from ', ...parallelMinor(key), ', it reaches home from a whole step below instead of from ', N('V'), '.']
	};
};

/** iv for IV, in a major key: the second part of the IV turns minor (or all of it, when it can't split). */
const borrowedFour: Finder = (song, i, bars, key) => {
	if (key.mode !== 'major') return null;
	const four = song.infos[i];
	if (mod12(four.chroma - tonicChroma(key)) !== 5 || four.core !== 'maj') return null;
	const n = song.next(i);
	if (n !== null && song.infos[n].chroma === four.chroma) return null; // the iv already follows
	const symbol = build(four.root, '1P', four.seventh ? 'm7' : four.sixth ? 'm6' : 'm');
	if (!symbol) return null;
	const split = splitChange(bars, song.changes[i], symbol, 'end');
	const edit = split ?? replaceChange(bars, song.changes[i], symbol);
	const fourNum = N(numeralOf(song.changes[i].symbol, key));
	const ivNum = N(numeralOf(symbol, key));
	const onward: Part[] = n !== null ? [' before ', N(numeralOf(song.changes[n].symbol, key))] : [];
	return {
		host: i,
		about: i,
		lands: n,
		symbol,
		edit,
		how: split ? 'insert' : 'replace',
		text: split
			? [fourNum, ' turns into ', ivNum, ' halfway through: borrowed from ', ...parallelMinor(key), ', its minor third casts a shadow', ...onward, '.']
			: [ivNum, ' replaces ', fourNum, ': the same root with a minor third, borrowed from ', ...parallelMinor(key), ', a darker colour', ...onward, '.']
	};
};

/** A dim7 a half step below the next chord, in the last part of a chord a whole step below it. */
const passingDim: Finder = (song, i, bars, key) => {
	const x = song.infos[i];
	if (!tonicizable(x)) return null;
	const n = song.next(i);
	if (n === null) return null;
	const y = song.infos[n];
	if (mod12(y.chroma - x.chroma) !== 2 || !(y.core === 'maj' || y.core === 'min')) return null;
	const symbol = build(y.root, '-2m', 'dim7');
	if (!symbol) return null;
	const edit = splitChange(bars, song.changes[i], symbol, 'end');
	if (!edit) return null;
	const yNum = N(numeralOf(song.changes[n].symbol, key));
	return {
		host: i,
		about: n,
		lands: n,
		symbol,
		edit,
		how: 'insert',
		text: [
			'A diminished chord now sits between ',
			N(numeralOf(song.changes[i].symbol, key)),
			' and ',
			yNum,
			': a half step below ',
			yNum,
			', it lets the bass climb by half steps.'
		]
	};
};

const FINDERS: Record<ReharmKind, Finder> = {
	'ii-v': twoFive,
	secondary,
	tritone,
	backdoor,
	'borrowed-iv': borrowedFour,
	'passing-dim': passingDim
};

// ---- the A/B window -----------------------------------------------------------

/**
 * The bars to hear a move in: the core (touched bars, then the bar it lands
 * in), grown a bar before, a bar after, … up to WINDOW_BARS. Round the seam of
 * a loop when the song wraps. A window that takes in every bar is the song
 * itself, in order.
 */
function windowFor(n: number, core: number[], wraps: boolean): number[] {
	const win: number[] = [];
	for (const b of core) if (!win.includes(b)) win.push(b);
	let before = true;
	let blocked = 0;
	while (win.length < WINDOW_BARS && win.length < n && blocked < 2) {
		const edge = before ? win[0] - 1 : win[win.length - 1] + 1;
		const idx = wraps ? (edge + n) % n : edge;
		if (idx < 0 || idx >= n || win.includes(idx)) blocked++;
		else {
			blocked = 0;
			if (before) win.unshift(idx);
			else win.push(idx);
		}
		before = !before;
	}
	return win.length === n ? Array.from({ length: n }, (_, k) => k) : win;
}

// ---- finding them all ---------------------------------------------------------

/** The chord changes of some slots, with repeats merged (for a summary line). */
function changesIn(bars: Bar[], startBar: number, endBar: number): string[] {
	const out: string[] = [];
	for (let b = startBar; b <= endBar; b++)
		for (const slot of bars[b]?.slots ?? []) {
			const s = slot.chord.trim();
			if (out[out.length - 1] !== s) out.push(s);
		}
	return out;
}

/** Try one move on one chord change (index into collapseChanges(bars)). */
export function reharmAt(
	kind: ReharmKind,
	bars: Bar[],
	key: KeyInfo,
	changeIndex: number,
	opts: ReharmOptions = {}
): Reharm | null {
	const song = readSong(bars, opts.loop ?? false);
	return song.changes[changeIndex] ? make(kind, song, changeIndex, bars, key) : null;
}

function make(kind: ReharmKind, song: Reading, i: number, bars: Bar[], key: KeyInfo): Reharm | null {
	const move = FINDERS[kind](song, i, bars, key);
	if (!move) return null;
	const host = song.changes[move.host];
	const marked = new Set(move.edit.marked);
	const slots = flattenSlots(move.edit.bars)
		.filter((f) => marked.has(f.slot))
		.map((f) => f.globalIndex);
	const core: number[] = [];
	for (let b = host.startBar; b <= host.endBar; b++) core.push(b);
	if (move.lands !== null) core.push(song.changes[move.lands].startBar);
	return {
		id: `${kind}:${song.changes[move.about].startSlot}`,
		kind,
		chord: move.symbol,
		how: move.how,
		host,
		about: song.changes[move.about],
		before: changesIn(bars, host.startBar, host.endBar),
		after: changesIn(move.edit.bars, host.startBar, host.endBar),
		startBar: host.startBar,
		endBar: host.endBar,
		bars: move.edit.bars,
		slots,
		window: windowFor(bars.length, core, song.wraps),
		text: move.text
	};
}

/**
 * Every move the song allows, in REHARM_KINDS order, then by where the change
 * lands (the host's position: a V7 put in front of the first chord of a loop
 * lands in its last bar). Each is one chord added or swapped against the song
 * as it is now; nothing is offered where a move would change nothing.
 */
export function findReharms(bars: Bar[], key: KeyInfo, opts: ReharmOptions = {}): Reharm[] {
	const song = readSong(bars, opts.loop ?? false);
	const out: Reharm[] = [];
	for (const kind of REHARM_KINDS) {
		const found: Reharm[] = [];
		for (let i = 0; i < song.changes.length; i++) {
			const r = make(kind, song, i, bars, key);
			if (r) found.push(r);
		}
		out.push(...found.sort((a, b) => a.host.startSlot - b.host.startSlot || a.about.startSlot - b.about.startSlot));
	}
	return out;
}
