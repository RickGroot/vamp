// Generative geometric "lattice" for art mode.
//
// A single full-viewport <canvas> drawn as a grid of small squares. Each square
// has a rotation = ambient(c,r,t) + wave(c,r) where:
//   • ambient — a slow parametric tilt field (two incommensurate sine waves over
//     column/row/time). This is the "algebra": every property is f(c,r,t).
//   • wave — closed-form expanding "pings". A ping is just {origin, t0, amp};
//     each square turns as the wavefront (radius = SPEED·age) sweeps over it, so
//     squares "turn around in order" outward from the cursor for free, with no
//     per-cell timers. A gentle ping follows the cursor (the headline hover
//     cascade) and a strong one fires on pointerdown.
// Colour comes from the brand palette as a slow diagonal ramp; a Gaussian halo
// around the cursor (and the wavefront) brightens + warms tiles ("colour on
// hover"). Framework-agnostic — no Svelte imports; owns its own rAF; reads the
// cursor through a getCursor() closure (the shared rune).

export interface CursorState {
	/** Smoothed cursor position, normalised 0..1 across the viewport. */
	mx: number;
	my: number;
	/** Last pointerdown position in CSS px + timestamp (0 = none). */
	pingX: number;
	pingY: number;
	pingT: number;
}

export interface Lattice {
	start(): void;
	stop(): void;
	resize(): void;
	/** Render a single static frame (the reduced-motion path: no rAF). */
	drawStatic(): void;
}

interface Ping {
	ox: number;
	oy: number;
	t0: number; // ms (performance.now)
	amp: number; // radians
}

interface Rgb {
	r: number;
	g: number;
	b: number;
}

// --- tuning ---------------------------------------------------------------
const CELL = 46; // px per grid cell
const FILL = 0.5; // square side as a fraction of CELL (gaps let content read through)
const AMB = 0.18; // ambient tilt amplitude (rad, ~10°)
const HALO = 220; // cursor proximity radius (px)
const LIFE = 0.9; // ping decay time constant (s) — fades so it always returns to rest
const SPEED = 900; // wavefront speed (px/s)
const WIDTH = 130; // wavefront ring thickness (px)
const FOLLOW_GAP = 120; // ms between follow-pings while the cursor moves
const FOLLOW_AMP = 0.55; // gentle follow-ping (rad)
const CLICK_AMP = Math.PI; // strong click ping (rad)
const MAX_PINGS = 6;
const A0 = 0.1; // resting alpha
const A1 = 0.35; // extra alpha when fully lit
const ACTIVE_MS = 1500; // window after a move that keeps full frame-rate
const IDLE_SKIP = 5; // render every Nth frame when idle (~12fps heartbeat)
const DPR_CAP = 2;

const PALETTE_VARS = ['--c-major', '--c-minor', '--c-dominant', '--c-augmented', '--c-suspended'];
const PALETTE_FALLBACK = ['#1fb6a6', '#7b61ff', '#ff7b00', '#e255a1', '#2e9bf0'];

function hexToRgb(hex: string): Rgb | null {
	const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
	if (!m) return null;
	const n = parseInt(m[1], 16);
	return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function readPalette(): Rgb[] {
	let cs: CSSStyleDeclaration | null = null;
	try {
		cs = getComputedStyle(document.documentElement);
	} catch {
		cs = null;
	}
	return PALETTE_VARS.map((v, i) => {
		const raw = cs?.getPropertyValue(v) ?? '';
		return hexToRgb(raw) ?? hexToRgb(PALETTE_FALLBACK[i])!;
	});
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpRgb = (a: Rgb, b: Rgb, t: number): Rgb => ({
	r: lerp(a.r, b.r, t),
	g: lerp(a.g, b.g, t),
	b: lerp(a.b, b.b, t)
});
const smoothstep = (x: number) => x * x * (3 - 2 * x);
const smootherstep = (x: number) => x * x * x * (x * (x * 6 - 15) + 10);
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

const WHITE: Rgb = { r: 255, g: 255, b: 255 };

// --- pure field math (exported for unit tests) ----------------------------

/** Ambient parametric tilt of the cell at (col,row) at time t (seconds), in rad. */
export function ambientTilt(c: number, r: number, t: number): number {
	return (
		AMB * Math.sin(c * 0.45 + r * 0.32 + t * 0.5) +
		0.5 * AMB * Math.sin((c - r) * 0.6 + t * 0.31 + 1.7)
	);
}

/** How far a ping's wavefront has travelled after `age` seconds, in px. */
export const wavefrontRadius = (age: number) => SPEED * age;

/** A ping's fading weight after `age` seconds (1 → 0). */
export const pingDecay = (age: number) => Math.exp(-age / LIFE);

/**
 * The "flip-through" amount [0,1] for a cell at `dist` px from a ping origin
 * whose wavefront has reached `front` px. Rises as the ring sweeps over the
 * cell, then holds. Nearer cells (smaller dist) cross their threshold at a
 * smaller front (i.e. earlier) — that's why squares turn around *in order*.
 */
export const wavefrontPassed = (dist: number, front: number) =>
	smootherstep(clamp01((front - dist) / WIDTH + 0.5));

export function createLattice(canvas: HTMLCanvasElement, getCursor: () => CursorState): Lattice {
	const ctx = canvas.getContext('2d');
	if (!ctx) return { start() {}, stop() {}, resize() {}, drawStatic() {} };
	const c2d = ctx;

	const palette = readPalette();
	const PN = palette.length;

	let dpr = 1;
	let W = 0; // CSS px
	let H = 0;
	let cols = 0;
	let rows = 0;
	let wave = new Float32Array(0);
	let needsResize = true;

	const pings: Ping[] = [];
	let raf = 0;
	let frame = 0;
	let lastPingT = 0;
	let lastFollow = 0;
	let lastMoveAt = -Infinity;
	let prevCellX = -1;
	let prevCellY = -1;
	let t0 = 0; // time origin (ms) for a stable ambient phase

	function measure() {
		dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
		W = canvas.clientWidth || window.innerWidth;
		H = canvas.clientHeight || window.innerHeight;
		canvas.width = Math.max(1, Math.round(W * dpr));
		canvas.height = Math.max(1, Math.round(H * dpr));
		c2d.setTransform(dpr, 0, 0, dpr, 0, 0);
		const nc = Math.ceil(W / CELL) + 1; // +1 cell bleed so edges never crop hard
		const nr = Math.ceil(H / CELL) + 1;
		if (nc !== cols || nr !== rows) {
			cols = nc;
			rows = nr;
			wave = new Float32Array(cols * rows);
		}
		needsResize = false;
	}

	function resize() {
		needsResize = true;
	}

	function pushPing(ox: number, oy: number, amp: number, now: number) {
		pings.push({ ox, oy, t0: now, amp });
		if (pings.length > MAX_PINGS) pings.shift();
	}

	// Zero the wave, then add each live ping's contribution. Work is bounded per
	// ping to a disc of radius (front + ring) via per-row column spans, so an old
	// (large) ping that has already faded costs nothing — it is spliced first.
	function computeWave(now: number) {
		wave.fill(0);
		const diag = Math.hypot(W, H);
		for (let p = pings.length - 1; p >= 0; p--) {
			const ping = pings[p];
			const age = (now - ping.t0) / 1000;
			const decay = pingDecay(age);
			const front = wavefrontRadius(age);
			if (decay < 0.02 || front > diag + 3 * WIDTH) {
				pings.splice(p, 1);
				continue;
			}
			const ampDecay = ping.amp * decay;
			const rOuter = front + 0.6 * WIDTH;
			const rOuterSq = rOuter * rOuter;
			for (let r = 0; r < rows; r++) {
				const cy = (r + 0.5) * CELL;
				const dy = cy - ping.oy;
				if (dy < -rOuter || dy > rOuter) continue;
				const span = rOuterSq - dy * dy;
				if (span <= 0) continue;
				const dxMax = Math.sqrt(span);
				let cMin = Math.floor((ping.ox - dxMax) / CELL);
				let cMax = Math.ceil((ping.ox + dxMax) / CELL);
				if (cMin < 0) cMin = 0;
				if (cMax > cols - 1) cMax = cols - 1;
				const rowBase = r * cols;
				for (let c = cMin; c <= cMax; c++) {
					const dx = (c + 0.5) * CELL - ping.ox;
					const dist = Math.sqrt(dx * dx + dy * dy);
					wave[rowBase + c] += ampDecay * wavefrontPassed(dist, front);
				}
			}
		}
	}

	function draw(now: number, curX: number, curY: number) {
		const t = (now - t0) / 1000;
		c2d.clearRect(0, 0, W, H);
		const S = CELL * FILL;
		const half = S / 2;
		const ramp = cols + rows;
		const twoSig = 2 * HALO * HALO;
		const uDrift = 0.05 * t;
		for (let r = 0; r < rows; r++) {
			const cy = (r + 0.5) * CELL;
			const dyc = cy - curY;
			const dycSq = dyc * dyc;
			for (let c = 0; c < cols; c++) {
				const i = r * cols + c;
				const cx = (c + 0.5) * CELL;
				const w = wave[i];
				const theta = ambientTilt(c, r, t) + w;

				// proximity halo + wavefront energy → one scalar drives lift + tint
				const dxc = cx - curX;
				const prox = Math.exp(-(dxc * dxc + dycSq) / twoSig);
				const energy = clamp01(prox + (0.6 * Math.abs(w)) / Math.PI);

				// base ramp colour: slow diagonal sweep through the palette
				let u = (c + r) / ramp + uDrift;
				u -= Math.floor(u);
				const f = u * PN;
				const k = Math.floor(f) % PN;
				const next = (k + 1) % PN;
				let col = lerpRgb(palette[k], palette[next], smoothstep(f - Math.floor(f)));
				col = lerpRgb(col, palette[next], 0.12 * energy); // one ramp-step warmer
				col = lerpRgb(col, WHITE, 0.18 * energy); // toward white near the cursor

				const aQ = Math.round((A0 + A1 * energy) / 0.02) * 0.02;
				const cos = Math.cos(theta);
				const sin = Math.sin(theta);
				c2d.setTransform(dpr * cos, dpr * sin, -dpr * sin, dpr * cos, dpr * cx, dpr * cy);
				c2d.fillStyle = `rgba(${col.r | 0},${col.g | 0},${col.b | 0},${aQ.toFixed(2)})`;
				c2d.fillRect(-half, -half, S, S);
			}
		}
		c2d.setTransform(dpr, 0, 0, dpr, 0, 0);
	}

	function tick() {
		raf = 0;
		const now = performance.now();
		if (needsResize) measure();

		const cur = getCursor();
		const curX = cur.mx * W;
		const curY = cur.my * H;

		// strong ping on a fresh pointerdown
		if (cur.pingT && cur.pingT !== lastPingT) {
			lastPingT = cur.pingT;
			pushPing(cur.pingX, cur.pingY, CLICK_AMP, now);
		}

		// movement (tracked per grid cell to throttle) → gentle follow-ping
		const cellX = Math.floor(curX / CELL);
		const cellY = Math.floor(curY / CELL);
		if (cellX !== prevCellX || cellY !== prevCellY) {
			prevCellX = cellX;
			prevCellY = cellY;
			lastMoveAt = now;
			if (now - lastFollow >= FOLLOW_GAP) {
				lastFollow = now;
				pushPing(curX, curY, FOLLOW_AMP, now);
			}
		}

		const active = now - lastMoveAt < ACTIVE_MS || pings.length > 0;
		frame++;
		if (active || frame % IDLE_SKIP === 0) {
			computeWave(now);
			draw(now, curX, curY);
		}
		raf = requestAnimationFrame(tick);
	}

	function start() {
		if (raf) return;
		if (!t0) t0 = performance.now();
		if (needsResize) measure();
		lastMoveAt = performance.now(); // initial burst so it paints immediately
		raf = requestAnimationFrame(tick);
	}

	function stop() {
		if (raf) cancelAnimationFrame(raf);
		raf = 0;
	}

	function drawStatic() {
		measure();
		t0 = performance.now();
		wave.fill(0);
		const cur = getCursor();
		draw(t0, cur.mx * W, cur.my * H);
	}

	return { start, stop, resize, drawStatic };
}
