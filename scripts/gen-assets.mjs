// Dependency-free raster asset generator for Vamp.
//
// We have no ImageMagick / rsvg / sharp available (and org policy keeps native
// deps out), so this renders the brand into a pixel buffer and encodes PNGs by
// hand (zlib is built in). Outputs PWA icons, an apple-touch icon, a favicon, a
// 1200x630 Open Graph image, and install screenshots — all to static/.
//
// Type is drawn as flat-terminal geometric letterforms, supersampled for clean
// edges, so the "VAMP" lockup reads like a real wordmark rather than a script.
//
//   node scripts/gen-assets.mjs

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { deflateSync } from 'node:zlib';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'static');
mkdirSync(OUT, { recursive: true });

// ---------------------------------------------------------------- PNG encoder
const CRC = (() => {
	const t = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		t[n] = c >>> 0;
	}
	return t;
})();
function crc32(buf) {
	let c = 0xffffffff;
	for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
	const t = Buffer.from(type, 'ascii');
	const len = Buffer.alloc(4);
	len.writeUInt32BE(data.length, 0);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
	return Buffer.concat([len, t, data, crc]);
}
function encodePNG(w, h, rgb) {
	const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(w, 0);
	ihdr.writeUInt32BE(h, 4);
	ihdr[8] = 8; // bit depth
	ihdr[9] = 2; // colour type: truecolour RGB
	const stride = w * 3;
	const raw = Buffer.alloc(h * (1 + stride));
	for (let y = 0; y < h; y++) rgb.copy(raw, y * (1 + stride) + 1, y * stride, (y + 1) * stride);
	const idat = deflateSync(raw, { level: 9 });
	return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ------------------------------------------------------------------- palette
const BG = hex('#1C1A1F');
const WHITE = [255, 255, 255];
const KEY = hex('#ECECEE');
const STOPS = [
	[0.0, hex('#FF7B00')],
	[0.55, hex('#E255A1')],
	[1.0, hex('#7B61FF')]
];
function hex(s) {
	return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
}
function grad(t) {
	t = Math.max(0, Math.min(1, t));
	for (let i = 0; i < STOPS.length - 1; i++) {
		const [a, ca] = STOPS[i];
		const [b, cb] = STOPS[i + 1];
		if (t <= b) {
			const f = (t - a) / (b - a || 1);
			return [0, 1, 2].map((k) => ca[k] + (cb[k] - ca[k]) * f);
		}
	}
	return STOPS[STOPS.length - 1][1];
}

function distSeg(px, py, x1, y1, x2, y2) {
	const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
	let t = l2 ? ((px - x1) * dx + (py - y1) * dy) / l2 : 0;
	t = Math.max(0, Math.min(1, t));
	return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

class Canvas {
	constructor(w, h) {
		this.w = w;
		this.h = h;
		this.buf = new Float32Array(w * h * 3);
	}
	fill(rgb) {
		for (let i = 0; i < this.w * this.h; i++) {
			this.buf[i * 3] = rgb[0];
			this.buf[i * 3 + 1] = rgb[1];
			this.buf[i * 3 + 2] = rgb[2];
		}
	}
	blend(x, y, rgb, a) {
		if (a <= 0 || x < 0 || y < 0 || x >= this.w || y >= this.h) return;
		const i = (y * this.w + x) * 3;
		for (let k = 0; k < 3; k++) this.buf[i + k] = this.buf[i + k] * (1 - a) + rgb[k] * a;
	}
	// Round-capped polyline stroke (used for the icon mark + accent rules).
	stroke(pts, halfW, colorFn) {
		let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
		for (const [x, y] of pts) {
			minx = Math.min(minx, x); miny = Math.min(miny, y);
			maxx = Math.max(maxx, x); maxy = Math.max(maxy, y);
		}
		const pad = halfW + 2;
		const x0 = Math.max(0, Math.floor(minx - pad)), x1 = Math.min(this.w - 1, Math.ceil(maxx + pad));
		const y0 = Math.max(0, Math.floor(miny - pad)), y1 = Math.min(this.h - 1, Math.ceil(maxy + pad));
		for (let y = y0; y <= y1; y++)
			for (let x = x0; x <= x1; x++) {
				let d = Infinity;
				for (let i = 0; i < pts.length - 1; i++)
					d = Math.min(d, distSeg(x + 0.5, y + 0.5, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]));
				const cov = Math.max(0, Math.min(1, halfW - d + 0.5));
				if (cov > 0) this.blend(x, y, colorFn(x, y), cov);
			}
	}
	roundRect(x, y, w, h, r, rgb, alpha = 1) {
		const x0 = Math.max(0, Math.floor(x - 1)), x1 = Math.min(this.w - 1, Math.ceil(x + w + 1));
		const y0 = Math.max(0, Math.floor(y - 1)), y1 = Math.min(this.h - 1, Math.ceil(y + h + 1));
		const cx = x + w / 2, cy = y + h / 2, hx = w / 2 - r, hy = h / 2 - r;
		for (let py = y0; py <= y1; py++)
			for (let px = x0; px <= x1; px++) {
				const qx = Math.abs(px + 0.5 - cx) - hx;
				const qy = Math.abs(py + 0.5 - cy) - hy;
				const d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
				const cov = Math.max(0, Math.min(1, 0.5 - d)) * alpha;
				if (cov > 0) this.blend(px, py, rgb, cov);
			}
	}
	rgb() {
		const b = Buffer.alloc(this.w * this.h * 3);
		for (let i = 0; i < this.buf.length; i++) b[i] = Math.max(0, Math.min(255, Math.round(this.buf[i])));
		return b;
	}
}

// Soft diagonal-gradient glow centred at (gcx,gcy) so the dark field has depth.
function glow(cv, gcx, gcy, strength = 0.08, spread = 6) {
	for (let y = 0; y < cv.h; y++)
		for (let x = 0; x < cv.w; x++) {
			const dx = (x - gcx) / cv.w, dy = (y - gcy) / cv.h;
			const g = Math.max(0, 1 - (dx * dx + dy * dy) * spread);
			if (g > 0) cv.blend(x, y, grad((x / cv.w + y / cv.h) / 2), strength * g * g);
		}
}

// ----------------------------------------------------------- icon mark (V)
// Round-capped chevron matching static/vamp-icon.svg — used for the app icons.
function drawMark(cv, cx, cy, size) {
	const s = size, x = cx - s / 2, y = cy - s / 2;
	const pts = [
		[x + 0.293 * s, y + 0.293 * s],
		[x + 0.5 * s, y + 0.723 * s],
		[x + 0.707 * s, y + 0.293 * s]
	];
	const gx0 = x + 0.293 * s, gy0 = y + 0.293 * s, span = 0.43 * s;
	cv.stroke(pts, 0.082 * s, (px, py) => grad(((px - gx0) + (py - gy0)) / (2 * span)));
}

// ----------------------------------------------------- geometric letterforms
// Flat-terminal capitals as filled shapes, sampled with supersampling. Each
// glyph exposes width (in cap-height units) and an inside test in local coords
// (x: 0..width, y: 0..H, baseline at H).
function inBar(lx, ly, x1, y1, x2, y2, t) {
	const dx = x2 - x1, dy = y2 - y1, L2 = dx * dx + dy * dy || 1;
	const s = ((lx - x1) * dx + (ly - y1) * dy) / L2;
	if (s < 0 || s > 1) return false;
	return Math.hypot(lx - (x1 + s * dx), ly - (y1 + s * dy)) <= t / 2;
}
function inRing(lx, ly, cx, cy, rxOut, ryOut, t) {
	if (lx < cx) return false; // right half only (bowl)
	const nO = Math.hypot((lx - cx) / rxOut, (ly - cy) / ryOut);
	const nI = Math.hypot((lx - cx) / (rxOut - t), (ly - cy) / (ryOut - t));
	return nO <= 1 && nI >= 1;
}
function glyphDef(ch, H) {
	const t = 0.16 * H;
	if (ch === 'V') {
		const w = 0.82 * H, bars = [[0, 0, w / 2, H], [w, 0, w / 2, H]];
		return { width: w, test: (x, y) => bars.some((b) => inBar(x, y, ...b, t)) };
	}
	if (ch === 'A') {
		const w = 0.82 * H, bars = [[0, H, w / 2, 0], [w, H, w / 2, 0]];
		const cross = [0.245 * w, 0.6 * H, 0.755 * w, 0.6 * H];
		return {
			width: w,
			test: (x, y) => bars.some((b) => inBar(x, y, ...b, t)) || inBar(x, y, ...cross, t * 0.92)
		};
	}
	if (ch === 'M') {
		const w = 0.98 * H;
		const bars = [[0, H, 0, 0], [0, 0, w / 2, 0.6 * H], [w / 2, 0.6 * H, w, 0], [w, 0, w, H]];
		return { width: w, test: (x, y) => bars.some((b) => inBar(x, y, ...b, t)) };
	}
	if (ch === 'P') {
		const w = 0.74 * H, bt = 0.15 * H;
		const stem = [t / 2, 0, t / 2, H];
		const bcx = t / 2, bcy = 0.3 * H, rxOut = w - t / 2, ryOut = 0.3 * H;
		return {
			width: w,
			test: (x, y) => inBar(x, y, ...stem, t) || inRing(x, y, bcx, bcy, rxOut, ryOut, bt)
		};
	}
	return { width: 0.6 * H, test: () => false };
}

// Draw the integrated "VAMP" lockup centred at cx with the given cap height.
// The V is the gradient mark; AMP is solid (default white).
function drawLockup(cv, cx, baselineY, H, ampColor = WHITE) {
	const order = ['V', 'A', 'M', 'P'];
	const track = 0.12 * H;
	const defs = order.map((c) => glyphDef(c, H));
	const totalW = defs.reduce((s, d) => s + d.width, 0) + track * (order.length - 1);
	let penX = cx - totalW / 2;
	const topY = baselineY - H, SS = 4;
	for (let gi = 0; gi < order.length; gi++) {
		const d = defs[gi], isV = order[gi] === 'V', ox = penX, oy = topY;
		const x0 = Math.max(0, Math.floor(ox - 1)), x1 = Math.min(cv.w - 1, Math.ceil(ox + d.width + 1));
		const y0 = Math.max(0, Math.floor(oy - 1)), y1 = Math.min(cv.h - 1, Math.ceil(oy + H + 1));
		for (let py = y0; py <= y1; py++)
			for (let px = x0; px <= x1; px++) {
				let hit = 0;
				for (let sy = 0; sy < SS; sy++)
					for (let sx = 0; sx < SS; sx++)
						if (d.test(px + (sx + 0.5) / SS - ox, py + (sy + 0.5) / SS - oy)) hit++;
				const cov = hit / (SS * SS);
				if (cov > 0) {
					const col = isV ? grad(((px - ox) + (py - oy)) / (d.width + H)) : ampColor;
					cv.blend(px, py, col, cov);
				}
			}
		penX += d.width + track;
	}
}

// --------------------------------------------------------- piano keyboard
// A clean keyboard strip with a triad highlighted (chords on a keyboard).
function drawKeyboard(cv, x, y, w, h, highlightWhite = [5, 7, 9]) {
	const n = 14; // two octaves of white keys
	const gap = Math.max(2, w * 0.0035);
	const kw = (w - gap * (n - 1)) / n;
	const r = Math.min(7, kw * 0.16);
	// black-key pattern per octave (after C,D,_,F,G,A,_)
	const blackAfter = [true, true, false, true, true, true, false];
	for (let i = 0; i < n; i++) {
		const kx = x + i * (kw + gap);
		cv.roundRect(kx, y, kw, h, r, KEY);
		if (highlightWhite.includes(i)) {
			// "active" accent strip near the bottom of the key
			const sh = h * 0.26;
			cv.roundRect(kx + kw * 0.16, y + h - sh - kw * 0.16, kw * 0.68, sh, sh * 0.4, grad(i / (n - 1)));
		}
	}
	const bkw = kw * 0.6, bkh = h * 0.62;
	for (let i = 0; i < n - 1; i++) {
		if (blackAfter[i % 7]) {
			const kx = x + i * (kw + gap) + (kw + gap) - bkw / 2;
			cv.roundRect(kx, y, bkw, bkh, Math.min(4, bkw * 0.16), hex('#0E0D10'));
		}
	}
}

function accentRule(cv, cx, y, halfLen) {
	cv.stroke([[cx - halfLen, y], [cx + halfLen, y]], 4, (px) => grad((px - (cx - halfLen)) / (2 * halfLen)));
}

// ----------------------------------------------------------------- icons
function icon(size, markFrac) {
	const cv = new Canvas(size, size);
	cv.fill(BG);
	drawMark(cv, size / 2, size / 2, size * markFrac);
	return encodePNG(size, size, cv.rgb());
}
function writeIcon(name, size, markFrac) {
	writeFileSync(join(OUT, name), icon(size, markFrac));
	console.log(`  ${name}  ${size}x${size}`);
}

// --------------------------------------------------------- share + promos
function ogImage() {
	const W = 1200, H = 630, cv = new Canvas(W, H);
	cv.fill(BG);
	glow(cv, W / 2, 250, 0.09, 5);
	drawLockup(cv, W / 2, 318, 150);
	accentRule(cv, W / 2, 360, 96);
	drawKeyboard(cv, W / 2 - 280, 430, 560, 116);
	return encodePNG(W, H, cv.rgb());
}
function screenshotWide() {
	const W = 1280, H = 720, cv = new Canvas(W, H);
	cv.fill(BG);
	glow(cv, W / 2, 280, 0.09, 5);
	drawLockup(cv, W / 2, 320, 150);
	accentRule(cv, W / 2, 364, 100);
	drawKeyboard(cv, W / 2 - 340, 466, 680, 150);
	return encodePNG(W, H, cv.rgb());
}
function screenshotNarrow() {
	const W = 720, H = 1280, cv = new Canvas(W, H);
	cv.fill(BG);
	glow(cv, W / 2, 470, 0.1, 4);
	drawLockup(cv, W / 2, 500, 150);
	accentRule(cv, W / 2, 548, 96);
	drawKeyboard(cv, W / 2 - 290, 700, 580, 150);
	return encodePNG(W, H, cv.rgb());
}

// ----------------------------------------------------------------------- main
console.log('Generating Vamp assets ->', OUT);
writeIcon('pwa-192.png', 192, 0.6);
writeIcon('pwa-512.png', 512, 0.6);
writeIcon('apple-touch-icon.png', 180, 0.66); // iOS rounds corners itself; no mask
writeIcon('favicon-48.png', 48, 0.66);
const shots = [
	['og-image.png', ogImage(), '1200x630'],
	['screenshot-wide.png', screenshotWide(), '1280x720'],
	['screenshot-narrow.png', screenshotNarrow(), '720x1280']
];
for (const [name, data, dim] of shots) {
	writeFileSync(join(OUT, name), data);
	console.log(`  ${name}  ${dim}`);
}
console.log('Done.');
