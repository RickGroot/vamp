import { describe, it, expect } from 'vitest';
import { progressionToMidi } from './midi';
import { createProgression, createBar } from '$lib/model/factory';

function prog() {
	const ts = { numerator: 4, denominator: 4 };
	const b1 = createBar(ts);
	b1.slots[0].chord = 'Cmaj7';
	const b2 = createBar(ts);
	b2.slots[0].chord = 'G7';
	return createProgression({ tempo: 120, timeSignature: ts, bars: [b1, b2] });
}

const ascii = (bytes: Uint8Array, from: number, len: number) =>
	Array.from({ length: len }, (_, i) => String.fromCharCode(bytes[from + i])).join('');

describe('progressionToMidi', () => {
	it('writes a valid SMF header (MThd, format 0, 1 track)', () => {
		const bytes = progressionToMidi(prog());
		expect(ascii(bytes, 0, 4)).toBe('MThd');
		expect(bytes[9]).toBe(0); // format 0
		expect(bytes[11]).toBe(1); // 1 track
		expect(ascii(bytes, 14, 4)).toBe('MTrk');
	});

	it('contains note-on events and a tempo meta', () => {
		const bytes = progressionToMidi(prog());
		const arr = [...bytes];
		expect(arr.some((b, i) => i > 18 && b === 0x90)).toBe(true); // note-on ch1
		let tempoMeta = false;
		for (let i = 0; i < arr.length - 2; i++) {
			if (arr[i] === 0xff && arr[i + 1] === 0x51 && arr[i + 2] === 0x03) tempoMeta = true;
		}
		expect(tempoMeta).toBe(true);
	});

	it('ends with an end-of-track meta', () => {
		const bytes = progressionToMidi(prog());
		const n = bytes.length;
		expect([bytes[n - 3], bytes[n - 2], bytes[n - 1]]).toEqual([0xff, 0x2f, 0x00]);
	});
});
