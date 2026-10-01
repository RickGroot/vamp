import { describe, it, expect } from 'vitest';
import { IDLE_CLOCK, TENSION, beatPhase, beatPosition, beatPulse, loopFraction, type MusicClock } from './music';
import {
	bloomStep,
	flowerFamilies,
	gustBend,
	layoutBlades,
	layoutFlowers,
	lcg,
	settleAmp,
	stemSpan,
	swayAngle
} from './meadow';
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

describe('meadow', () => {
	const blades = layoutBlades(200, lcg(42));

	it('grows the same field from the same seed, back to front', () => {
		expect(layoutBlades(200, lcg(42))).toEqual(blades);
		for (let i = 1; i < blades.length; i++) expect(blades[i].depth).toBeGreaterThanOrEqual(blades[i - 1].depth);
	});

	it('sways once every two beats, locked to the beat', () => {
		const b = blades[10];
		for (const pos of [0, 0.3, 1.7, 5.2]) {
			expect(swayAngle(pos + 2, 100, b)).toBeCloseTo(swayAngle(pos, 100, b), 10);
		}
		// Half a period away it swings the other way about its lean.
		const d0 = swayAngle(0.5, 0, b) - b.lean;
		const d1 = swayAngle(1.5, 0, b) - b.lean;
		expect(Math.sign(d0)).toBe(-Math.sign(d1));
	});

	it('rests at its lean when the motion envelope is zero', () => {
		for (const b of blades.slice(0, 20)) expect(swayAngle(3.3, 250, b, 0)).toBe(b.lean);
	});

	it('gusts only after the change, strongest at the front, fading with age', () => {
		expect(gustBend(-0.1, 0, 1)).toBe(0);
		const age = 0.5;
		const front = 520 * age;
		expect(gustBend(age, front, 1)).toBeGreaterThan(gustBend(age, front + 200, 1));
		expect(gustBend(1.5, 520 * 1.5, 1)).toBeLessThan(gustBend(age, front, 1));
	});

	it('gusts harder on a dominant than on the tonic', () => {
		expect(gustBend(0.3, 156, TENSION.dominant)).toBeGreaterThan(gustBend(0.3, 156, TENSION.major));
		expect(gustBend(0.3, 156, 0)).toBe(0);
	});

	it('stands on the bottom edge — no blade or stem starts in mid-air', () => {
		// Rooting far blades higher up (perspective with no ground under it) left
		// the bottom of the strip bare and the meadow hovering above the screen's edge.
		const flowers = layoutFlowers(40, lcg(7));
		for (const h of [64, 97, 124]) {
			for (const b of blades) {
				const s = stemSpan(b, h, 'blade');
				expect(s.baseY).toBeGreaterThanOrEqual(h);
				expect(s.baseY - s.len).toBeLessThan(h); // and still shows above it
			}
			for (const f of flowers) {
				const s = stemSpan(f, h, 'flower');
				expect(s.baseY).toBeGreaterThanOrEqual(h);
				expect(s.baseY - s.len).toBeGreaterThan(0); // the head stays in the strip
			}
			// Far is shorter than near, at the same height.
			const far = stemSpan({ ...blades[0], depth: 0, height: 0.8 }, h, 'blade');
			const near = stemSpan({ ...blades[0], depth: 1, height: 0.8 }, h, 'blade');
			expect(far.len).toBeLessThan(near.len);
		}
	});

	it('settles to stillness after a stop', () => {
		expect(settleAmp(true, 99999)).toBe(1);
		expect(settleAmp(false, 0)).toBe(1);
		expect(settleAmp(false, 300)).toBeGreaterThan(0);
		expect(settleAmp(false, 300)).toBeLessThan(1);
		expect(settleAmp(false, 5000)).toBe(0);
	});
});

describe('wildflowers', () => {
	it('plants the song’s garden in proportion to its chord families', () => {
		const blues = [...Array(8).fill('dominant'), ...Array(4).fill('minor')] as const;
		const garden = flowerFamilies([...blues], 30);
		expect(garden).toHaveLength(30);
		const n = (f: string) => garden.filter((g) => g === f).length;
		expect(n('dominant')).toBe(20);
		expect(n('minor')).toBe(10);
	});

	it('gives every family the song uses at least one flower', () => {
		const garden = flowerFamilies(['major', 'major', 'major', 'major', 'major', 'major', 'major', 'diminished'], 6);
		expect(garden).toContain('diminished');
		expect(garden).toHaveLength(6);
	});

	it('grows every colour for a blank song, and ignores unclassifiable chords', () => {
		expect(new Set(flowerFamilies([], 12)).size).toBe(6);
		expect(flowerFamilies(['other', 'major'], 4).every((f) => f === 'major')).toBe(true);
	});

	it('spreads flowers across the whole width, back to front, deterministically', () => {
		const a = layoutFlowers(20, lcg(3));
		expect(layoutFlowers(20, lcg(3))).toEqual(a);
		const us = a.map((f) => f.u).sort((x, y) => x - y);
		expect(us[0]).toBeLessThan(0.06);
		expect(us[us.length - 1]).toBeGreaterThan(0.94);
		expect(new Set(a.map((f) => f.slot)).size).toBe(20);
		for (let i = 1; i < a.length; i++) expect(a[i].depth).toBeGreaterThanOrEqual(a[i - 1].depth);
	});

	it('opens within about a beat and closes more slowly, whatever the frame rate', () => {
		const beat = 600;
		let fast = 0;
		for (let t = 0; t < beat; t += 16) fast = bloomStep(fast, 1, 16, beat);
		let slow = 0;
		for (let t = 0; t < beat; t += 50) slow = bloomStep(slow, 1, 50, beat);
		expect(fast).toBeGreaterThan(0.8);
		expect(Math.abs(fast - slow)).toBeLessThan(0.02);
		const closed = bloomStep(1, 0, beat, beat);
		expect(closed).toBeGreaterThan(0.5); // still mostly open a beat later
		expect(bloomStep(0.5, 0.5, 100, beat)).toBe(0.5);
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
