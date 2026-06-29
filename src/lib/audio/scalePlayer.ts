// Play a scale ascending through the current instrument (a one-shot preview,
// independent of the loop transport).

import * as Tone from 'tone';
import { Note } from 'tonal';
import type { InstrumentId } from '$lib/model/types';
import { unlockAudio } from './context';
import { getInstrument } from './instruments';

/** One ascending octave of MIDI notes for a scale, from the root in octave 4. */
export function scaleMidis(root: string, pcs: number[], rootPc: number): number[] {
	const base = Note.midi(`${root}4`) ?? 60;
	const offsets = [...new Set(pcs.map((pc) => (((pc - rootPc) % 12) + 12) % 12))].sort(
		(a, b) => a - b
	);
	const midis = offsets.map((o) => base + o);
	midis.push(base + 12); // complete the octave on the root
	return midis;
}

/** Schedule the notes ascending; safe to call regardless of loop playback. */
export async function playScale(midis: number[], instrument: InstrumentId): Promise<void> {
	if (midis.length === 0) return;
	await unlockAudio();
	const inst = await getInstrument(instrument);
	const step = 0.26;
	const start = Tone.now() + 0.05;
	midis.forEach((m, i) =>
		inst.start({ note: m, time: start + i * step, duration: step * 0.95, velocity: 90 })
	);
}
