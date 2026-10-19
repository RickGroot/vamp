// Named loops for the "name that loop" quiz: short progressions people repeat,
// written as degree + quality (PresetChord, like the presets) so they build in
// any key. Each one is a pattern `analysis.ts` detects, so the name a quiz
// teaches is the name Sketch prints over your own song.
//
// Numerals are never written here: `loopNumerals` computes them with numeralOf,
// so a loop's formula and the Sketch chart can't disagree.
//
// Ids are referenced by the loop pools in items.ts: keep them stable, add a new
// id rather than renaming one.
//
// Pure: tonal + model only.

import { chordCore } from '$lib/model/analysis';
import type { KeyInfo } from '$lib/model/key';
import { numeralOf } from '$lib/model/numerals';
import { buildPresetChord, type PresetChord } from '$lib/model/presets';

export interface Loop {
	id: string;
	/** Display name. A musical name: never uppercased. */
	name: string;
	/** The key it is heard in: the cadence before it is in this mode. */
	mode: KeyInfo['mode'];
	chords: PresetChord[];
	/** The analysis.ts pattern that names it in Sketch. */
	patternId: string;
	/** One original line on how to recognise it by ear (analysis says why it works). */
	about: string;
}

const c = (semitones: number, quality = ''): PresetChord => ({ semitones, quality });

export const LOOPS: Loop[] = [
	{
		id: 'axis',
		name: 'Axis',
		mode: 'major',
		chords: [c(0), c(7), c(9, 'm'), c(5)],
		patternId: 'pop',
		about: 'Home first, then up to V: the minor vi is the third chord.'
	},
	{
		id: 'axis-vi',
		name: 'Axis from vi',
		mode: 'major',
		chords: [c(9, 'm'), c(5), c(0), c(7)],
		patternId: 'pop',
		about: 'Opens on the minor vi, so it sounds minor until home arrives third.'
	},
	{
		id: 'axis-iv',
		name: 'Axis from IV',
		mode: 'major',
		chords: [c(5), c(0), c(7), c(9, 'm')],
		patternId: 'pop',
		about: 'Opens on IV and ends every pass on the minor vi, left hanging.'
	},
	{
		id: 'axis-v',
		name: 'Axis from V',
		mode: 'major',
		chords: [c(7), c(9, 'm'), c(5), c(0)],
		patternId: 'pop',
		about: 'Opens on V and ends every pass with IV falling onto home.'
	},
	{
		id: 'doowop',
		name: '50s / doo-wop',
		mode: 'major',
		chords: [c(0), c(9, 'm'), c(5), c(7)],
		patternId: 'doowop',
		about: 'Home, then straight down to the minor vi; IV and V wind back up.'
	},
	{
		// The jazz pool's doo-wop: in sevenths like its neighbours, so the
		// difference you hear is IV against ii, not triads against sevenths.
		id: 'doowop-sevenths',
		name: 'Doo-wop in sevenths',
		mode: 'major',
		chords: [c(0, 'maj7'), c(9, 'm7'), c(5, 'maj7'), c(7, '7')],
		patternId: 'doowop',
		about: 'Home, down to vi, then a major IV where a turnaround would have a minor ii.'
	},
	{
		id: 'hopscotch',
		name: 'Hopscotch',
		mode: 'major',
		chords: [c(5), c(7), c(9, 'm'), c(0)],
		patternId: 'hopscotch',
		about: 'Opens on IV and climbs by step; home is the last chord of every pass.'
	},
	{
		id: 'royal-road',
		name: 'Royal Road',
		mode: 'major',
		chords: [c(5), c(7), c(4, 'm'), c(9, 'm')],
		patternId: 'royal-road',
		about: 'IV and V rise, then two minor chords: home never sounds at all.'
	},
	{
		id: 'mixolydian',
		name: 'Mixolydian rock',
		mode: 'major',
		chords: [c(0), c(10), c(5)],
		patternId: 'mixolydian',
		about: 'All major and no V: home, a whole step down, then IV.'
	},
	{
		id: 'mario',
		name: 'Mario cadence',
		mode: 'major',
		chords: [c(8), c(10), c(0)],
		patternId: 'mario',
		about: 'Three major chords climbing in whole steps, the last one home.'
	},
	{
		id: 'epic',
		name: 'Minor epic',
		mode: 'minor',
		chords: [c(0, 'm'), c(8), c(3), c(10)],
		patternId: 'pop',
		about: 'A minor home, then three major chords: the Axis, heard from its minor chord.'
	},
	{
		id: 'andalusian',
		name: 'Andalusian',
		mode: 'minor',
		chords: [c(0, 'm'), c(10), c(8), c(7)],
		patternId: 'andalusian',
		about: 'Steps down from the minor home to a major V that pulls straight back.'
	},
	{
		id: 'turnaround',
		name: 'Turnaround',
		mode: 'major',
		chords: [c(0, 'maj7'), c(9, 'm7'), c(2, 'm7'), c(7, '7')],
		patternId: 'turnaround',
		about: 'Home, then vi, ii and V, falling in fifths back to the top.'
	},
	{
		id: 'turnaround-iii',
		name: 'Turnaround from iii',
		mode: 'major',
		chords: [c(4, 'm7'), c(9, 'm7'), c(2, 'm7'), c(7, '7')],
		patternId: 'turnaround',
		about: 'Falls in fifths from iii; home never sounds, the V points back to it.'
	},
	{
		id: 'jazz-251',
		name: 'ii–V–I',
		mode: 'major',
		chords: [c(2, 'm7'), c(7, '7'), c(0, 'maj7')],
		patternId: 'jazz-251',
		about: 'Three sevenths: minor, dominant, then home on a major seventh.'
	},
	{
		id: 'minor-251',
		name: 'Minor ii–V–i',
		mode: 'minor',
		chords: [c(2, 'm7b5'), c(7, '7'), c(0, 'm7')],
		patternId: 'minor-251',
		about: 'A half-diminished ii and a dominant V, falling onto a minor home.'
	}
];

const BY_ID = new Map(LOOPS.map((l) => [l.id, l]));

export function loopById(id: string): Loop | null {
	return BY_ID.get(id) ?? null;
}

/** A loop's concert symbols in a key, built exactly like a preset. */
export function buildLoop(loop: Loop, tonic: string): string[] {
	return loop.chords.map((chord) => buildPresetChord(tonic, chord));
}

/** A reference tonic per mode; numerals are the same in every key. */
const REF: Record<KeyInfo['mode'], string> = { major: 'C', minor: 'A' };

/** The loop's numerals, computed from its chords (never typed): ['I', 'V', 'vi', 'IV']. */
export function loopNumerals(loop: Loop): string[] {
	const key: KeyInfo = { tonic: REF[loop.mode], mode: loop.mode };
	return buildLoop(loop, key.tonic).map((symbol) => numeralOf(symbol, key));
}

/**
 * A chord as (pitch class, triad), for comparing loops by sound: a seventh
 * folds into its triad (G7 is a G chord, Bm7♭5 a B diminished one), so a loop
 * written with sevenths is still the same loop.
 */
function cores(chords: PresetChord[]): { chroma: number; core: string }[] {
	const TRIAD: Record<string, string> = { dom: 'maj', halfdim: 'dim' };
	return chords.map(({ semitones, quality }) => {
		const core = chordCore(`C${quality}`)?.core ?? quality;
		return { chroma: ((semitones % 12) + 12) % 12, core: TRIAD[core] ?? core };
	});
}

/**
 * Are two loops the same cycle of chords, started on a different chord or
 * named from a different tonic? Compared by root motion and triad, so
 * vi–IV–I–V is a rotation of I–V–vi–IV, and the minor i–♭VI–♭III–♭VII is the
 * same loop again (the Axis started on vi). A loop is a rotation of itself.
 */
export function isRotation(a: PresetChord[], b: PresetChord[]): boolean {
	if (a.length !== b.length || a.length === 0) return false;
	const x = cores(a);
	const y = cores(b);
	const n = x.length;
	for (let shift = 0; shift < n; shift++) {
		const offset = y[shift].chroma - x[0].chroma;
		let same = true;
		for (let i = 0; i < n; i++) {
			const p = x[i];
			const q = y[(i + shift) % n];
			if (p.core !== q.core || (((q.chroma - p.chroma - offset) % 12) + 12) % 12 !== 0) {
				same = false;
				break;
			}
		}
		if (same) return true;
	}
	return false;
}
