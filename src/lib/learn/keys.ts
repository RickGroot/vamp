// Keys as they are usually written, for Learn: flats for the major keys
// (PRESET_ROOTS), sharps where a minor key is normally spelled with them —
// C♯ minor, not D♭ minor. Shared by the map's key select and the quiz's
// random keys, so both print the same twelve names.
//
// Pure.

import { Note } from 'tonal';
import type { KeyInfo } from '$lib/model/key';
import { PRESET_ROOTS } from '$lib/model/presets';

export const KEY_ROOTS: Record<KeyInfo['mode'], string[]> = {
	major: PRESET_ROOTS,
	minor: ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B']
};

/** A root respelled the way its key is written in this mode ('Db' minor → 'C#'). */
export function spellKey(root: string, mode: KeyInfo['mode']): string {
	return KEY_ROOTS[mode].find((r) => Note.chroma(r) === Note.chroma(root)) ?? root;
}
