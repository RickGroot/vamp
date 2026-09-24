import { describe, it, expect } from 'vitest';
import { Chord, Note, Scale } from 'tonal';
import { resolveDrill, concertMidi } from './resolve';
import { BUILT_IN_DRILLS, drillById, PATTERNS } from './patterns';
import { rangeFor } from './range';
import { TRANSPOSE_OPTIONS } from '$lib/audio/transpose';
import { voicedToVexKey } from '$lib/notation/vex';
import { SCALE_ROOTS } from '$lib/model/scales';
import { CURRENT_DRILL_SCHEMA_VERSION, type DrillDefinition, type DrillRunOptions } from './types';

const chroma = (m: number) => ((m % 12) + 12) % 12;
const chromaSet = (ms: number[]) => new Set(ms.map(chroma));
const expectedChroma = (names: string[]) => new Set(names.map((n) => Note.chroma(n)!));

const TRUMPET = rangeFor('trumpet');
const KEYS = rangeFor('keys');

const run = (over: Partial<DrillRunOptions> = {}): DrillRunOptions => ({
	root: 'C',
	keyMode: 'off',
	reps: 1,
	offset: 0,
	range: KEYS,
	register: 'middle',
	tempo: 120,
	tempoStep: 0,
	tempoMax: 200,
	restBars: 0,
	...over
});

const scaleDrill = (scaleType: string, patternId: keyof typeof PATTERNS): DrillDefinition => ({
	schemaVersion: CURRENT_DRILL_SCHEMA_VERSION,
	id: `t-${scaleType}-${String(patternId)}`,
	name: 'test',
	description: 'test',
	createdAt: 0,
	updatedAt: 0,
	source: { kind: 'scale', scaleType },
	pattern: PATTERNS[patternId],
	direction: 'up',
	cellsPerKey: 4,
	timeSignature: { numerator: 4, denominator: 4 }
});

describe('resolveDrill — note content', () => {
	it('draws only from the scale it was given', () => {
		const got = resolveDrill(scaleDrill('major', '1235'), run({ root: 'C' }));
		const sounding = got.notes.filter((n) => n.midi !== null).map((n) => n.midi!);
		expect(sounding.length).toBeGreaterThan(0);
		for (const c of chromaSet(sounding)) {
			expect(expectedChroma(Scale.get('C major').notes).has(c)).toBe(true);
		}
	});

	it('draws only from the chord it was given', () => {
		const got = resolveDrill(drillById('maj7-arp')!, run({ root: 'C' }));
		const sounding = got.notes.filter((n) => n.midi !== null).map((n) => n.midi!);
		expect(chromaSet(sounding)).toEqual(expectedChroma(Chord.get('Cmaj7').notes));
	});

	it('starts the 1-2-3-5 cell on the right degrees', () => {
		const got = resolveDrill(scaleDrill('major', '1235'), run({ root: 'C', range: KEYS }));
		expect(got.notes.slice(0, 4).map((n) => n.name)).toEqual(['C', 'D', 'E', 'G']);
		// The cell then moves up one scale step.
		expect(got.notes.slice(4, 8).map((n) => n.name)).toEqual(['D', 'E', 'F', 'A']);
	});

	it('labels degrees, including altered ones', () => {
		const blues = resolveDrill(scaleDrill('blues', 'steps'), run({ root: 'C' }));
		expect(blues.notes.slice(0, 4).map((n) => n.label)).toEqual(['1', 'b3', '4', 'b5']);
		const dom = resolveDrill(drillById('dom7-arp')!, run({ root: 'C' }));
		expect(dom.notes.slice(0, 4).map((n) => n.label)).toEqual(['1', '3', '5', 'b7']);
	});

	it('marks roles so the UI can colour chord tones', () => {
		const dom = resolveDrill(drillById('dom7-arp')!, run({ root: 'C' }));
		expect(dom.notes.slice(0, 4).map((n) => n.role)).toEqual([
			'root',
			'third',
			'fifth',
			'seventh'
		]);
	});

	// Pool steps, NOT diatonic degrees — the same cell stays musical in a
	// five-note scale instead of running off the end.
	it('treats cell offsets as pool steps in a pentatonic', () => {
		const got = resolveDrill(scaleDrill('minor pentatonic', '1235'), run({ root: 'C' }));
		const sounding = got.notes.filter((n) => n.midi !== null).map((n) => n.midi!);
		for (const c of chromaSet(sounding)) {
			expect(expectedChroma(Scale.get('C minor pentatonic').notes).has(c)).toBe(true);
		}
	});

	it('transposes identically into every key', () => {
		const definition = scaleDrill('major', '1235');
		const diffs = (root: string) => {
			const ms = resolveDrill(definition, run({ root })).notes.map((n) => n.midi!);
			return ms.slice(1).map((m, i) => m - ms[i]);
		};
		const reference = diffs('C');
		// The interval shape must be identical in all twelve keys — catches
		// spelling and octave-wrap bugs a pitch-class test cannot see.
		for (const root of SCALE_ROOTS) expect(diffs(root)).toEqual(reference);
	});

	it('handles descending and up-down directions', () => {
		const definition = scaleDrill('major', 'steps');
		const up = resolveDrill(definition, run({ direction: 'up' })).notes.map((n) => n.midi!);
		const down = resolveDrill(definition, run({ direction: 'down' })).notes.map((n) => n.midi!);
		expect(down).toEqual([...up].reverse());
		const updown = resolveDrill(definition, run({ direction: 'updown' })).notes.map((n) => n.midi!);
		expect(updown).toEqual([...up, ...down]);
	});
});

describe('resolveDrill — rhythm and timing', () => {
	it('lays notes out contiguously in quarter notes', () => {
		const got = resolveDrill(scaleDrill('major', '1235'), run());
		let at = 0;
		for (const n of got.notes) {
			expect(n.atQuarters).toBeCloseTo(at, 10);
			at += n.durQuarters;
		}
		expect(got.totalQuarters).toBeCloseTo(at, 10);
	});

	it('inserts rests between repetitions without dropping them', () => {
		const got = resolveDrill(
			scaleDrill('major', 'steps'),
			run({ reps: 3, keyMode: 'fourths', restBars: 1 })
		);
		const rests = got.notes.filter((n) => n.role === 'rest');
		// One rest between each pair of repetitions, never a trailing one.
		expect(rests).toHaveLength(2);
		for (const r of rests) {
			expect(r.midi).toBeNull();
			expect(r.durQuarters).toBe(4);
		}
	});

	it('cycles a short rhythm against a longer cell', () => {
		const definition: DrillDefinition = {
			...scaleDrill('major', 'steps'),
			pattern: { id: 'x', label: 'x', cell: [0, 1, 2, 3], rhythm: [1, 0.5], step: 4 },
			cellsPerKey: 1
		};
		const got = resolveDrill(definition, run());
		expect(got.notes.map((n) => n.durQuarters)).toEqual([1, 0.5, 1, 0.5]);
	});

	it('scales beats to quarter notes in a non-4/4 meter', () => {
		const definition: DrillDefinition = {
			...scaleDrill('major', 'steps'),
			timeSignature: { numerator: 6, denominator: 8 },
			cellsPerKey: 2
		};
		const got = resolveDrill(definition, run());
		// One eighth-note beat is half a quarter.
		expect(got.notes.every((n) => n.durQuarters === 0.5)).toBe(true);
	});

	it('records one phrase per repetition with its own key and tempo', () => {
		const got = resolveDrill(
			scaleDrill('major', 'steps'),
			run({ reps: 3, keyMode: 'fourths', tempo: 100, tempoStep: 10, tempoMax: 200 })
		);
		expect(got.phrases.map((p) => p.concertRoot)).toEqual(['C', 'F', 'Bb']);
		expect(got.phrases.map((p) => p.tempo)).toEqual([100, 110, 120]);
		expect(got.phrases.map((p) => p.rep)).toEqual([0, 1, 2]);
	});
});

describe('resolveDrill — range', () => {
	it('keeps every note inside the written range', () => {
		for (const root of SCALE_ROOTS) {
			const got = resolveDrill(scaleDrill('major', '1235'), run({ root, range: TRUMPET }));
			for (const n of got.notes) {
				if (n.midi === null) continue;
				expect(n.midi).toBeGreaterThanOrEqual(TRUMPET.min);
				expect(n.midi).toBeLessThanOrEqual(TRUMPET.max);
			}
		}
	});

	it('skips a key rather than emitting a truncated pattern', () => {
		const wide: DrillDefinition = { ...scaleDrill('major', 'steps'), cellsPerKey: 30 };
		const got = resolveDrill(wide, run({ range: TRUMPET }));
		expect(got.notes).toHaveLength(0);
		expect(got.skipped).toEqual([{ concertRoot: 'C', reason: 'span' }]);
	});

	it('reports an unresolvable source instead of throwing', () => {
		const bogus: DrillDefinition = {
			...scaleDrill('not-a-scale', 'steps'),
			source: { kind: 'scale', scaleType: 'not-a-scale' }
		};
		const got = resolveDrill(bogus, run());
		expect(got.notes).toHaveLength(0);
		expect(got.skipped[0].reason).toBe('unresolvable');
	});
});

describe('resolveDrill — transposing instruments', () => {
	const definition = scaleDrill('major', '1235');

	// The test that catches an offset applied twice, or in the wrong direction.
	it('writes a Bb trumpet part exactly two semitones above concert', () => {
		const concert = resolveDrill(definition, run({ root: 'Eb', offset: 0 }));
		const written = resolveDrill(definition, run({ root: 'Eb', offset: 2 }));
		expect(written.notes).toHaveLength(concert.notes.length);
		written.notes.forEach((n, i) => {
			expect(chroma(n.midi!)).toBe((chroma(concert.notes[i].midi!) + 2) % 12);
		});
	});

	it('reads concert Eb major as written F major for a Bb trumpet', () => {
		const got = resolveDrill(scaleDrill('major', 'steps'), run({ root: 'Eb', offset: 2 }));
		expect(got.phrases[0].concertRoot).toBe('Eb');
		expect(got.phrases[0].writtenRoot).toBe('F');
		expect(got.notes.slice(0, 4).map((n) => n.name)).toEqual(['F', 'G', 'A', 'Bb']);
	});

	it('sounds concert pitch when converted back for playback', () => {
		const got = resolveDrill(scaleDrill('major', 'steps'), run({ root: 'Bb', offset: 2 }));
		// Written C sounds concert Bb.
		expect(got.notes[0].name).toBe('C');
		expect(chroma(concertMidi(got.notes[0].midi!, 2))).toBe(Note.chroma('Bb'));
	});

	it('is a no-op at concert pitch, with no special-cased identity path', () => {
		const a = resolveDrill(definition, run({ root: 'G', offset: 0 }));
		expect(a.phrases[0].writtenRoot).toBe(a.phrases[0].concertRoot);
	});

	it('resolves in every pitch mode without throwing', () => {
		for (const option of TRANSPOSE_OPTIONS) {
			for (const root of SCALE_ROOTS) {
				const got = resolveDrill(definition, run({ root, offset: option.offset, range: KEYS }));
				expect(got.notes.length).toBeGreaterThan(0);
			}
		}
	});
});

describe('resolveDrill — the notation contract', () => {
	// Stronger than a grep for midiToNoteName: this proves the spelling and the
	// midi still agree AFTER range fitting, by running the real consumer.
	it('round-trips every generated note through voicedToVexKey', () => {
		for (const definition of BUILT_IN_DRILLS) {
			for (const offset of TRANSPOSE_OPTIONS.map((o) => o.offset)) {
				const got = resolveDrill(definition, run({ root: 'C', offset, range: KEYS }));
				for (const n of got.notes) {
					if (n.midi === null) continue;
					const key = voicedToVexKey({ midi: n.midi, name: n.name });
					expect(key.key.split('/')[0]).toBe(n.name.toLowerCase());
				}
			}
		}
	});
});

describe('the built-in library', () => {
	it('resolves every drill in every key and pitch mode', () => {
		for (const definition of BUILT_IN_DRILLS) {
			for (const root of SCALE_ROOTS) {
				for (const offset of TRANSPOSE_OPTIONS.map((o) => o.offset)) {
					const got = resolveDrill(definition, run({ root, offset, range: KEYS }));
					expect(got.skipped).toEqual([]);
					expect(got.notes.length).toBeGreaterThan(0);
					expect(got.notes.every((n) => n.name !== '' || n.role === 'rest')).toBe(true);
				}
			}
		}
	});

	it('fits every built-in into a trumpet range in every key', () => {
		for (const definition of BUILT_IN_DRILLS) {
			for (const root of SCALE_ROOTS) {
				const got = resolveDrill(definition, run({ root, offset: 2, range: TRUMPET }));
				expect(got.skipped).toEqual([]);
			}
		}
	});

	it('has unique ids', () => {
		const ids = BUILT_IN_DRILLS.map((d) => d.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('survives a serialisation round trip', () => {
		for (const definition of BUILT_IN_DRILLS) {
			const revived = JSON.parse(JSON.stringify(definition)) as DrillDefinition;
			expect(resolveDrill(revived, run())).toEqual(resolveDrill(definition, run()));
		}
	});
});

describe('resolveDrill — guide tones over a set of changes', () => {
	const iiVI = [
		{ symbol: 'Dm7', beats: 4 },
		{ symbol: 'G7', beats: 4 },
		{ symbol: 'Cmaj7', beats: 4 }
	];
	const guide = drillById('guide-tones')!;

	it('traces the line through the supplied changes', () => {
		const got = resolveDrill(guide, run({ chords: iiVI }));
		expect(got.notes.map((n) => n.role)).toEqual(['third', 'seventh', 'third']);
		expect(got.notes.map((n) => n.chord)).toEqual(['Dm7', 'G7', 'Cmaj7']);
	});

	it('ignores the pattern entirely — one note per chord', () => {
		const got = resolveDrill(guide, run({ chords: iiVI }));
		expect(got.notes).toHaveLength(iiVI.length);
	});

	it('transposes the whole set of changes per repetition, non-destructively', () => {
		const chords = [...iiVI];
		const got = resolveDrill(guide, run({ chords, reps: 2, keyMode: 'fourths' }));
		// The caller's array is never mutated — the editor's song is untouchable.
		expect(chords).toEqual(iiVI);
		expect(got.phrases.map((p) => p.concertRoot)).toEqual(['C', 'F']);
		// The second repetition really is the same changes a fourth up.
		expect(got.notes.filter((n) => n.rep === 0).map((n) => n.chord)).toEqual([
			'Dm7',
			'G7',
			'Cmaj7'
		]);
		expect(got.notes.filter((n) => n.rep === 1).map((n) => n.chord)).toEqual([
			'Gm7',
			'C7',
			'Fmaj7'
		]);
	});

	// Each repetition re-seeds from the register target rather than continuing
	// from the last note, so a twelve-key run stays playable instead of climbing
	// out of range. That means a key may start on the 7th instead of the 3rd —
	// which is what a player does too.
	it('re-centres each repetition in the register', () => {
		const got = resolveDrill(guide, run({ chords: iiVI, reps: 12, keyMode: 'fourths' }));
		const centre = (rep: number) => {
			const ms = got.notes.filter((n) => n.rep === rep && n.midi !== null).map((n) => n.midi!);
			return ms.reduce((a, b) => a + b, 0) / ms.length;
		};
		const centres = Array.from({ length: 12 }, (_, i) => centre(i));
		// No drift: the last key sits within a fifth of the first.
		expect(Math.abs(centres[11] - centres[0])).toBeLessThanOrEqual(7);
	});

	it('writes the changes for a transposing instrument', () => {
		const got = resolveDrill(guide, run({ chords: iiVI, offset: 2 }));
		// A Bb trumpet reads a concert ii-V-I in C as one in D.
		expect(got.notes.map((n) => n.chord)).toEqual(['Em7', 'A7', 'Dmaj7']);
	});

	it('follows the supplied meter, not the definition’s', () => {
		const got = resolveDrill(
			guide,
			run({ chords: [{ symbol: 'Dm7', beats: 6 }], timeSignature: { numerator: 6, denominator: 8 } })
		);
		expect(got.notes[0].durQuarters).toBe(3);
	});

	it('skips the key when no changes are supplied, rather than throwing', () => {
		const got = resolveDrill(guide, run());
		expect(got.notes).toHaveLength(0);
		expect(got.skipped[0].reason).toBe('unresolvable');
	});

	it('keeps the line inside the written range', () => {
		const got = resolveDrill(guide, run({ chords: iiVI, range: TRUMPET, offset: 2 }));
		for (const n of got.notes) {
			if (n.midi === null) continue;
			expect(n.midi).toBeGreaterThanOrEqual(TRUMPET.min);
			expect(n.midi).toBeLessThanOrEqual(TRUMPET.max);
		}
	});

	// Range fitting shifts the whole phrase by octaves as one unit. If it moved
	// notes individually, a 12-semitone jump would appear mid-line.
	it('keeps the line voice-led after range fitting', () => {
		for (const range of [KEYS, TRUMPET]) {
			for (const root of SCALE_ROOTS) {
				const got = resolveDrill(guide, run({ chords: iiVI, root, range, offset: 2 }));
				const ms = got.notes.filter((n) => n.midi !== null).map((n) => n.midi!);
				for (let i = 1; i < ms.length; i++) {
					expect(Math.abs(ms[i] - ms[i - 1])).toBeLessThanOrEqual(4);
				}
			}
		}
	});
});

// The exact scenario that shipped broken: "Practise this" on a full-length tune.
// The line drifted out of a trumpet's range, every key was skipped, and the
// runner said the pattern didn't fit — for guide tones over any real standard.
describe('resolveDrill — guide tones over a full-length tune', () => {
	const form = [
		'Dm7', 'G7', 'Cmaj7', 'Am7', 'Fmaj7', 'Bm7b5', 'E7', 'Am7',
		'Gm7', 'C7', 'Fmaj7', 'Fm7', 'Em7', 'A7', 'Dm7', 'G7'
	];
	const tune = Array.from({ length: 64 }, (_, i) => ({ symbol: form[i % form.length], beats: 2 }));
	const guide = drillById('guide-tones')!;

	it('plays every key instead of skipping them all', () => {
		for (const offset of TRANSPOSE_OPTIONS.map((o) => o.offset)) {
			const got = resolveDrill(
				guide,
				run({ chords: tune, reps: 12, keyMode: 'fourths', range: TRUMPET, offset })
			);
			expect(got.skipped).toEqual([]);
			expect(got.phrases).toHaveLength(12);
			// One note per chord per key, all playable.
			expect(got.notes.filter((n) => n.role !== 'rest')).toHaveLength(64 * 12);
			for (const n of got.notes) {
				if (n.midi === null) continue;
				expect(n.midi).toBeGreaterThanOrEqual(TRUMPET.min);
				expect(n.midi).toBeLessThanOrEqual(TRUMPET.max);
			}
		}
	});

	it('keeps every note on its chord’s guide tone, even after folding', () => {
		const got = resolveDrill(guide, run({ chords: tune, range: TRUMPET }));
		for (const n of got.notes) {
			if (n.midi === null) continue;
			const tones = Chord.get(n.chord!).notes.map((t) => Note.chroma(t));
			expect(tones).toContain(chroma(n.midi));
		}
	});
});

// A folded line has a misleading average pitch, so re-centring it by average —
// which the guide branch used to do — shoved it an octave up and made "middle"
// sit HIGHER than "high". Register must mean what it says.
describe('resolveDrill — guide-tone register is monotonic', () => {
	const form = [
		'Dm7', 'G7', 'Cmaj7', 'Am7', 'Fmaj7', 'Bm7b5', 'E7', 'Am7',
		'Gm7', 'C7', 'Fmaj7', 'Fm7', 'Em7', 'A7', 'Dm7', 'G7'
	];
	const guide = drillById('guide-tones')!;
	const firstNote = (register: 'low' | 'middle' | 'high', chords: { symbol: string; beats: number }[]) =>
		resolveDrill(guide, run({ chords, register, range: TRUMPET })).notes.find((n) => n.midi !== null)!.midi!;

	for (const [label, length] of [['short', 3], ['full-length', 64]] as const) {
		it(`low <= middle <= high on a ${label} tune`, () => {
			const chords = Array.from({ length }, (_, i) => ({ symbol: form[i % form.length], beats: 2 }));
			const low = firstNote('low', chords);
			const mid = firstNote('middle', chords);
			const high = firstNote('high', chords);
			expect(low).toBeLessThanOrEqual(mid);
			expect(mid).toBeLessThanOrEqual(high);
			expect(low).toBeLessThan(high);
		});
	}
});
