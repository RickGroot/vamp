// Turn a progression into ordered note/comp events in quarter-note positions.
// Shared by the playback engine (→ transport ticks) and the exporters (→ MIDI
// ticks / seconds), so voicing + groove logic lives in exactly one place.

import { Note } from 'tonal';
import type { InstrumentId, Progression } from '$lib/model/types';
import { beatsToQuarters, resolveLoopRange } from '$lib/model/time';
import { flattenSlots } from '$lib/model/slots';
import { voiceSequence, nearestMidi } from './voicing';
import { parseChord } from './chord';
import { buildCompEvents, type CompEvent, type CompSlot } from './comp';

const BASS_TARGET = 40; // ~E2 register for the bass note

/** Base octave to voice each instrument's chords from (guitar/pad sit lower). */
export const BASE_OCTAVE: Record<InstrumentId, number> = {
	piano: 4,
	rhodes: 4,
	guitar: 3,
	pad: 3
};

/**
 * Build comp events for a progression. By default covers the active loop range
 * (for playback); pass `whole: true` to cover the entire progression (for export).
 */
export function buildScheduledEvents(
	progression: Progression,
	opts: { whole?: boolean } = {}
): { events: CompEvent[]; totalQuarters: number } {
	const ts = progression.timeSignature;
	const baseOctave = BASE_OCTAVE[progression.instrument];

	let inRange = flattenSlots(progression.bars);
	if (!opts.whole) {
		const { start, end } = resolveLoopRange(progression);
		inRange = inRange.filter((f) => f.barIndex >= start && f.barIndex <= end);
	}

	const voicings = voiceSequence(
		inRange.map((f) => f.slot.chord),
		progression.instrument,
		baseOctave
	);

	const compSlots: CompSlot[] = [];
	let cumulativeQuarters = 0;
	inRange.forEach((flat, i) => {
		const quarters = beatsToQuarters(flat.slot.beats, ts);
		const midi = voicings[i] ?? [];
		let bassMidi: number | null = null;
		if (midi.length) {
			const parsed = parseChord(flat.slot.chord);
			const bassPc = parsed.bass ?? parsed.notes[0];
			const chroma = bassPc ? Note.chroma(bassPc) : undefined;
			if (chroma !== undefined) bassMidi = nearestMidi(chroma, BASS_TARGET);
		}
		compSlots.push({
			slotIndex: flat.globalIndex,
			startQuarters: cumulativeQuarters,
			quarters,
			midi,
			bassMidi
		});
		cumulativeQuarters += quarters;
	});

	return {
		events: buildCompEvents(compSlots, cumulativeQuarters, ts, progression.groove),
		totalQuarters: cumulativeQuarters
	};
}
