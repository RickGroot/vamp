import { describe, it, expect } from 'vitest';
import { ambientTilt, wavefrontRadius, pingDecay, wavefrontPassed } from './lattice';

describe('ambientTilt', () => {
	it('is bounded by the combined amplitude (~0.27 rad)', () => {
		let max = 0;
		for (let c = 0; c < 40; c++) {
			for (let r = 0; r < 40; r++) {
				for (let t = 0; t < 20; t += 0.5) {
					max = Math.max(max, Math.abs(ambientTilt(c, r, t)));
				}
			}
		}
		// AMB(0.18) + 0.5*AMB(0.09) = 0.27 rad ceiling — never spins, just tilts.
		expect(max).toBeLessThanOrEqual(0.27 + 1e-9);
		expect(max).toBeGreaterThan(0.1); // and it actually moves
	});

	it('is continuous in time (no jumps frame-to-frame)', () => {
		const a = ambientTilt(5, 7, 3.0);
		const b = ambientTilt(5, 7, 3.0 + 1 / 60);
		expect(Math.abs(b - a)).toBeLessThan(0.02);
	});
});

describe('wavefront cascade — squares turn "in order" from the origin', () => {
	it('the wavefront expands outward over time', () => {
		expect(wavefrontRadius(0)).toBe(0);
		expect(wavefrontRadius(0.5)).toBeGreaterThan(wavefrontRadius(0.1));
	});

	it('a near cell crosses its flip threshold before a far cell', () => {
		const near = 40; // px from origin
		const far = 400;
		// Find the wavefront radius at which each cell reaches half-flip (~0.5).
		const reaches = (dist: number) => {
			for (let front = 0; front < 2000; front += 2) {
				if (wavefrontPassed(dist, front) >= 0.5) return front;
			}
			return Infinity;
		};
		expect(reaches(near)).toBeLessThan(reaches(far)); // near turns first → "in order"
	});

	it('a cell rises then holds as the ring sweeps over and past it', () => {
		const dist = 200;
		const before = wavefrontPassed(dist, dist - 200); // ring not yet arrived
		const during = wavefrontPassed(dist, dist); // ring centred on the cell
		const after = wavefrontPassed(dist, dist + 400); // ring well past
		expect(before).toBeLessThan(0.1);
		expect(during).toBeGreaterThan(0.4);
		expect(during).toBeLessThan(0.6);
		expect(after).toBeGreaterThan(0.95); // holds flipped behind the front
	});

	it('every ping fades to nothing so the grid returns to rest', () => {
		expect(pingDecay(0)).toBeCloseTo(1, 5);
		expect(pingDecay(0.9)).toBeCloseTo(Math.exp(-1), 5);
		expect(pingDecay(4)).toBeLessThan(0.02); // spliced as dead by then
	});
});
