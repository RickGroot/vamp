// Comping: expand each chord slot into rhythmic note events according to the
// groove (block / strum / arpeggio, optional bass and metronome). Pure and
// position-based (quarter notes), so it's unit-testable; the engine converts
// quarter-note positions to transport ticks and wires up the sounds.

import { barBeats, beatsToQuarters } from '$lib/model/time';
import { clickAtBeat, type ClickFeel } from './drills';
import type { DrumStyle, Groove, TimeSignature } from '$lib/model/types';

export type CompKind = 'chord' | 'bass' | 'click' | 'drum';

export interface CompEvent {
	/** Start position in quarter notes from the loop start. */
	atQuarters: number;
	/** Duration in quarter notes. */
	durQuarters: number;
	/** Notes to play (empty for clicks/drums and for rests that only drive the highlight). */
	midi: number[];
	kind: CompKind;
	/** Slot to highlight when this event fires, or null. */
	slotIndex: number | null;
	/** Metronome / drum accent. */
	accent?: boolean;
	/** Drum sample name for kind 'drum' (e.g. 'kick', 'snare', 'hihat'). */
	drum?: string;
}

export interface CompSlot {
	slotIndex: number;
	/** Start position of the slot, in quarter notes. */
	startQuarters: number;
	/** Slot length in quarter notes. */
	quarters: number;
	/** Voiced chord notes (empty = rest). */
	midi: number[];
	/** Low bass/root note, or null. */
	bassMidi: number | null;
}

const GAP = 0.95; // leave a small gap so re-triggered notes don't blur together

/** Expand one slot's chord into note events for the chosen pattern. */
function compSlot(slot: CompSlot, ts: TimeSignature, groove: Groove): CompEvent[] {
	const events: CompEvent[] = [];
	const { slotIndex, startQuarters, quarters, midi } = slot;

	// A rest (or empty slot) still drives the active-slot highlight.
	if (midi.length === 0) {
		events.push({ atQuarters: startQuarters, durQuarters: quarters, midi: [], kind: 'chord', slotIndex });
		return events;
	}

	const beatStep = 4 / ts.denominator; // one notated beat, in quarter notes

	if (groove.pattern === 'strum') {
		const hits = Math.max(1, Math.round(quarters / beatStep));
		for (let h = 0; h < hits; h++) {
			events.push({
				atQuarters: startQuarters + h * beatStep,
				durQuarters: beatStep * GAP,
				midi,
				kind: 'chord',
				slotIndex: h === 0 ? slotIndex : null
			});
		}
	} else if (groove.pattern === 'arpeggio') {
		const step = beatStep / 2; // eighth-note arpeggio
		const steps = Math.max(1, Math.round(quarters / step));
		for (let s = 0; s < steps; s++) {
			events.push({
				atQuarters: startQuarters + s * step,
				durQuarters: step * GAP,
				midi: [midi[s % midi.length]],
				kind: 'chord',
				slotIndex: s === 0 ? slotIndex : null
			});
		}
	} else {
		// block: hold the whole chord for the slot
		events.push({ atQuarters: startQuarters, durQuarters: quarters, midi, kind: 'chord', slotIndex });
	}

	// Bass on strong beats: beat 1, plus the bar midpoint for full/longer slots.
	if (groove.bass && slot.bassMidi !== null) {
		const barQ = beatsToQuarters(barBeats(ts), ts);
		const strongBeats = quarters >= barQ ? [0, barQ / 2] : [0];
		for (const offset of strongBeats) {
			if (offset >= quarters) continue;
			events.push({
				atQuarters: startQuarters + offset,
				durQuarters: Math.min(beatStep * 2, quarters - offset) * GAP,
				midi: [slot.bassMidi],
				kind: 'bass',
				slotIndex: null
			});
		}
	}

	return events;
}

/** Metronome clicks on each notated beat across the loop (filtered by feel). */
function metronomeEvents(totalQuarters: number, ts: TimeSignature, feel: ClickFeel): CompEvent[] {
	const events: CompEvent[] = [];
	const beatStep = 4 / ts.denominator;
	const barQ = beatsToQuarters(barBeats(ts), ts);
	for (let q = 0; q < totalQuarters - 1e-6; q += beatStep) {
		const beatInBar = Math.round((((q % barQ) + barQ) % barQ) / beatStep);
		if (!clickAtBeat(beatInBar, feel)) continue;
		const accent = beatInBar === 0;
		events.push({ atQuarters: q, durQuarters: 0.1, midi: [], kind: 'click', slotIndex: null, accent });
	}
	return events;
}

interface DrumHit {
	at: number;
	drum: 'kick' | 'snare' | 'hihat';
	accent?: boolean;
}

/** One bar of drum hits at quarter-note offsets, scaled to the bar length. */
function drumBarHits(style: DrumStyle, barQ: number): DrumHit[] {
	const hits: DrumHit[] = [];
	const add = (at: number, drum: DrumHit['drum'], accent = false) => {
		if (at < barQ - 1e-6) hits.push({ at, drum, accent });
	};
	if (style === 'none') return hits;

	if (style === 'swing') {
		for (let q = 0; q < barQ; q += 1) {
			add(q, 'hihat');
			add(q + 0.66, 'hihat');
		}
	} else {
		for (let q = 0; q < barQ; q += 0.5) add(q, 'hihat');
	}

	if (style === 'rock') {
		add(0, 'kick', true);
		add(2, 'kick');
		add(1, 'snare');
		add(3, 'snare');
	} else if (style === 'pop') {
		add(0, 'kick', true);
		add(1.5, 'kick');
		add(2, 'kick');
		add(1, 'snare');
		add(3, 'snare');
	} else if (style === 'swing') {
		add(0, 'kick', true);
		add(1, 'snare');
		add(3, 'snare');
	} else if (style === 'bossa') {
		add(0, 'kick', true);
		add(2.5, 'kick');
		add(1.5, 'snare');
		add(3, 'snare');
	}
	return hits;
}

function drumEvents(totalQuarters: number, ts: TimeSignature, style: DrumStyle): CompEvent[] {
	const events: CompEvent[] = [];
	const barQ = beatsToQuarters(barBeats(ts), ts);
	const bar = drumBarHits(style, barQ);
	for (let start = 0; start < totalQuarters - 1e-6; start += barQ) {
		for (const hit of bar) {
			if (start + hit.at >= totalQuarters - 1e-6) continue;
			events.push({
				atQuarters: start + hit.at,
				durQuarters: 0.1,
				midi: [],
				kind: 'drum',
				slotIndex: null,
				drum: hit.drum,
				accent: hit.accent
			});
		}
	}
	return events;
}

/** Build the full ordered event list for a loop. */
export function buildCompEvents(
	slots: CompSlot[],
	totalQuarters: number,
	ts: TimeSignature,
	groove: Groove,
	clickFeel: ClickFeel = 'all'
): CompEvent[] {
	const events = slots.flatMap((slot) => compSlot(slot, ts, groove));
	if (groove.metronome) events.push(...metronomeEvents(totalQuarters, ts, clickFeel));
	if (groove.drums !== 'none') events.push(...drumEvents(totalQuarters, ts, groove.drums));
	return events;
}
