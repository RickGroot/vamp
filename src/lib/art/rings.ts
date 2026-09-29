// Growth rings: the loop drawn as a tree's cross-section around the play disc.
//
// The innermost band is the loop itself — one arc per bar, in the pigment of
// that bar's chord, with a hand that travels round it in time. Every completed
// pass (a chorus) leaves a ring outside it, and each ring is shaped by the
// progression: bars that pull harder (dominants) push the ring out a little, the
// way a good growing season widens a tree ring. Stop, and the rings are what
// you played.
//
// Pure geometry (SVG path strings in a caller-chosen coordinate system) — unit
// tested in node.

import { TENSION } from './music';
import type { ChordFamily } from '$lib/model/chords';

const TAU = Math.PI * 2;

/** Point on a circle, angle 0 at 12 o'clock, clockwise. */
export function polar(cx: number, cy: number, r: number, angle: number): [number, number] {
	return [cx + Math.sin(angle) * r, cy - Math.cos(angle) * r];
}

const f2 = (n: number) => Math.round(n * 100) / 100;

/**
 * One arc per bar, as open SVG paths to stroke. `gap` is the angle left
 * between bars (radians). A single bar is a full ring.
 */
export function barArcs(count: number, cx: number, cy: number, r: number, gap = 0.05): string[] {
	if (count <= 0) return [];
	if (count === 1) {
		const [x0, y0] = polar(cx, cy, r, 0);
		const [x1, y1] = polar(cx, cy, r, Math.PI);
		return [`M${f2(x0)} ${f2(y0)}A${r} ${r} 0 1 1 ${f2(x1)} ${f2(y1)}A${r} ${r} 0 1 1 ${f2(x0)} ${f2(y0)}`];
	}
	const span = TAU / count;
	const g = Math.min(gap, span * 0.4);
	return Array.from({ length: count }, (_, i) => {
		const a0 = i * span + g / 2;
		const a1 = (i + 1) * span - g / 2;
		const [x0, y0] = polar(cx, cy, r, a0);
		const [x1, y1] = polar(cx, cy, r, a1);
		const large = a1 - a0 > Math.PI ? 1 : 0;
		return `M${f2(x0)} ${f2(y0)}A${r} ${r} 0 ${large} 1 ${f2(x1)} ${f2(y1)}`;
	});
}

/**
 * The radius offset of a growth ring at `angle`: a little bulge under each
 * tense bar (smoothed across bar edges) plus a slow wobble that drifts between
 * rings, so consecutive rings follow each other like real ones and never cross.
 */
export function ringOffset(angle: number, ring: number, tensions: number[], amp = 1): number {
	const n = tensions.length;
	let pull = 0;
	if (n > 0) {
		const pos = (((angle / TAU) % 1) + 1) % 1 * n; // 0..n across the bars
		const i = Math.floor(pos);
		const t = pos - i;
		const here = tensions[i % n];
		const next = tensions[(i + 1) % n];
		// Ease across the bar so the bulge has no corners.
		const s = t < 0.5 ? 0 : (t - 0.5) * 2;
		const e = s * s * (3 - 2 * s);
		pull = here + (next - here) * e;
	}
	const wobble = 0.35 * Math.sin(2 * angle + ring * 0.07) + 0.25 * Math.sin(3 * angle + ring * 0.13);
	return amp * (0.9 * pull + wobble);
}

/** A closed growth-ring path at radius `r`, shaped by the bar tensions. */
export function ringPath(cx: number, cy: number, r: number, ring: number, tensions: number[], steps = 96): string {
	let d = '';
	for (let s = 0; s < steps; s++) {
		const a = (s / steps) * TAU;
		const [x, y] = polar(cx, cy, r + ringOffset(a, ring, tensions), a);
		d += `${s === 0 ? 'M' : 'L'}${f2(x)} ${f2(y)}`;
	}
	return d + 'Z';
}

/** Tension per bar from each bar's family (a rest bar sits at rest). */
export function tensionsOf(families: (ChordFamily | null)[]): number[] {
	return families.map((f) => (f ? TENSION[f] : 0));
}

/** "3 choruses · 4:12" — the session, once it's over. */
export function sessionSummary(choruses: number, ms: number): string {
	const total = Math.max(0, Math.round(ms / 1000));
	const m = Math.floor(total / 60);
	const s = String(total % 60).padStart(2, '0');
	return `${choruses} ${choruses === 1 ? 'chorus' : 'choruses'} · ${m}:${s}`;
}
