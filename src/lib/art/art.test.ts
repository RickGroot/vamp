import { describe, it, expect } from 'vitest';
import { IDLE_CLOCK, TENSION, beatPhase, beatPosition, beatPulse, loopFraction, type MusicClock } from './music';
import { barArcs, ringOffset, ringPath, sessionSummary, tensionsOf } from './rings';
import {
	chordChroma,
	florets,
	pitchClassSector,
	sectorPitchClass,
	songChroma,
	tonicRotation
} from './seedhead';

const playingAt = (quarters: number, over: Partial<MusicClock> = {}): MusicClock => ({
	playing: true,
	quarters,
	loopQuarters: 16,
	quartersPerBar: 4,
	bpm: 120,
	loops: 0,
	...over
});

describe('music signal', () => {
	it('is still when stopped: no beat position, no loop progress', () => {
		expect(beatPosition(IDLE_CLOCK, 1)).toBe(0);
		expect(beatPhase(IDLE_CLOCK, 1)).toBe(0);
		expect(loopFraction(IDLE_CLOCK)).toBe(0);
	});

	it('counts beats in the meter’s beat unit (6/8 → half a quarter)', () => {
		expect(beatPosition(playingAt(3), 1)).toBe(3);
		expect(beatPosition(playingAt(3), 0.5)).toBe(6);
		expect(beatPhase(playingAt(2.25), 1)).toBeCloseTo(0.25);
	});

	it('holds at zero through a count-in', () => {
		expect(beatPosition(playingAt(-2), 1)).toBe(0);
		expect(loopFraction(playingAt(-2))).toBe(0);
	});

	it('reports progress through the loop', () => {
		expect(loopFraction(playingAt(4))).toBeCloseTo(0.25);
		expect(loopFraction(playingAt(15.9))).toBeLessThan(1);
	});

	it('pulses hardest on the beat', () => {
		expect(beatPulse(0)).toBe(1);
		expect(beatPulse(0.5)).toBeLessThan(beatPulse(0.1));
		expect(beatPulse(1)).toBe(0);
	});

	it('orders tension from rest to pull', () => {
		expect(TENSION.major).toBeLessThan(TENSION.minor);
		expect(TENSION.minor).toBeLessThan(TENSION.dominant);
		expect(TENSION.dominant).toBeLessThanOrEqual(TENSION.diminished);
	});
});

describe('growth rings', () => {
	it('draws one arc per bar, or a whole ring for one bar', () => {
		expect(barArcs(0, 50, 50, 30)).toEqual([]);
		expect(barArcs(1, 50, 50, 30)).toHaveLength(1);
		expect(barArcs(8, 50, 50, 30)).toHaveLength(8);
		for (const d of barArcs(4, 50, 50, 30)) expect(d).toMatch(/^M[\d.-]+ [\d.-]+A30 30 0 [01] 1 [\d.-]+ [\d.-]+$/);
	});

	it('bulges under tense bars', () => {
		// Same place on the ring, two progressions: a dominant in bar 2 pushes it
		// further out than a tonic there would.
		const tense = tensionsOf(['major', 'dominant', 'major', 'major']);
		const calm = tensionsOf(['major', 'major', 'major', 'major']);
		const midBar2 = (1.25 / 4) * Math.PI * 2;
		expect(ringOffset(midBar2, 0, tense)).toBeGreaterThan(ringOffset(midBar2, 0, calm));
	});

	it('never lets consecutive rings cross at their spacing', () => {
		const t = tensionsOf(['minor', 'dominant', 'major', 'dominant']);
		const spacing = 3;
		for (let ring = 0; ring < 12; ring++) {
			for (let s = 0; s < 96; s++) {
				const a = (s / 96) * Math.PI * 2;
				const inner = ring * spacing + ringOffset(a, ring, t);
				const outer = (ring + 1) * spacing + ringOffset(a, ring + 1, t);
				expect(outer).toBeGreaterThan(inner);
			}
		}
	});

	it('closes every ring path, with finite coordinates', () => {
		const d = ringPath(60, 60, 42, 3, tensionsOf(['minor', null, 'dominant']));
		expect(d.endsWith('Z')).toBe(true);
		expect(d).not.toMatch(/NaN|Infinity/);
	});

	it('summarises the session', () => {
		expect(sessionSummary(1, 45_000)).toBe('1 chorus · 0:45');
		expect(sessionSummary(9, 252_400)).toBe('9 choruses · 4:12');
	});
});

describe('seedhead', () => {
	it('lays florets out inside the head, every sector represented', () => {
		const fl = florets(144, 30);
		expect(fl).toHaveLength(144);
		for (const f of fl) expect(Math.hypot(f.x, f.y)).toBeLessThanOrEqual(30.0001);
		expect(new Set(fl.map((f) => f.sector)).size).toBe(12);
	});

	it('maps the circle of fifths both ways', () => {
		expect([0, 1, 2, 3, 11].map(sectorPitchClass)).toEqual([0, 7, 2, 9, 5]); // C G D A … F
		for (let pc = 0; pc < 12; pc++) expect(sectorPitchClass(pitchClassSector(pc))).toBe(pc);
	});

	it('turns the flower so the tonic sits at the top', () => {
		expect(tonicRotation('C')).toBe(-15);
		expect(tonicRotation('G')).toBe(-45);
		expect(tonicRotation('F')).toBe(-345);
		// Enharmonic spellings land on the same sector.
		expect(tonicRotation('F#')).toBe(tonicRotation('Gb'));
	});

	it('reads a chord’s and a song’s pitch classes', () => {
		expect([...chordChroma('Dm7')].sort((a, b) => a - b)).toEqual([0, 2, 5, 9]);
		expect(chordChroma('').size).toBe(0);
		expect(chordChroma('not a chord').size).toBe(0);
		expect([...songChroma(['C', 'G7'])].sort((a, b) => a - b)).toEqual([0, 2, 4, 5, 7, 11]);
	});
});
