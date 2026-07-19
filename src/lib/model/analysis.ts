// Progression recognition: detect named chord progressions (ii–V–I, 12-bar
// blues, pop loops, cadences, …) in the sketched bars and describe them.
//
// Matching works on the COLLAPSED chord-change sequence (consecutive slots with
// the same root + core quality merge), with chords reduced to 7 core-quality
// buckets (Gmaj9 → maj, D13 → dom) so decorated symbols still match. Every
// pattern is SELF-ANCHORED: its first step pins a local tonic, so a ii–V–I in a
// foreign key mid-song is caught for free; the single global key only NAMES the
// relationship ("in G — the V of C major"). Rests and unparseable symbols act
// as phrase boundaries a match can never cross.
//
// V1 limitations (deliberate): slash basses are ignored (C/E matches as C, so a
// pedal-point G/C reads as G); no half cadence (needs a wildcard step); no
// duration weighting (only the blues carries a slot-span guard); power chords
// (C5) classify as sus; I–IV–V is deliberately absent (too generic to name).
//
// Pure module: tonal + model siblings only — no tone, no stores, never persisted.

import { Chord, Note } from 'tonal';
import type { Bar } from './types';
import { flattenSlots } from './slots';
import { NOTE_NAMES, NUMERALS, type KeyInfo } from './key';

export type CoreQuality = 'maj' | 'min' | 'dom' | 'dim' | 'halfdim' | 'aug' | 'sus';

/** One run of consecutive slots sharing a root + core quality. */
export interface Change {
	chroma: number;
	core: CoreQuality;
	/** First symbol of the run, concert pitch, trimmed. */
	symbol: string;
	/** Global flattenSlots indices, inclusive. */
	startSlot: number;
	endSlot: number;
	/** Bar indices, inclusive. */
	startBar: number;
	endBar: number;
	/** Rest/invalid slots split segments; matches never cross segments. */
	seg: number;
}

/** A recognised progression instance. */
export interface Detection {
	patternId: string;
	name: string;
	formula: string;
	/** Flat-spelled concert tonic of the matched pattern (render via displayChord). */
	localTonic: string;
	/** Numeral of localTonic relative to the global key, or null when it IS the key. */
	relation: string | null;
	/** One matched concert symbol per change in the window. */
	chords: string[];
	startSlot: number;
	endSlot: number;
	startBar: number;
	endBar: number;
	/** Back-to-back repetitions merged into this detection (>= 1). */
	repeats: number;
	blurb: string;
	why: string;
	listen: string;
}

const mod12 = (n: number) => ((n % 12) + 12) % 12;

/**
 * Reduce a chord symbol to (root pitch class, core quality), or null for
 * rests/unparseable text. Branch ORDER is load-bearing: 5d before 3m
 * (dim/halfdim), sus before dom (G7sus4 stays sus), dom before aug (C7#5 is
 * dominant).
 */
export function chordCore(symbol: string): { chroma: number; core: CoreQuality } | null {
	const t = symbol.trim();
	if (t === '') return null;
	const c = Chord.get(t);
	if (c.empty || !c.tonic) return null;
	const chroma = Note.chroma(c.tonic);
	if (chroma == null) return null; // exotic tonics tonal parses but can't chroma
	const has = (iv: string) => c.intervals.includes(iv);
	let core: CoreQuality;
	if (has('5d')) core = has('7m') ? 'halfdim' : 'dim';
	else if (has('3m')) core = 'min';
	else if (!has('3M')) core = 'sus';
	else if (has('7m')) core = 'dom';
	else if (has('5A')) core = 'aug';
	else core = 'maj';
	return { chroma: mod12(chroma), core };
}

/** Collapse the flattened slots into the chord-change sequence. */
export function collapseChanges(bars: Bar[]): Change[] {
	const out: Change[] = [];
	let seg = 0;
	for (const f of flattenSlots(bars)) {
		const core = chordCore(f.slot.chord);
		if (!core) {
			seg++; // every boundary slot bumps; only equality matters
			continue;
		}
		const last = out[out.length - 1];
		if (last && last.seg === seg && last.chroma === core.chroma && last.core === core.core) {
			last.endSlot = f.globalIndex;
			last.endBar = f.barIndex;
		} else {
			out.push({
				...core,
				symbol: f.slot.chord.trim(),
				startSlot: f.globalIndex,
				endSlot: f.globalIndex,
				startBar: f.barIndex,
				endBar: f.barIndex,
				seg
			});
		}
	}
	return out;
}

// ---- pattern dictionary ----------------------------------------------------

interface PatternStep {
	/** Semitones above the pattern's (self-anchored) local tonic. */
	deg: number;
	cores: CoreQuality[];
}

interface PatternVariant {
	steps: PatternStep[];
	formula: string;
}

interface PatternDef {
	id: string;
	name: string;
	variants: PatternVariant[];
	/** 'end': only matches when it closes the song (cadences). */
	anchor?: 'end';
	/** Minimum raw slot span (blues only — a 6-slot toy isn't a 12-bar form). */
	minSlots?: number;
	blurb: string;
	why: string;
	listen: string;
}

const s = (deg: number, ...cores: CoreQuality[]): PatternStep => ({ deg, cores });

/** Array order = suppression priority for identical spans. */
const PATTERNS: PatternDef[] = [
	{
		id: 'blues12',
		name: '12-bar blues',
		minSlots: 8,
		variants: [
			{
				steps: [0, 5, 0, 5, 0, 7, 5, 0, 7].map((d) => s(d, 'dom', 'maj')),
				formula: 'I7–IV7–I7 (quick change)–V7–IV7–I7–V7'
			},
			{
				steps: [0, 5, 0, 7, 5, 0, 7].map((d) => s(d, 'dom', 'maj')),
				formula: 'I7–IV7–I7–V7–IV7–I7–V7'
			},
			{
				steps: [0, 5, 0, 7, 5, 0].map((d) => s(d, 'dom', 'maj')),
				formula: 'I7–IV7–I7–V7–IV7–I7'
			}
		],
		blurb: 'The 12-bar blues — the most-played form in popular music.',
		why: 'All three chords are dominant 7ths, so nothing ever fully resolves; those ♭7s are the blue notes.',
		listen: 'Loop the whole form, set drums to swing, and solo with the minor pentatonic of the I over everything.'
	},
	{
		id: 'canon',
		name: 'Canon',
		variants: [
			{
				steps: [
					s(0, 'maj'), s(7, 'maj', 'dom'), s(9, 'min'), s(4, 'min'),
					s(5, 'maj'), s(0, 'maj'), s(5, 'maj'), s(7, 'maj', 'dom')
				],
				formula: 'I–V–vi–iii–IV–I–IV–V'
			}
		],
		blurb: 'The Canon changes — a sequence harmonising a stepwise falling bass.',
		why: "It's driven by the descending bass line, not by chord function — each pair simply repeats the pattern a step lower.",
		listen: 'Set bass mode to root and follow the walk-down.'
	},
	{
		id: 'jazz-251',
		name: 'ii–V–I',
		variants: [
			{ steps: [s(2, 'min'), s(7, 'dom', 'maj', 'sus'), s(0, 'maj')], formula: 'ii–V–I' }
		],
		blurb: 'The engine of jazz harmony: pre-dominant, dominant, home. Most standards are chains of these.',
		why: 'Roots fall in fifths while the 7th of each chord slides a half-step down to become the 3rd of the next — maximum pull from minimum movement.',
		listen: 'Loop it and try one scale over all three chords: the major scale of the I. Then hear ii as Dorian and V as Mixolydian.'
	},
	{
		id: 'minor-251',
		name: 'Minor ii–V–i',
		variants: [
			{ steps: [s(2, 'halfdim', 'dim'), s(7, 'dom', 'maj'), s(0, 'min')], formula: 'iiø–V–i' }
		],
		blurb: 'The minor-key ii–V–i: tenser and darker than its major cousin.',
		why: "The half-diminished chord's ♭5 leans into the V7, which pulls straight down onto the minor tonic.",
		listen: 'Play the harmonic minor scale of the i over the V chord for the classic minor-jazz colour.'
	},
	{
		id: 'turnaround',
		name: 'Turnaround',
		variants: [
			{
				steps: [s(0, 'maj'), s(9, 'min'), s(2, 'min'), s(7, 'dom', 'maj')],
				formula: 'I–vi–ii–V'
			},
			{
				steps: [s(4, 'min'), s(9, 'min'), s(2, 'min'), s(7, 'dom', 'maj')],
				formula: 'iii–vi–ii–V'
			}
		],
		blurb: 'A turnaround: an ending that points back at the beginning, built to loop.',
		why: 'vi and ii keep the bassline falling toward the V, whose pull relaunches the I.',
		listen: "Loop just these bars and feel the 'recycle' — jazz tunes use this in the last two bars of the form."
	},
	{
		id: 'doowop',
		name: '50s / doo-wop',
		variants: [
			{
				steps: [s(0, 'maj'), s(9, 'min'), s(5, 'maj'), s(7, 'dom', 'maj')],
				formula: 'I–vi–IV–V'
			}
		],
		blurb: "The 50s progression — doo-wop, early rock'n'roll, countless slow ballads.",
		why: 'vi softens the step away from I, then IV–V is the classic run-up that lands back home.',
		listen: 'Loop it slowly with a swing feel; your ear already knows where every chord is going.'
	},
	{
		id: 'pop',
		name: 'Pop / Axis',
		variants: [
			{
				steps: [s(0, 'maj'), s(7, 'maj', 'dom'), s(9, 'min'), s(5, 'maj')],
				formula: 'I–V–vi–IV'
			},
			{
				steps: [s(9, 'min'), s(5, 'maj'), s(0, 'maj'), s(7, 'maj', 'dom')],
				formula: 'vi–IV–I–V'
			}
		],
		blurb: "The four-chord 'Axis' loop behind hundreds of hits.",
		why: 'It cycles tension and release without ever cadencing hard, so it can spin forever.',
		listen: 'Notice how the vi darkens the mood without leaving the key — a melody can sit unchanged over all four chords.'
	},
	{
		id: 'royal-road',
		name: 'Royal Road',
		variants: [
			{
				steps: [s(5, 'maj'), s(7, 'maj', 'dom'), s(4, 'min'), s(9, 'min')],
				formula: 'IV–V–iii–vi'
			}
		],
		blurb: "IV–V–iii–vi — the 'Royal Road' loop that powers J-pop and anime themes.",
		why: 'It starts away from home and never touches the tonic, so it floats: resolution stays permanently around the corner.',
		listen: 'Loop it and notice you never once hear chord I — that avoidance is the sound.'
	},
	{
		id: 'andalusian',
		name: 'Andalusian',
		variants: [
			{
				steps: [s(0, 'min'), s(10, 'maj', 'dom'), s(8, 'maj'), s(7, 'maj', 'dom')],
				formula: 'i–♭VII–♭VI–V'
			}
		],
		blurb: "The Andalusian cadence, flamenco's falling four-chord line.",
		why: 'The bass descends the minor tetrachord and lands on a MAJOR V, whose leading tone snaps back to i — the Phrygian flavour.',
		listen: 'Try the Phrygian dominant scale over the final V chord.'
	},
	{
		id: 'backdoor',
		name: 'Backdoor dominant',
		variants: [{ steps: [s(10, 'dom'), s(0, 'maj')], formula: '♭VII7–I' }],
		blurb: 'The backdoor dominant: ♭VII7 slips into I from below instead of from V.',
		why: 'It shares the two half-step resolutions of a normal V7–I, so it resolves — just softer and jazzier.',
		listen: 'Swap it for a plain V7 in the same spot and compare: same landing, different door.'
	},
	{
		id: 'cadence-authentic',
		name: 'Authentic cadence',
		anchor: 'end',
		variants: [{ steps: [s(7, 'dom', 'maj'), s(0, 'maj', 'min')], formula: 'V–I' }],
		blurb: "An authentic cadence, V–I: music's strongest full stop.",
		why: 'The leading tone rises a half-step while the root falls a fifth — the two strongest pulls in tonal music, at once.',
		listen: 'Stop playback just before the final chord and feel your ear demand it.'
	},
	{
		id: 'cadence-plagal',
		name: 'Plagal cadence',
		anchor: 'end',
		variants: [{ steps: [s(5, 'maj', 'min'), s(0, 'maj')], formula: 'IV–I' }],
		blurb: "The plagal 'Amen' cadence, IV–I.",
		why: "There's no leading tone — the subdominant simply relaxes onto the tonic, which is why it feels gentle rather than emphatic.",
		listen: 'Hymn endings and rock outros both live on this.'
	},
	{
		id: 'cadence-deceptive',
		name: 'Deceptive cadence',
		anchor: 'end',
		variants: [{ steps: [s(7, 'dom', 'maj'), s(9, 'min')], formula: 'V–vi' }],
		blurb: 'A deceptive cadence: the V promises I but lands on vi.',
		why: "vi shares two of I's three notes, so the ear accepts 'almost home' — surprise without derailment.",
		listen: 'Use it to extend an ending: deceive once, then resolve for real.'
	}
];

// ---- matching ---------------------------------------------------------------

interface RawDetection extends Detection {
	startChange: number;
	endChange: number;
	prio: number;
	tonic: number;
}

/** Detect named progressions in the bars, relative to the global key. */
export function detectProgressions(bars: Bar[], key: KeyInfo): Detection[] {
	const changes = collapseChanges(bars);
	if (changes.length < 2) return [];
	const keyChroma = mod12(Note.chroma(key.tonic) ?? 0);

	// Match every pattern variant at every window position.
	const raw: RawDetection[] = [];
	PATTERNS.forEach((p, prio) => {
		for (const v of p.variants) {
			const L = v.steps.length;
			for (let i = 0; i + L <= changes.length; i++) {
				const win = changes.slice(i, i + L);
				if (win[L - 1].seg !== win[0].seg) continue; // no rest/garbage inside
				if (p.anchor === 'end' && i + L !== changes.length) continue;
				const tonic = mod12(win[0].chroma - v.steps[0].deg); // first step pins the local key
				let ok = true;
				for (let k = 0; k < L; k++) {
					const st = v.steps[k];
					if (mod12(win[k].chroma - tonic) !== st.deg || !st.cores.includes(win[k].core)) {
						ok = false;
						break;
					}
				}
				if (!ok) continue;
				if (p.minSlots && win[L - 1].endSlot - win[0].startSlot + 1 < p.minSlots) continue;
				raw.push({
					patternId: p.id,
					name: p.name,
					formula: v.formula,
					localTonic: NOTE_NAMES[tonic],
					relation: tonic === keyChroma ? null : NUMERALS[mod12(tonic - keyChroma)],
					chords: win.map((c) => c.symbol),
					startSlot: win[0].startSlot,
					endSlot: win[L - 1].endSlot,
					startBar: win[0].startBar,
					endBar: win[L - 1].endBar,
					repeats: 1,
					blurb: p.blurb,
					why: p.why,
					listen: p.listen,
					startChange: i,
					endChange: i + L - 1,
					prio,
					tonic
				});
			}
		}
	});

	// Merge back-to-back repetitions of the same pattern/variant/tonic FIRST, so
	// a rotation-variant match inside the merged span gets swallowed below.
	raw.sort((a, b) => a.startChange - b.startChange || a.prio - b.prio);
	const merged: RawDetection[] = [];
	for (const m of raw) {
		const k = merged.find(
			(k) =>
				k.patternId === m.patternId &&
				k.formula === m.formula &&
				k.tonic === m.tonic &&
				m.startChange === k.endChange + 1 &&
				changes[m.startChange].seg === changes[k.endChange].seg
		);
		if (k) {
			k.endChange = m.endChange;
			k.endSlot = m.endSlot;
			k.endBar = m.endBar;
			k.repeats++;
		} else {
			merged.push({ ...m });
		}
	}

	// Suppress detections fully contained in a kept one (any pattern): kills the
	// V–I inside a closing ii–V–I and rotations inside a merged loop. PARTIAL
	// overlaps are kept deliberately — a turnaround and the ii–V–I resolving out
	// of it are two real facts.
	merged.sort(
		(a, b) =>
			b.endChange - b.startChange - (a.endChange - a.startChange) ||
			a.prio - b.prio ||
			a.startChange - b.startChange
	);
	const kept: RawDetection[] = [];
	for (const m of merged) {
		const contained = kept.some((k) => k.startChange <= m.startChange && m.endChange <= k.endChange);
		if (!contained) kept.push(m);
	}

	kept.sort((a, b) => a.startSlot - b.startSlot);
	return kept.map(({ startChange: _s, endChange: _e, prio: _p, tonic: _t, ...d }) => d);
}
