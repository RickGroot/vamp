// Export a progression as a Standard MIDI File (format 0), dependency-free.
// Chords on channel 1, bass on channel 2, drums on channel 10 (GM percussion).

import type { Progression } from '$lib/model/types';
import { buildScheduledEvents } from '$lib/audio/schedule';
import { downloadBlob, safeFileName } from '$lib/storage/backup';

const PPQ = 480;
const CHORD_VEL = 95;
const BASS_VEL = 80;
const GM_DRUM: Record<string, number> = { kick: 36, snare: 38, hihat: 42 };

/** Variable-length quantity encoding (MIDI delta times). */
function vlq(value: number): number[] {
	const bytes = [value & 0x7f];
	let v = value >>> 7;
	while (v > 0) {
		bytes.unshift((v & 0x7f) | 0x80);
		v >>>= 7;
	}
	return bytes;
}

const u16 = (n: number) => [(n >> 8) & 0xff, n & 0xff];
const u32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];

interface RawEvent {
	tick: number;
	bytes: number[];
	/** 0 = note-off (sort before note-ons at the same tick). */
	order: number;
}

export function progressionToMidi(progression: Progression): Uint8Array {
	const { events } = buildScheduledEvents(progression, { whole: true });
	const raw: RawEvent[] = [];
	const add = (tick: number, bytes: number[], order: number) =>
		raw.push({ tick: Math.round(tick), bytes, order });

	for (const ev of events) {
		if (ev.kind === 'click') continue;
		const startTick = ev.atQuarters * PPQ;
		const endTick = (ev.atQuarters + ev.durQuarters) * PPQ;

		if (ev.kind === 'drum') {
			const note = GM_DRUM[ev.drum ?? 'kick'] ?? 36;
			add(startTick, [0x99, note, ev.accent ? 110 : 80], 1); // ch10 note-on
			add(endTick, [0x89, note, 0], 0);
			continue;
		}

		const channel = ev.kind === 'bass' ? 1 : 0;
		const vel = ev.kind === 'bass' ? BASS_VEL : CHORD_VEL;
		for (const note of ev.midi) {
			add(startTick, [0x90 | channel, note, vel], 1);
			add(endTick, [0x80 | channel, note, 0], 0);
		}
	}

	raw.sort((a, b) => a.tick - b.tick || a.order - b.order);

	const track: number[] = [];
	// Tempo + time-signature meta at the start.
	const usPerQuarter = Math.round(60000000 / progression.tempo);
	track.push(0x00, 0xff, 0x51, 0x03, (usPerQuarter >> 16) & 0xff, (usPerQuarter >> 8) & 0xff, usPerQuarter & 0xff);
	const dd = Math.round(Math.log2(progression.timeSignature.denominator));
	track.push(0x00, 0xff, 0x58, 0x04, progression.timeSignature.numerator, dd, 24, 8);

	let prevTick = 0;
	for (const e of raw) {
		track.push(...vlq(e.tick - prevTick), ...e.bytes);
		prevTick = e.tick;
	}
	track.push(0x00, 0xff, 0x2f, 0x00); // end of track

	const header = [0x4d, 0x54, 0x68, 0x64, ...u32(6), ...u16(0), ...u16(1), ...u16(PPQ)];
	const chunk = [0x4d, 0x54, 0x72, 0x6b, ...u32(track.length), ...track];
	return new Uint8Array([...header, ...chunk]);
}

export function downloadMidi(progression: Progression): void {
	const blob = new Blob([progressionToMidi(progression) as BlobPart], { type: 'audio/midi' });
	downloadBlob(blob, `${safeFileName(progression.name)}.mid`);
}
