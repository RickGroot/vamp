// Scale reference + chord→scale suggestions for the Scales section.

import { Scale, Chord, Note } from 'tonal';
import { classifyChord, type ChordFamily } from './chords';

/** Curated, useful scales/modes (ids are tonal scale-type names). */
export const SCALE_TYPES: { id: string; label: string }[] = [
	{ id: 'major', label: 'Major (Ionian)' },
	{ id: 'minor', label: 'Natural minor (Aeolian)' },
	{ id: 'dorian', label: 'Dorian' },
	{ id: 'phrygian', label: 'Phrygian' },
	{ id: 'lydian', label: 'Lydian' },
	{ id: 'mixolydian', label: 'Mixolydian' },
	{ id: 'locrian', label: 'Locrian' },
	{ id: 'harmonic minor', label: 'Harmonic minor' },
	{ id: 'melodic minor', label: 'Melodic minor' },
	{ id: 'major pentatonic', label: 'Major pentatonic' },
	{ id: 'minor pentatonic', label: 'Minor pentatonic' },
	{ id: 'blues', label: 'Blues' },
	{ id: 'whole tone', label: 'Whole tone' },
	{ id: 'diminished', label: 'Diminished' }
];

export const SCALE_ROOTS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

const SCALE_TYPE_IDS = new Set(SCALE_TYPES.map((t) => t.id));

/** Scales that pair well with each chord quality (all are in SCALE_TYPES). */
const FAMILY_SCALES: Record<ChordFamily, string[]> = {
	major: ['major', 'lydian', 'mixolydian', 'major pentatonic'],
	minor: ['dorian', 'minor', 'phrygian', 'minor pentatonic'],
	dominant: ['mixolydian', 'blues', 'whole tone'],
	diminished: ['locrian', 'diminished'],
	augmented: ['whole tone'],
	suspended: ['mixolydian', 'major'],
	other: ['major', 'minor']
};

export interface ScaleInfo {
	/** Full name, e.g. "C dorian". */
	name: string;
	/** Note names, e.g. ["C","D","Eb",…]. */
	notes: string[];
	/** Interval names from the root, e.g. ["1P","2M",…]. */
	intervals: string[];
	/** Pitch-class chromas (0–11) of the notes. */
	pcs: number[];
	/** Chroma of the root. */
	rootPc: number;
	empty: boolean;
}

export function getScaleInfo(root: string, type: string): ScaleInfo {
	const s = Scale.get(`${root} ${type}`);
	const notes = s.notes ?? [];
	const pcs = notes.map((n) => Note.chroma(n)).filter((c): c is number => c != null);
	return {
		name: s.name || `${root} ${type}`,
		notes,
		intervals: s.intervals ?? [],
		pcs,
		rootPc: Note.chroma(root) ?? 0,
		empty: notes.length === 0
	};
}

export interface VexNote {
	/** VexFlow key, e.g. "db/4". */
	key: string;
	/** Accidental glyph to render ('#', 'b', …) or null. */
	accidental: string | null;
}

const START_OCT = 4;

function toVexNote(name: string, octave: number): VexNote {
	const m = name.match(/^([A-Ga-g])(#{1,2}|b{1,2})?$/);
	if (!m) return { key: `c/${octave}`, accidental: null };
	const acc = m[2] ?? null;
	return { key: `${m[1].toLowerCase()}${acc ?? ''}/${octave}`, accidental: acc };
}

/**
 * Scale notes (ascending, one octave) as VexFlow keys with their spelling
 * preserved, ending on the octave root. Octaves climb so the line ascends.
 */
export function scaleStaffKeys(notes: string[]): VexNote[] {
	if (notes.length === 0) return [];
	const out: VexNote[] = [];
	let oct = START_OCT;
	let prev = -1;
	for (const n of notes) {
		const chroma = Note.chroma(n);
		if (chroma == null) continue;
		if (chroma <= prev) oct++;
		prev = chroma;
		out.push(toVexNote(n, oct));
	}
	out.push(toVexNote(notes[0], START_OCT + 1));
	return out;
}

/** Standard guitar tuning, low→high string: E2 A2 D3 G3 B3 E4 (MIDI). */
export const GUITAR_TUNING = [40, 45, 50, 55, 59, 64];

/** Root + suggested scale types that fit a chord symbol (null if unparseable). */
export function scalesForChord(symbol: string): { root: string; types: string[] } | null {
	const chord = Chord.get(symbol);
	if (chord.empty || !chord.tonic) return null;
	const family = classifyChord(symbol);
	const types = FAMILY_SCALES[family].filter((t) => SCALE_TYPE_IDS.has(t));
	return { root: chord.tonic, types };
}
