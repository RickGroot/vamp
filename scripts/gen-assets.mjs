// Dependency-free raster asset generator for Vamp.
//
// We have no ImageMagick / rsvg / sharp available (and org policy keeps native
// deps out), so this renders the brand mark into a pixel buffer and encodes
// PNGs by hand (zlib is built in). Everything is just the gradient-V logo on a
// soft dark gradient-glow background — PWA icons, apple-touch icon, favicon,
// the Open Graph share image, and install screenshots — all written to static/.
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
	// Round-capped polyline stroke (the chevron mark).
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
	rgb() {
		const b = Buffer.alloc(this.w * this.h * 3);
		for (let i = 0; i < this.buf.length; i++) b[i] = Math.max(0, Math.min(255, Math.round(this.buf[i])));
		return b;
	}
}

// A soft radial gradient-glow behind the logo so the dark field has depth
// (brighter brand-tinted centre, falling off to the near-black edges).
function background(cv, gcx, gcy) {
	cv.fill(BG);
	const maxR = Math.hypot(cv.w, cv.h) * 0.42;
	for (let y = 0; y < cv.h; y++)
		for (let x = 0; x < cv.w; x++) {
			const r = Math.hypot(x - gcx, y - gcy) / maxR;
			const halo = Math.max(0, 1 - r) ** 2; // smooth falloff
			if (halo > 0) cv.blend(x, y, grad((x / cv.w + y / cv.h) / 2), 0.13 * halo);
		}
}

// The gradient chevron "V" logo (matches static/vamp-icon.svg).
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

// ----------------------------------------------------------------- outputs
// Icons: full-bleed dark tile + centred mark.
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

// Share image + install promos: just the logo on the glow background.
function logoCard(w, h, markSize) {
	const cv = new Canvas(w, h);
	background(cv, w / 2, h / 2);
	drawMark(cv, w / 2, h / 2, markSize);
	return encodePNG(w, h, cv.rgb());
}

// ----------------------------------------------------------------------- main
console.log('Generating Vamp assets ->', OUT);
writeIcon('pwa-192.png', 192, 0.6);
writeIcon('pwa-512.png', 512, 0.6);
writeIcon('apple-touch-icon.png', 180, 0.66); // iOS rounds corners itself; no mask
writeIcon('favicon-48.png', 48, 0.66);
const cards = [
	['og-image.png', logoCard(1200, 630, 560), '1200x630'],
	['screenshot-wide.png', logoCard(1280, 720, 620), '1280x720'],
	['screenshot-narrow.png', logoCard(720, 1280, 620), '720x1280']
];
for (const [name, data, dim] of cards) {
	writeFileSync(join(OUT, name), data);
	console.log(`  ${name}  ${dim}`);
}
console.log('Done.');
