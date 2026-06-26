// Dependency-free raster asset generator for Vamp.
//
// We have no ImageMagick / rsvg / sharp available (and org policy keeps native
// deps out), so this renders the brand mark + wordmark into a pixel buffer and
// encodes PNGs by hand (zlib is built in). Outputs PWA icons, an apple-touch
// icon, a favicon PNG, and a 1200x630 Open Graph image — all to static/.
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

// ------------------------------------------------------------------ rendering
const BG = hex('#1C1A1F');
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
	const dx = x2 - x1;
	const dy = y2 - y1;
	const l2 = dx * dx + dy * dy;
	let t = l2 ? ((px - x1) * dx + (py - y1) * dy) / l2 : 0;
	t = Math.max(0, Math.min(1, t));
	return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
function distPoly(px, py, pts) {
	let d = Infinity;
	for (let i = 0; i < pts.length - 1; i++)
		d = Math.min(d, distSeg(px, py, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]));
	return d;
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
	// Stroke a polyline with a per-pixel colour fn, anti-aliased over ~1px.
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
				const d = distPoly(x + 0.5, y + 0.5, pts);
				const cov = Math.max(0, Math.min(1, halfW - d + 0.5));
				if (cov > 0) this.blend(x, y, colorFn(x, y), cov);
			}
	}
	// Filled rounded rectangle (signed-distance, anti-aliased).
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
	circle(cx, cy, r, rgb, alpha = 1) {
		const x0 = Math.max(0, Math.floor(cx - r - 1)), x1 = Math.min(this.w - 1, Math.ceil(cx + r + 1));
		const y0 = Math.max(0, Math.floor(cy - r - 1)), y1 = Math.min(this.h - 1, Math.ceil(cy + r + 1));
		for (let py = y0; py <= y1; py++)
			for (let px = x0; px <= x1; px++) {
				const d = Math.hypot(px + 0.5 - cx, py + 0.5 - cy) - r;
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

// Chord-quality palette (matches the app's colour-coding).
const PALETTE = ['#1FB6A6', '#7B61FF', '#FF7B00', '#F0445A', '#E255A1', '#2E9BF0'].map(hex);

// Soft diagonal-gradient glow centred at (gcx,gcy) so the dark field has depth.
function glow(cv, gcx, gcy, strength = 0.08, spread = 6) {
	for (let y = 0; y < cv.h; y++)
		for (let x = 0; x < cv.w; x++) {
			const dx = (x - gcx) / cv.w;
			const dy = (y - gcy) / cv.h;
			const g = Math.max(0, 1 - (dx * dx + dy * dy) * spread);
			if (g > 0) cv.blend(x, y, grad((x / cv.w + y / cv.h) / 2), strength * g * g);
		}
}

// A row/grid of colour-coded "chord card" chips, each with a little triad of dots.
function chip(cv, x, y, w, h, color) {
	cv.roundRect(x, y, w, h, Math.min(w, h) * 0.18, color);
	const dotY = y + h / 2;
	const dr = Math.min(w, h) * 0.075;
	for (let k = 0; k < 3; k++) cv.circle(x + w / 2 + (k - 1) * dr * 3, dotY, dr, [255, 255, 255], 0.92);
}

// The V mark, matching static/vamp-icon.svg proportions, with a diagonal
// gradient fill (top-left orange -> bottom-right violet).
function drawMark(cv, cx, cy, size) {
	const s = size;
	const x = cx - s / 2;
	const y = cy - s / 2;
	const pts = [
		[x + 0.293 * s, y + 0.293 * s],
		[x + 0.5 * s, y + 0.723 * s],
		[x + 0.707 * s, y + 0.293 * s]
	];
	const half = 0.082 * s; // stroke half-width
	const gx0 = x + 0.293 * s, gy0 = y + 0.293 * s, span = 0.43 * s;
	cv.stroke(pts, half, (px, py) => grad(((px - gx0) + (py - gy0)) / (2 * span)));
}

// Geometric capital glyphs as stroked polylines, in a local box: width per em,
// height 1 (y down). Returns {paths, width}.
function glyph(ch) {
	const W = 0.62;
	if (ch === 'V') return { width: W, paths: [[[0, 0], [W / 2, 1], [W, 0]]] };
	if (ch === 'A')
		return {
			width: W,
			paths: [
				[[0, 1], [W / 2, 0], [W, 1]],
				[[0.18 * W, 0.62], [0.82 * W, 0.62]]
			]
		};
	if (ch === 'M')
		return { width: W, paths: [[[0, 1], [0, 0], [W / 2, 0.66], [W, 0], [W, 1]]] };
	if (ch === 'P') {
		const rx = 0.42 * W, cyb = 0.27, ry = 0.27;
		const bowl = [];
		for (let i = 0; i <= 18; i++) {
			const a = -Math.PI / 2 + (Math.PI * i) / 18;
			bowl.push([Math.cos(a) * rx, cyb + Math.sin(a) * ry]);
		}
		return { width: W, paths: [[[0, 1], [0, 0]], bowl] };
	}
	return { width: W, paths: [] };
}

function drawWord(cv, text, cx, baselineY, capH, color, spacingEm = 0.3, halfEm = 0.085) {
	const glyphs = [...text].map(glyph);
	const totalW = glyphs.reduce((s, g) => s + g.width, 0) + spacingEm * (glyphs.length - 1);
	let penX = cx - (totalW * capH) / 2;
	const topY = baselineY - capH;
	for (const g of glyphs) {
		for (const path of g.paths) {
			const pts = path.map(([gx, gy]) => [penX + gx * capH, topY + gy * capH]);
			cv.stroke(pts, halfEm * capH, () => color);
		}
		penX += (g.width + spacingEm) * capH;
	}
}

// ----------------------------------------------------------------- icon tiles
function icon(size, markFrac = 0.6) {
	const cv = new Canvas(size, size);
	cv.fill(BG);
	drawMark(cv, size / 2, size / 2, size * markFrac);
	return encodePNG(size, size, cv.rgb());
}

function writeIcon(name, size, markFrac) {
	writeFileSync(join(OUT, name), icon(size, markFrac));
	console.log(`  ${name}  ${size}x${size}`);
}

// --------------------------------------------------------------- OG share card
function ogImage() {
	const W = 1200, H = 630;
	const cv = new Canvas(W, H);
	cv.fill(BG);
	// Soft diagonal glow behind the mark so the dark field has depth.
	for (let y = 0; y < H; y++)
		for (let x = 0; x < W; x++) {
			const dx = (x - W / 2) / W;
			const dy = (y - 232) / H;
			const glow = Math.max(0, 1 - (dx * dx + dy * dy) * 6);
			if (glow > 0) cv.blend(x, y, grad((x / W + y / H) / 2), 0.08 * glow * glow);
		}
	drawMark(cv, W / 2, 232, 300);
	drawWord(cv, 'VAMP', W / 2, 470, 120, [255, 255, 255], 0.32, 0.085);
	// Gradient accent rule under the wordmark.
	cv.stroke([[W / 2 - 110, 512], [W / 2 + 110, 512]], 5, (px) => grad((px - (W / 2 - 110)) / 220));
	return encodePNG(W, H, cv.rgb());
}

// ----------------------------------------------------- install promo shots
function screenshotWide() {
	const W = 1280, H = 720;
	const cv = new Canvas(W, H);
	cv.fill(BG);
	glow(cv, W / 2, 210, 0.09, 5);
	drawMark(cv, W / 2, 196, 196);
	drawWord(cv, 'VAMP', W / 2, 360, 86, [255, 255, 255], 0.32, 0.085);
	cv.stroke([[W / 2 - 86, 396], [W / 2 + 86, 396]], 4, (px) => grad((px - (W / 2 - 86)) / 172));
	const n = 5, cw = 176, ch = 104, gap = 28;
	let x = (W - (n * cw + (n - 1) * gap)) / 2;
	for (let i = 0; i < n; i++, x += cw + gap) chip(cv, x, 486, cw, ch, PALETTE[i % PALETTE.length]);
	return encodePNG(W, H, cv.rgb());
}

function screenshotNarrow() {
	const W = 720, H = 1280;
	const cv = new Canvas(W, H);
	cv.fill(BG);
	glow(cv, W / 2, 380, 0.1, 4);
	drawMark(cv, W / 2, 360, 240);
	drawWord(cv, 'VAMP', W / 2, 580, 98, [255, 255, 255], 0.32, 0.085);
	cv.stroke([[W / 2 - 100, 624], [W / 2 + 100, 624]], 5, (px) => grad((px - (W / 2 - 100)) / 200));
	const cw = 224, ch = 128, gx = 36, gy = 36, cols = 2, rows = 3;
	const x0 = (W - (cols * cw + (cols - 1) * gx)) / 2, y0 = 724;
	for (let r = 0; r < rows; r++)
		for (let c = 0; c < cols; c++) {
			const i = r * cols + c;
			chip(cv, x0 + c * (cw + gx), y0 + r * (ch + gy), cw, ch, PALETTE[i % PALETTE.length]);
		}
	return encodePNG(W, H, cv.rgb());
}

// ----------------------------------------------------------------------- main
console.log('Generating Vamp assets ->', OUT);
writeIcon('pwa-192.png', 192, 0.6);
writeIcon('pwa-512.png', 512, 0.6);
writeIcon('apple-touch-icon.png', 180, 0.66); // iOS rounds corners itself; no mask
writeIcon('favicon-48.png', 48, 0.66);
writeFileSync(join(OUT, 'og-image.png'), ogImage());
console.log('  og-image.png  1200x630');
writeFileSync(join(OUT, 'screenshot-wide.png'), screenshotWide());
console.log('  screenshot-wide.png  1280x720');
writeFileSync(join(OUT, 'screenshot-narrow.png'), screenshotNarrow());
console.log('  screenshot-narrow.png  720x1280');
console.log('Done.');
