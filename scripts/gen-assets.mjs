// Brand + PWA asset generator for Vamp (the "Sleeve" design).
//
// The mark is a record on a field of colour, like a Blue Note sleeve: an orange
// field, the black vinyl with its grooves, a yellow label carrying a condensed
// black V. Three steps, each writing to static/:
//
//   node scripts/gen-assets.mjs
//       vamp-icon.svg + the raster icons (pwa-192/512, apple-touch-icon,
//       favicon-48). Dependency-free: shapes rendered into a pixel buffer with
//       4×4 supersampling and PNG-encoded by hand (zlib is built in).
//
//   node scripts/gen-assets.mjs --share
//       og-image.png (1200×630), set in the real typeface. Rendered by a local
//       Chrome/Chromium in headless mode (no npm dependency; set CHROME to its
//       path if it isn't found).
//
//   node scripts/gen-assets.mjs --screenshots http://localhost:5179
//       screenshot-wide.png (1280×720, light) and screenshot-narrow.png
//       (720×1280, dark phone) for the install dialog, from a RUNNING app (the
//       dev server, or `node scripts/preview-static.mjs` → http://localhost:5181/vamp/).

import { writeFileSync, mkdirSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { deflateSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'static');
const FONT = join(ROOT, 'src', 'lib', 'assets', 'archivo-latin-var.woff2');
mkdirSync(OUT, { recursive: true });

// ------------------------------------------------------------------- palette
// Kept in step with src/app.scss (light theme).
const C = {
	field: '#ff5c1c', // dominant orange: the field
	vinyl: '#0e0e0f',
	groove: '#2c2c30',
	label: '#ffbd1a', // major yellow
	ink: '#0e0e0f',
	board: '#ffffff',
	minor: '#4f7dff'
};

// ---------------------------------------------------------- the mark's geometry
// In a 512 box, centred on (256, 256). The disc fits the maskable safe zone
// (the central circle of radius 0.4 × 512 = 204.8).
const MARK = {
	disc: 178,
	grooves: [116, 130, 144, 158, 170],
	grooveW: 2.6,
	label: 94,
	// A heavy condensed V on the label.
	v: [
		[-54, -60],
		[-24, -60],
		[0, 6],
		[24, -60],
		[54, -60],
		[14, 60],
		[-14, 60]
	]
};

function markSvg({ withField = true } = {}) {
	const pts = MARK.v.map(([x, y]) => `${256 + x},${256 + y}`).join(' ');
	return [
		withField ? `<rect width="512" height="512" fill="${C.field}"/>` : '',
		`<circle cx="256" cy="256" r="${MARK.disc}" fill="${C.vinyl}"/>`,
		...MARK.grooves.map(
			(r) => `<circle cx="256" cy="256" r="${r}" fill="none" stroke="${C.groove}" stroke-width="${MARK.grooveW}"/>`
		),
		`<circle cx="256" cy="256" r="${MARK.label}" fill="${C.label}"/>`,
		`<polygon points="${pts}" fill="${C.ink}"/>`
	].join('');
}

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

// ---------------------------------------------------------- icon rasteriser
const hex = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
const RGB = Object.fromEntries(Object.entries(C).map(([k, v]) => [k, hex(v)]));

function inPolygon(x, y, pts) {
	let inside = false;
	for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
		const [xi, yi] = pts[i];
		const [xj, yj] = pts[j];
		if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
	}
	return inside;
}

// The colour of the mark at a point in its 512 box (painter's order, top wins).
function markAt(x, y) {
	const dx = x - 256;
	const dy = y - 256;
	const r = Math.hypot(dx, dy);
	if (inPolygon(dx, dy, MARK.v)) return RGB.ink;
	if (r <= MARK.label) return RGB.label;
	if (MARK.grooves.some((g) => Math.abs(r - g) <= MARK.grooveW / 2)) return RGB.groove;
	if (r <= MARK.disc) return RGB.vinyl;
	return RGB.field;
}

const SS = 4; // 4×4 samples per pixel
function iconPNG(size) {
	const rgb = Buffer.alloc(size * size * 3);
	const k = 512 / size;
	for (let py = 0; py < size; py++)
		for (let px = 0; px < size; px++) {
			let r = 0, g = 0, b = 0;
			for (let sy = 0; sy < SS; sy++)
				for (let sx = 0; sx < SS; sx++) {
					const c = markAt((px + (sx + 0.5) / SS) * k, (py + (sy + 0.5) / SS) * k);
					r += c[0];
					g += c[1];
					b += c[2];
				}
			const i = (py * size + px) * 3;
			const n = SS * SS;
			rgb[i] = Math.round(r / n);
			rgb[i + 1] = Math.round(g / n);
			rgb[i + 2] = Math.round(b / n);
		}
	return encodePNG(size, size, rgb);
}

// ---------------------------------------------------------------- headless Chrome
function findChrome() {
	const candidates = [
		process.env.CHROME,
		'C:/Program Files/Google/Chrome/Application/chrome.exe',
		'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
		'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
		'/usr/bin/google-chrome',
		'/usr/bin/chromium',
		'/usr/bin/chromium-browser'
	].filter(Boolean);
	const found = candidates.find((p) => existsSync(p));
	if (!found) throw new Error('No Chrome/Chromium found — set CHROME to its executable path.');
	return found;
}

/** Screenshot `url` at w×h CSS px into `out`. `dark` emulates the dark colour scheme. */
function capture(url, out, w, h, { dark = false } = {}) {
	const profile = mkdtempSync(join(tmpdir(), 'vamp-shot-'));
	try {
		execFileSync(
			findChrome(),
			[
				'--headless=new',
				'--disable-gpu',
				'--hide-scrollbars',
				'--force-device-scale-factor=1',
				'--virtual-time-budget=12000',
				`--window-size=${w},${h}`,
				`--blink-settings=preferredColorScheme=${dark ? 0 : 1}`,
				`--user-data-dir=${profile}`,
				`--screenshot=${out}`,
				url
			],
			{ stdio: 'ignore', timeout: 120000 }
		);
	} finally {
		rmSync(profile, { recursive: true, force: true });
	}
	console.log(`  ${out.split(/[/\\]/).pop()}  ${w}x${h}`);
}

// --------------------------------------------------------------- share image
function shareHtml() {
	const chord = (root, q, ink) =>
		`<div class="bar"><div class="tab" style="background:${ink}"></div><span class="ch">${root}<sup>${q}</sup></span><span class="slashes"><i></i><i></i><i></i><i></i></span></div>`;
	return `<!doctype html><meta charset="utf-8"><style>
@font-face { font-family: Archivo; src: url('${pathToFileURL(FONT).href}') format('woff2'); font-weight: 100 900; font-stretch: 62% 125%; }
html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; background: ${C.board}; }
body { display: grid; grid-template-columns: 540px 1fr; font-family: Archivo, sans-serif; color: ${C.ink}; }
.field { position: relative; overflow: hidden; background: ${C.field}; }
.field svg { position: absolute; left: -170px; top: 45px; width: 540px; height: 540px; }
.copy { display: flex; flex-direction: column; padding: 58px 64px 54px 60px; border-left: 4px solid ${C.ink}; }
.mark { font-stretch: 62%; font-weight: 900; font-size: 236px; line-height: 0.78; text-transform: uppercase; letter-spacing: -0.005em; }
.line { margin: 34px 0 0; font-weight: 750; font-size: 31px; line-height: 1.18; max-width: 19ch; }
.chart { display: flex; margin-top: auto; border-left: 3px solid ${C.ink}; }
.bar { flex: 1; display: flex; flex-direction: column; padding: 0 12px 6px; border-right: 3px solid ${C.ink}; }
.bar:last-child { border-right-width: 9px; }
.tab { height: 8px; }
.ch { margin-top: 12px; font-stretch: 72%; font-weight: 800; font-size: 50px; line-height: 1; }
.ch sup { font-size: 0.56em; vertical-align: 0.55em; margin-left: 0.04em; }
.slashes { display: flex; justify-content: space-around; margin-top: 14px; }
.slashes i { width: 4px; height: 18px; background: #3f3f43; transform: skewX(-22deg); }
</style>
<div class="field"><svg viewBox="0 0 512 512">${markSvg({ withField: false })}</svg></div>
<div class="copy">
	<div class="mark">Vamp</div>
	<p class="line">Sketch the changes, loop a band, practise in every key.</p>
	<div class="chart">${chord('D', 'm7', C.minor)}${chord('G', '7', C.field)}${chord('C', 'maj7', C.label)}</div>
</div>`;
}

// ----------------------------------------------------------------- screenshots
// The demo tune for the install screenshots (illustrative content).
const DEMO = {
	schemaVersion: 1,
	name: 'Evening sketch',
	tempo: 112,
	timeSignature: { numerator: 4, denominator: 4 },
	instrument: 'piano',
	groove: { pattern: 'block', bass: 'walking', drums: true, metronome: false },
	loopRange: null,
	bars: [
		['Cm7'], ['F7'], ['Bbmaj7'], ['Ebmaj7'], ['Am7b5'], ['D7'], ['Gm7'], ['Gm7', 'G7sus4'],
		['Am7b5'], ['D7'], ['Gm7', 'C7'], ['Fm7', 'Bb7'], ['Ebmaj7'], ['Edim7'], ['Fsus4', 'F'], ['Gm6']
	].map((b) => ({ slots: b.map((chord) => ({ chord, beats: 4 / b.length })) }))
};

/**
 * Screenshot through the DevTools protocol, for what the command line can't do:
 * headless Chrome won't lay a window out narrower than ~500px, so a phone needs
 * real device emulation. Uses Node's built-in WebSocket (Node 22+).
 */
async function captureDevice(url, out, { width, height, scale = 1, mobile = false, dark = false }) {
	const { spawn } = await import('node:child_process');
	const profile = mkdtempSync(join(tmpdir(), 'vamp-cdp-'));
	const chrome = spawn(findChrome(), [
		'--headless=new',
		'--disable-gpu',
		'--hide-scrollbars',
		'--remote-debugging-port=0',
		`--user-data-dir=${profile}`,
		'about:blank'
	]);
	try {
		const endpoint = await new Promise((resolve, reject) => {
			let err = '';
			const timer = setTimeout(() => reject(new Error('Chrome did not start')), 30000);
			chrome.stderr.on('data', (d) => {
				err += d;
				const m = err.match(/DevTools listening on (ws:\/\/\S+)/);
				if (m) {
					clearTimeout(timer);
					resolve(m[1]);
				}
			});
		});
		const ws = new WebSocket(endpoint);
		await new Promise((resolve, reject) => {
			ws.onopen = resolve;
			ws.onerror = reject;
		});
		let id = 0;
		const waiting = new Map();
		const events = [];
		ws.onmessage = (e) => {
			const msg = JSON.parse(e.data);
			if (msg.id && waiting.has(msg.id)) {
				const { resolve, reject } = waiting.get(msg.id);
				waiting.delete(msg.id);
				if (msg.error) reject(new Error(msg.error.message));
				else resolve(msg.result);
			} else if (msg.method) events.push(msg.method);
		};
		const send = (method, params = {}, sessionId) =>
			new Promise((resolve, reject) => {
				const msgId = ++id;
				waiting.set(msgId, { resolve, reject });
				ws.send(JSON.stringify({ id: msgId, method, params, ...(sessionId ? { sessionId } : {}) }));
			});

		const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
		const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
		const s = (method, params) => send(method, params, sessionId);
		await s('Page.enable');
		await s('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile });
		if (mobile) await s('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
		await s('Emulation.setEmulatedMedia', {
			features: [{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }]
		});
		await s('Page.navigate', { url });
		const until = Date.now() + 30000;
		while (!events.includes('Page.loadEventFired') && Date.now() < until) await new Promise((r) => setTimeout(r, 100));
		// Let the app mount, read the shared tune and load its fonts.
		await new Promise((r) => setTimeout(r, 3000));
		const { data } = await s('Page.captureScreenshot', { format: 'png' });
		writeFileSync(out, Buffer.from(data, 'base64'));
		ws.close();
	} finally {
		chrome.kill();
		await new Promise((r) => setTimeout(r, 500));
		rmSync(profile, { recursive: true, force: true });
	}
	console.log(`  ${out.split(/[/\\]/).pop()}  ${width * scale}x${height * scale}`);
}

async function screenshots(appUrl) {
	const base = appUrl.replace(/\/?$/, '/');
	const url = `${base}#s=${Buffer.from(JSON.stringify(DEMO)).toString('base64url')}`;
	capture(url, join(OUT, 'screenshot-wide.png'), 1280, 720);
	// A phone in the dark theme: 360×640 CSS px at 2×.
	await captureDevice(url, join(OUT, 'screenshot-narrow.png'), {
		width: 360,
		height: 640,
		scale: 2,
		mobile: true,
		dark: true
	});
}

// ----------------------------------------------------------------------- main
const args = process.argv.slice(2);
console.log('Generating Vamp assets ->', OUT);

if (args.includes('--share')) {
	const dir = mkdtempSync(join(tmpdir(), 'vamp-share-'));
	try {
		const page = join(dir, 'share.html');
		writeFileSync(page, shareHtml());
		capture(pathToFileURL(page).href, join(OUT, 'og-image.png'), 1200, 630);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
} else if (args.includes('--screenshots')) {
	const appUrl = args[args.indexOf('--screenshots') + 1];
	if (!appUrl) throw new Error('Usage: node scripts/gen-assets.mjs --screenshots <app url>');
	await screenshots(appUrl);
} else {
	writeFileSync(
		join(OUT, 'vamp-icon.svg'),
		`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><title>Vamp</title>${markSvg()}</svg>\n`
	);
	console.log('  vamp-icon.svg  512x512');
	for (const [name, size] of [
		['pwa-512.png', 512],
		['pwa-192.png', 192],
		['apple-touch-icon.png', 180], // iOS rounds the corners itself; full bleed
		['favicon-48.png', 48]
	]) {
		writeFileSync(join(OUT, name), iconPNG(size));
		console.log(`  ${name}  ${size}x${size}`);
	}
}
console.log('Done.');
