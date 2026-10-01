// Wind in the grass: a strip of wildflower meadow along the bottom of the
// viewport that moves only with the music.
//
//   • sway — every blade and stem swings once per TWO beats, phase-locked to
//     the transport's position (not a timer), with a travelling offset across
//     the field so it ripples rather than nodding in unison. Tempo up → the
//     breeze quickens, exactly in time.
//   • gust — each chord change sends a wavefront out from the bar that just
//     started sounding; blades bend away from it as it passes. Its strength is
//     the chord's harmonic tension (a dominant gusts, a tonic barely breathes).
//   • bloom — the flowers are YOUR SONG's garden: one flower per share of each
//     chord family the song uses, in that family's ink. At rest they are buds;
//     when a family sounds its flowers open over about a beat, and close again
//     slowly once it moves on. A blank song grows every colour.
//   • stillness — when playback stops everything eases back to rest in well
//     under a second (flowers fold to buds) and the animation loop ends.
//
// Framework-agnostic (no Svelte), owns its own rAF, reads the music through a
// getSignal() closure. The field maths is exported pure for unit tests.

import { TENSION, beatPosition, type MusicClock } from './music';
import type { ChordFamily } from '$lib/model/chords';

export interface MeadowSignal {
	clock: MusicClock;
	/** Quarter notes per beat of the meter (6/8 → 0.5). */
	quartersPerBeat: number;
	/** The chord sounding now, or null (a rest, or stopped). */
	family: ChordFamily | null;
	/** performance.now() of the last chord change; 0 = none yet. */
	changeAt: number;
	/** Where that change happened, as a fraction of the viewport width. */
	originX: number;
	/** The family of every chord in the song, in order (repeats count). */
	songFamilies: ChordFamily[];
}

export interface Blade {
	/** Horizontal position, 0..1 of the width. */
	u: number;
	/** 0 = far (small, faint), 1 = near. */
	depth: number;
	/** Height as a fraction of the strip. */
	height: number;
	phase: number;
	/** Resting angle (rad). */
	lean: number;
	/** Carries the chord's pigment. */
	accent: boolean;
}

export interface Flower extends Blade {
	/** Which share of the song's garden this flower belongs to. */
	slot: number;
}

export interface Meadow {
	/** Nudge the loop awake after the music changed (play/stop, a new chord). */
	wake(): void;
	stop(): void;
	resize(): void;
	/** Re-read the colours (the theme changed). */
	refresh(): void;
	/** One frame at rest, flowers open, in the song's colours (reduced motion: no rAF). */
	drawStatic(): void;
}

// --- tuning ---------------------------------------------------------------
const SWAY = 0.075; // sway amplitude (rad, ~4°)
const WAVE_K = 0.011; // travelling-wave number across the field (rad/px)
const GUST_SPEED = 520; // wavefront speed (px/s)
const GUST_WIDTH = 90; // wavefront thickness (px)
const GUST_LIFE = 0.8; // decay (s)
const GUST_MAX = 0.42; // bend at full tension (rad, ~24°)
const SETTLE_MS = 650; // stop → at rest
const TINT_MS = 220; // pigment crossfade on a chord change
const DENSITY = 5; // px of width per blade
const MAX_BLADES = 420;
const FLOWER_SPACING = 30; // px of width per flower
const MAX_FLOWERS = 64;
const ROOT_DROP = 2; // px below the bottom edge that every stem grows from
const TURF = 0.26; // the ground band's height, as a fraction of the strip
const TURF_ALPHA = 0.55;

const ALL_FAMILIES: ChordFamily[] = ['major', 'minor', 'dominant', 'suspended', 'augmented', 'diminished'];

/** A seeded LCG, so the same viewport grows the same meadow. */
export function lcg(seed: number): () => number {
	let s = seed >>> 0;
	return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

/** The field, back to front. Deterministic for a given rand. */
export function layoutBlades(count: number, rand: () => number): Blade[] {
	const blades: Blade[] = [];
	for (let i = 0; i < count; i++) {
		const depth = rand();
		blades.push({
			u: rand(),
			depth,
			height: 0.35 + rand() * 0.6,
			phase: rand() * Math.PI * 2,
			lean: (rand() - 0.5) * 0.22,
			accent: rand() > 0.86
		});
	}
	return blades.sort((a, b) => a.depth - b.depth);
}

/** The flowers, back to front, spread evenly-ish across the width. */
export function layoutFlowers(count: number, rand: () => number): Flower[] {
	const flowers: Flower[] = [];
	for (let i = 0; i < count; i++) {
		const depth = 0.35 + rand() * 0.65;
		flowers.push({
			// Jittered strata, so flowers never clump or leave a bald patch.
			u: (i + 0.15 + rand() * 0.7) / count,
			depth,
			height: 0.45 + rand() * 0.45,
			phase: rand() * Math.PI * 2,
			lean: (rand() - 0.5) * 0.3,
			accent: true,
			slot: i
		});
	}
	// Shuffle the slots (Fisher–Yates) so neighbours differ, then draw far flowers first.
	const order = flowers.map((_, i) => i);
	for (let i = order.length - 1; i > 0; i--) {
		const j = Math.floor(rand() * (i + 1));
		[order[i], order[j]] = [order[j], order[i]];
	}
	order.forEach((slot, i) => (flowers[i].slot = slot));
	return flowers.sort((a, b) => a.depth - b.depth);
}

/**
 * Which family each of `count` flowers belongs to: shares proportional to how
 * often each family appears in the song, so a blues is an orange field with a
 * few others. An empty song gets every colour.
 */
export function flowerFamilies(song: ChordFamily[], count: number): ChordFamily[] {
	const source = song.filter((f) => f !== 'other');
	const pool = source.length ? source : ALL_FAMILIES;
	const counts = new Map<ChordFamily, number>();
	for (const f of pool) counts.set(f, (counts.get(f) ?? 0) + 1);
	// Largest-remainder apportionment: shares add up to exactly `count`, and
	// every family the song uses gets at least one flower.
	const total = pool.length;
	const entries = [...counts.entries()];
	const out: ChordFamily[] = [];
	const base = entries.map(([f, n]) => ({ f, exact: (n / total) * count }));
	for (const e of base) for (let i = 0; i < Math.max(1, Math.floor(e.exact)); i++) out.push(e.f);
	const rest = base.sort((a, b) => (b.exact % 1) - (a.exact % 1));
	for (let i = 0; out.length < count; i++) out.push(rest[i % rest.length].f);
	return out.slice(0, count);
}

/**
 * One step of a flower's opening toward `target` (0 bud … 1 open): opens over
 * about half a beat, closes over about two, independent of frame rate.
 */
export function bloomStep(open: number, target: number, dtMs: number, beatMs: number): number {
	const tau = target > open ? beatMs * 0.5 : beatMs * 2;
	const k = 1 - Math.exp(-Math.max(0, dtMs) / Math.max(1, tau));
	return open + (target - open) * k;
}

/**
 * Where a grass blade or flower stem grows from, and how tall it stands (px),
 * in a strip `h` tall. Depth makes it shorter, thinner and fainter — never
 * rooted higher up. Rooting far blades above the edge (perspective with no
 * ground drawn under it) left the bottom of the strip as bare sky, so the
 * whole meadow hovered over the bottom of the screen. Everything stands on it.
 */
export function stemSpan(b: Blade, h: number, kind: 'blade' | 'flower'): { baseY: number; len: number } {
	const len = kind === 'blade' ? b.height * h * (0.45 + 0.55 * b.depth) : b.height * h * (0.5 + 0.5 * b.depth);
	return { baseY: h + ROOT_DROP, len };
}

/**
 * A blade's angle from the beat: one full swing every two beats, offset along
 * x so the field ripples. At `amp` 0 it's the resting lean.
 */
export function swayAngle(beatPos: number, x: number, blade: Blade, amp = 1): number {
	const swing = SWAY * (0.55 + 0.45 * blade.depth);
	return blade.lean + amp * swing * Math.sin(Math.PI * beatPos + x * WAVE_K + blade.phase);
}

/**
 * The gust's bend at `dist` px from where the chord changed, `ageS` seconds
 * after it: a travelling ring that decays. Zero before the change.
 */
export function gustBend(ageS: number, dist: number, tension: number): number {
	if (ageS < 0 || tension <= 0) return 0;
	const front = GUST_SPEED * ageS;
	const ring = Math.exp(-((dist - front) ** 2) / (2 * GUST_WIDTH ** 2));
	return GUST_MAX * tension * ring * Math.exp(-ageS / GUST_LIFE);
}

/** Motion envelope: 1 while playing, easing to 0 over SETTLE_MS after a stop. */
export function settleAmp(playing: boolean, msSinceStop: number): number {
	if (playing) return 1;
	const t = Math.min(1, Math.max(0, msSinceStop / SETTLE_MS));
	return 1 - t * t * (3 - 2 * t);
}

interface Rgb {
	r: number;
	g: number;
	b: number;
}

function parseColor(raw: string): Rgb | null {
	const hex = raw.trim().match(/^#([0-9a-f]{6})$/i);
	if (hex) {
		const n = parseInt(hex[1], 16);
		return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
	}
	const rgb = raw.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
	return rgb ? { r: +rgb[1], g: +rgb[2], b: +rgb[3] } : null;
}

const rgba = (c: Rgb, a: number) => `rgba(${c.r | 0},${c.g | 0},${c.b | 0},${a.toFixed(3)})`;

export function createMeadow(canvas: HTMLCanvasElement, getSignal: () => MeadowSignal): Meadow {
	const ctx = canvas.getContext('2d');
	let blades: Blade[] = [];
	let flowers: Flower[] = [];
	let families: ChordFamily[] = [];
	let familiesKey = '';
	let w = 0;
	let h = 0;
	let raf = 0;
	let wasPlaying = false;
	let stoppedAt = 0;
	let beatPos = 0; // frozen at the last value when the music stops
	let lastFrame = 0;
	const open = new Map<ChordFamily, number>();

	// Colours come from the tokens, so the meadow follows the theme.
	let grass: Rgb = { r: 34, g: 181, b: 115 };
	let sun: Rgb = { r: 255, g: 210, b: 31 };
	let tint: Rgb = { ...grass };
	// At dusk the flowers glow against silhouetted grass.
	let glow = 0;
	const pigments = new Map<string, Rgb>();
	function readColors() {
		const cs = getComputedStyle(document.documentElement);
		grass = parseColor(cs.getPropertyValue('--grass')) ?? grass;
		sun = parseColor(cs.getPropertyValue('--sun')) ?? sun;
		glow = Number(cs.getPropertyValue('--meadow-glow').trim()) || 0;
		pigments.clear();
		for (const f of Object.keys(TENSION)) {
			const c = parseColor(cs.getPropertyValue(`--c-${f}`));
			if (c) pigments.set(f, c);
		}
	}
	readColors();

	const target = (family: ChordFamily | null): Rgb => (family && pigments.get(family)) || grass;

	function resize() {
		const dpr = Math.min(2, window.devicePixelRatio || 1);
		w = canvas.clientWidth;
		h = canvas.clientHeight;
		canvas.width = Math.max(1, Math.round(w * dpr));
		canvas.height = Math.max(1, Math.round(h * dpr));
		ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
		const seed = 0x5eed + Math.round(w);
		blades = layoutBlades(Math.min(MAX_BLADES, Math.round(w / DENSITY)), lcg(seed));
		flowers = layoutFlowers(Math.min(MAX_FLOWERS, Math.max(6, Math.round(w / FLOWER_SPACING))), lcg(seed + 1));
		familiesKey = '';
	}

	/** Recompute the garden's colours when the song's families change. */
	function syncFamilies(song: ChordFamily[]) {
		const key = `${flowers.length}|${song.join(',')}`;
		if (key === familiesKey) return;
		familiesKey = key;
		families = flowerFamilies(song, flowers.length);
	}

	function stemGeometry(b: Blade, x: number, baseY: number, len: number, a: number) {
		const tx = x + Math.sin(a) * len;
		const ty = baseY - Math.cos(a) * len;
		return { cx: x + Math.sin(a * 0.45) * len * 0.5, cy: baseY - len * 0.55, tx, ty, depth: b.depth };
	}

	function draw(sig: MeadowSignal, now: number, amp: number, allOpen = false) {
		if (!ctx || w === 0) return;
		ctx.clearRect(0, 0, w, h);
		syncFamilies(sig.songFamilies);
		const tension = sig.family ? TENSION[sig.family] : 0;
		const ageS = sig.changeAt > 0 ? (now - sig.changeAt) / 1000 : -1;
		const ox = sig.originX * w;
		const bend = (x: number, depth: number) => {
			const dx = x - ox;
			return amp * Math.sign(dx) * gustBend(ageS, Math.abs(dx), tension) * (0.5 + 0.5 * depth);
		};

		// The ground it all stands on: the grass's own colour, thickest at the
		// bottom edge, so the field meets the bottom of the screen.
		const turf = ctx.createLinearGradient(0, h, 0, h * (1 - TURF));
		turf.addColorStop(0, rgba(grass, TURF_ALPHA));
		turf.addColorStop(1, rgba(grass, 0));
		ctx.fillStyle = turf;
		ctx.fillRect(0, h * (1 - TURF), w, h * TURF);

		// Grass: green by day, silhouettes at dusk; a few blades catch the sounding chord's colour.
		for (const b of blades) {
			const x = b.u * w;
			const { baseY, len } = stemSpan(b, h, 'blade');
			const a = swayAngle(beatPos, x, b, amp) + bend(x, b.depth);
			const g = stemGeometry(b, x, baseY, len, a);
			ctx.strokeStyle = b.accent ? rgba(tint, 0.35 + 0.45 * b.depth) : rgba(grass, 0.2 + 0.5 * b.depth);
			ctx.lineWidth = 0.7 + 1.2 * b.depth;
			ctx.beginPath();
			ctx.moveTo(x, baseY);
			ctx.quadraticCurveTo(g.cx, g.cy, g.tx, g.ty);
			ctx.stroke();
		}

		// Flowers: stem, then a bud that opens into five petals round a sun-ink eye.
		for (const f of flowers) {
			const family = families[f.slot % Math.max(1, families.length)] ?? 'major';
			const ink = pigments.get(family) ?? grass;
			const x = f.u * w;
			const { baseY, len } = stemSpan(f, h, 'flower');
			const a = swayAngle(beatPos, x, f, amp) + bend(x, f.depth);
			const g = stemGeometry(f, x, baseY, len, a);
			ctx.strokeStyle = rgba(grass, 0.45 + 0.4 * f.depth);
			ctx.lineWidth = 0.8 + 0.6 * f.depth;
			ctx.beginPath();
			ctx.moveTo(x, baseY);
			ctx.quadraticCurveTo(g.cx, g.cy, g.tx, g.ty);
			ctx.stroke();

			const o = allOpen ? 1 : (open.get(family) ?? 0) * Math.max(amp, 0);
			const size = 2.6 + 3 * f.depth;
			ctx.shadowColor = rgba(ink, 0.8);
			ctx.shadowBlur = glow ? 4 + 8 * o : 0;
			if (o < 0.04) {
				// A bud: a closed drop of the family's ink.
				ctx.fillStyle = rgba(ink, 0.85);
				ctx.beginPath();
				ctx.ellipse(g.tx, g.ty, size * 0.62, size * 0.9, a, 0, Math.PI * 2);
				ctx.fill();
				continue;
			}
			const spread = size * (0.35 + 0.75 * o);
			const petal = size * (0.45 + 0.35 * o);
			ctx.fillStyle = rgba(ink, 0.9);
			for (let p = 0; p < 5; p++) {
				const pa = a + (p / 5) * Math.PI * 2 + f.phase;
				ctx.beginPath();
				ctx.arc(g.tx + Math.sin(pa) * spread, g.ty - Math.cos(pa) * spread, petal, 0, Math.PI * 2);
				ctx.fill();
			}
			ctx.fillStyle = rgba(sun, 0.95);
			ctx.beginPath();
			ctx.arc(g.tx, g.ty, size * 0.42, 0, Math.PI * 2);
			ctx.fill();
		}
		ctx.shadowBlur = 0;
	}

	function frame(now: number) {
		raf = 0;
		const sig = getSignal();
		const playing = sig.clock.playing;
		if (playing) beatPos = beatPosition(sig.clock, sig.quartersPerBeat);
		if (wasPlaying && !playing) stoppedAt = now;
		wasPlaying = playing;

		const dt = lastFrame ? now - lastFrame : 16;
		lastFrame = now;
		// Crossfade the accent blades toward the sounding chord's ink.
		const goal = target(sig.family);
		const k = Math.min(1, dt / TINT_MS);
		tint = { r: tint.r + (goal.r - tint.r) * k, g: tint.g + (goal.g - tint.g) * k, b: tint.b + (goal.b - tint.b) * k };
		// The sounding family's flowers open; the rest close.
		const beatMs = (60000 / Math.max(1, sig.clock.bpm)) * sig.quartersPerBeat;
		for (const f of ALL_FAMILIES) {
			const want = playing && sig.family === f ? 1 : 0;
			open.set(f, bloomStep(open.get(f) ?? 0, want, dt, beatMs));
		}

		const amp = settleAmp(playing, now - stoppedAt);
		draw(sig, now, amp);
		// Keep going while the music plays or the field is still settling.
		if (playing || amp > 0) raf = requestAnimationFrame(frame);
		else {
			lastFrame = 0;
			open.clear();
		}
	}

	function wake() {
		if (!raf && !document.hidden) raf = requestAnimationFrame(frame);
	}

	resize();

	return {
		wake,
		stop() {
			cancelAnimationFrame(raf);
			raf = 0;
			lastFrame = 0;
		},
		resize() {
			resize();
			if (raf) return;
			draw(getSignal(), performance.now(), 0);
		},
		refresh() {
			readColors();
			tint = target(getSignal().family);
			if (!raf) draw(getSignal(), performance.now(), 0);
		},
		drawStatic() {
			resize();
			const sig = getSignal();
			tint = target(sig.family);
			draw(sig, performance.now(), 0, true);
		}
	};
}
