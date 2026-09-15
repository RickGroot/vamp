// Guards the AI-facing format guide served at /vamp/llms.txt.
//
// static/llms.txt is a contract with external AI tools: an assistant reads it
// and emits song JSON the user pastes into File → Paste JSON…. So every fenced
// ```json example in it must import EXACTLY as written (no silent coercion by
// migrateProgression), use chord symbols tonal recognises, and fill each bar.
// When the schema, the coercion gate or tonal's parser changes, this fails
// until the guide is updated to match.

import { describe, it, expect } from 'vitest';
import { parseProgressionInput } from './import';
import { migrateProgression } from './db';
import { isValidChordSymbol } from '$lib/audio/chord';
import { barBeats } from '$lib/model/time';
import type { Progression } from '$lib/model/types';
// Vite's `?raw` import (no node:fs, which this repo has no types for).
import guide from '../../../static/llms.txt?raw';

/** Every fenced ```json block in the guide, in document order. */
const examples = [...guide.matchAll(/```json\r?\n([\s\S]*?)```/g)].map((m) => m[1]);

/** The inline `code` spans on the first line of the guide containing `marker`. */
function codeSpansOnLine(marker: string): string[] {
	const line = guide.split(/\r?\n/).find((l) => l.includes(marker));
	if (!line) throw new Error(`llms.txt: no line contains "${marker}"`);
	return [...line.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
}

type RawSong = Record<string, unknown>;
type RawBar = { slots: { chord: string; beats: number }[] };

/** Just the musical content of the bars — ids are minted on import and differ by design. */
const shape = (bars: RawBar[] | Progression['bars']) =>
	bars.map((b) => b.slots.map((s) => ({ chord: s.chord, beats: s.beats })));

describe('static/llms.txt — every JSON example imports exactly as documented', () => {
	it('contains the documented examples', () => {
		expect(examples.length).toBeGreaterThanOrEqual(4);
	});

	examples.forEach((json, i) => {
		describe(`example ${i + 1}`, () => {
			const songs = (): RawSong[] => parseProgressionInput(json);

			it('parses as one or more songs', () => {
				expect(songs().length).toBeGreaterThan(0);
			});

			it('survives migration unchanged — no documented value is silently coerced', () => {
				for (const raw of songs()) {
					const p = migrateProgression(raw) as unknown as Record<string, unknown>;
					for (const key of ['name', 'tempo', 'timeSignature', 'instrument', 'loopRange'] as const) {
						if (key in raw) expect(p[key], key).toEqual(raw[key]);
					}
					if (raw.groove) {
						const groove = p.groove as Record<string, unknown>;
						for (const [k, v] of Object.entries(raw.groove as Record<string, unknown>)) {
							expect(groove[k], `groove.${k}`).toEqual(v);
						}
					}
					expect(shape(p.bars as Progression['bars'])).toEqual(shape(raw.bars as RawBar[]));
				}
			});

			it('uses only recognised chord symbols (or "" rests)', () => {
				for (const raw of songs()) {
					for (const bar of raw.bars as RawBar[]) {
						for (const slot of bar.slots) {
							if (slot.chord !== '') expect(isValidChordSymbol(slot.chord), slot.chord).toBe(true);
						}
					}
				}
			});

			it('fills every bar exactly, with 1–4 chords', () => {
				for (const raw of songs()) {
					const p = migrateProgression(raw);
					const beats = barBeats(p.timeSignature);
					for (const bar of p.bars) {
						expect(bar.slots.length).toBeGreaterThanOrEqual(1);
						expect(bar.slots.length).toBeLessThanOrEqual(4);
						expect(bar.slots.reduce((sum, s) => sum + s.beats, 0)).toBe(beats);
					}
				}
			});
		});
	});
});

describe('static/llms.txt — its chord-symbol claims hold against tonal', () => {
	it('every "known-good" quality parses', () => {
		const spans = codeSpansOnLine('Known-good qualities');
		expect(spans.length).toBeGreaterThan(20);
		for (const s of spans) expect(isValidChordSymbol(s), s).toBe(true);
	});

	it('every listed root and slash chord parses', () => {
		const roots = codeSpansOnLine('**Roots**').filter((s) => /^[A-G]/.test(s));
		const slashes = codeSpansOnLine('**Slash chords**').filter((s) => /^[A-G]/.test(s));
		expect(roots.length + slashes.length).toBeGreaterThan(8);
		for (const s of [...roots, ...slashes]) expect(isValidChordSymbol(s), s).toBe(true);
	});

	// Mirrors the guide's "Avoid" list. If tonal starts accepting one of these,
	// the guide has become needlessly strict and should be relaxed.
	it.each(['B♭', 'F♯', 'C7(b9)', 'Cm7(b5)', 'CΔ7', 'Cø7', 'Cm(maj7)', 'Calt', 'CMAJ7', 'N.C.', 'Dm7 G7'])(
		'"%s" is unrecognised, as the guide warns',
		(s) => {
			expect(isValidChordSymbol(s)).toBe(false);
		}
	);
});
