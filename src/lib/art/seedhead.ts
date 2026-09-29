// Seedhead key compass: the circle of fifths grown as a sunflower head.
//
// Florets are laid out by Vogel's model (radius ∝ √i, golden-angle turns), and
// each belongs to the circle-of-fifths sector its angle falls in. The song's
// notes light their sectors; the chord sounding now lights its own in its
// pigment. The head is drawn with C at 12 o'clock and ROTATED so the key's
// tonic sits at the top — transposing turns the flower.
//
// Pure: layout + pitch-class maths only, unit tested in node.

import { Chord, Note } from 'tonal';

export const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)); // ≈ 2.39996 rad

export interface Floret {
	x: number;
	y: number;
	/** Dot radius, growing toward the rim like a real seedhead. */
	r: number;
	/** Circle-of-fifths sector 0..11, clockwise from 12 o'clock (C, G, D, …). */
	sector: number;
}

/** Vogel's model, centred on (0,0), fitting inside `radius`. */
export function florets(count: number, radius: number): Floret[] {
	const c = radius / Math.sqrt(count);
	const out: Floret[] = [];
	for (let i = 1; i <= count; i++) {
		const angle = i * GOLDEN_ANGLE;
		const r = c * Math.sqrt(i);
		// Angle measured clockwise from 12 o'clock, normalised to 0..2π.
		const a = (((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2));
		out.push({
			x: Math.sin(a) * r,
			y: -Math.cos(a) * r,
			r: 0.5 + 0.9 * (i / count),
			sector: Math.floor((a / (Math.PI * 2)) * 12) % 12
		});
	}
	return out;
}

/** Pitch class (0 = C) of a circle-of-fifths sector (0 = C, 1 = G, …). */
export function sectorPitchClass(sector: number): number {
	return (((sector * 7) % 12) + 12) % 12;
}

/** Sector (0 = C at the top) of a pitch class. 7 is its own inverse mod 12. */
export function pitchClassSector(pc: number): number {
	return (((pc * 7) % 12) + 12) % 12;
}

/** Degrees to rotate the head so the MIDDLE of `tonic`'s sector sits at 12 o'clock. */
export function tonicRotation(tonic: string): number {
	const pc = Note.chroma(tonic);
	return pc === undefined || Number.isNaN(pc) ? -15 : -(pitchClassSector(pc) + 0.5) * 30;
}

/** Pitch classes of one chord symbol (empty for a rest or anything unparsable). */
export function chordChroma(symbol: string): Set<number> {
	const out = new Set<number>();
	const s = symbol.trim();
	if (!s) return out;
	for (const n of Chord.get(s).notes) {
		const pc = Note.chroma(n);
		if (pc !== undefined && !Number.isNaN(pc)) out.add(pc);
	}
	return out;
}

/** Every pitch class the song's chords use. */
export function songChroma(symbols: string[]): Set<number> {
	const out = new Set<number>();
	for (const s of symbols) for (const pc of chordChroma(s)) out.add(pc);
	return out;
}
