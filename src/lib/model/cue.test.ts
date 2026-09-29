import { describe, it, expect } from 'vitest';
import { standCue } from './cue';
import { flattenSlots } from './slots';
import { createBar } from './factory';
import type { Bar } from './types';

const ts = { numerator: 4, denominator: 4 };
function bars(...chords: (string | string[])[]): Bar[] {
	return chords.map((c) => {
		const bar = createBar(ts);
		const list = Array.isArray(c) ? c : [c];
		bar.slots = list.map((chord, i) => ({ ...bar.slots[0], id: `${bar.id}-${i}`, chord, beats: 4 / list.length }));
		return bar;
	});
}
const all = (b: Bar[]) => ({ start: 0, end: b.length - 1 });

describe('standCue', () => {
	it('names the next CHANGE, skipping repeats of the same chord', () => {
		const b = bars('C', 'C', 'G7', 'C');
		const cue = standCue(flattenSlots(b), all(b), 0);
		expect(cue.now?.chord).toBe('C');
		expect(cue.next?.chord).toBe('G7');
		expect(cue.barsAway).toBe(2);
	});

	it('shows where you will start when stopped', () => {
		const b = bars('Dm7', 'G7', 'Cmaj7');
		const cue = standCue(flattenSlots(b), all(b), null);
		expect(cue.now?.chord).toBe('Dm7');
		expect(cue.next?.chord).toBe('G7');
	});

	it('wraps round the loop', () => {
		const b = bars('Dm7', 'G7', 'Cmaj7', 'Cmaj7');
		const flat = flattenSlots(b);
		const cue = standCue(flat, all(b), flat[3].globalIndex);
		expect(cue.now?.chord).toBe('Cmaj7');
		expect(cue.next?.chord).toBe('Dm7');
		expect(cue.barsAway).toBe(1);
	});

	it('stays inside the loop range', () => {
		const b = bars('C', 'F', 'G7', 'Am');
		const flat = flattenSlots(b);
		// Looping bars 2–3 (F, G7): from G7 the next change is F, not Am.
		const cue = standCue(flat, { start: 1, end: 2 }, flat[2].globalIndex);
		expect(cue.next?.chord).toBe('F');
	});

	it('reports a change later in the same bar as 0 bars away', () => {
		const b = bars(['Dm7', 'G7'], 'C');
		const flat = flattenSlots(b);
		const cue = standCue(flat, all(b), flat[0].globalIndex);
		expect(cue.next?.chord).toBe('G7');
		expect(cue.barsAway).toBe(0);
	});

	it('skips rests as a "next", and has nothing next on a one-chord vamp', () => {
		const b = bars('C', '', 'C');
		const cue = standCue(flattenSlots(b), all(b), 0);
		expect(cue.next).toBeNull();
		expect(standCue([], { start: 0, end: 0 }, null)).toEqual({ now: null, next: null, barsAway: 0 });
	});
});
