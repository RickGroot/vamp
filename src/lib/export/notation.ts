// Export the notation (the chord chart / staff) as a PNG, a PDF, or to the
// clipboard. Dependency-free.
//
// APPROACH: re-render the score to an offscreen <canvas> via VexFlow's Canvas
// backend. A live-document canvas rasterises glyphs from the fonts already
// registered in `document.fonts` — Bravura (VexFlow's music font, registered
// when 'vexflow' is imported) for noteheads/clef, and Petaluma Script (our jazz
// font, via ensureJazzFont) for the chord names we draw ourselves. Serialising
// the live <svg> to an image would lose both fonts (isolated font context), so
// canvas is the robust route. This is a SEPARATE, simpler single-pass layout
// than StaffSheet's live two-pass view — it only needs to produce a clean chart,
// not match the live view pixel-for-pixel — so the fragile live component is
// left untouched. PNG is the foundation for the clipboard copy and the raster
// PDF; MIDI has its own dependency-free writer (export/midi.ts), reused by the UI.

import { Note } from 'tonal';
import type { Bar, Progression, TimeSignature } from '$lib/model/types';
import { flattenSlots } from '$lib/model/slots';
import { parseChord } from '$lib/audio/chord';
import { displayChord } from '$lib/audio/transpose';
import { notationVoicing, voicedToVexKey, beatsToVexDuration } from '$lib/notation/vex';
import { ensureJazzFont, JAZZ_FONT } from '$lib/notation/font';
import { downloadBlob, safeFileName } from '$lib/storage/backup';

export interface NotationExportOpts {
	/** true = chord tones on the staff; false = a chords-only chart. */
	showNotes: boolean;
	/** Transposing-instrument offset (written pitch), from view.offset. */
	offset: number;
}

const EXPORT_WIDTH = 1100; // logical px — fixed so wrapping is stable, not viewport-derived
const EXPORT_SCALE = 3; // supersample for crisp raster output (independent of devicePixelRatio)
const PX_LIMIT = 32767; // browser canvas dimension ceiling

// Row geometry (logical px). Voicings are bounded to a compact ~B3–G5 window
// (notationVoicing), so fixed reserves never clip — no measure pass needed.
const PAD = 16;
const NAME_BAND = 22; // room above the staff for a chord name
const ABOVE = 18; // notes/ledger lines above the top staff line
const STAFF = 40; // 4 spaces × 10px
const BELOW = 30; // notes/ledger lines below the bottom line
const ROW_GAP = 14;
const ROW_H = NAME_BAND + ABOVE + STAFF + BELOW;
const CLEF_W = 36;
const TIME_W = 28;

interface Placement {
	bar: Bar;
	index: number;
	x: number;
	w: number;
	row: number;
	firstInRow: boolean;
	slotStart: number;
}

function computeColumns(bars: Bar[], available: number) {
	const placements: Placement[] = [];
	let x = 10;
	let row = 0;
	let rowLen = 0;
	let slotStart = 0;
	const widthOf = (bar: Bar, firstInRow: boolean, globalFirst: boolean) =>
		60 + bar.slots.length * 54 + (firstInRow ? CLEF_W : 0) + (globalFirst ? TIME_W : 0);
	bars.forEach((bar, index) => {
		let firstInRow = rowLen === 0;
		let w = widthOf(bar, firstInRow, index === 0);
		if (!firstInRow && x + w > available) {
			row++;
			x = 10;
			rowLen = 0;
			firstInRow = true;
			w = widthOf(bar, true, index === 0);
		}
		placements.push({ bar, index, x, w, row, firstInRow, slotStart });
		x += w;
		rowLen++;
		slotStart += bar.slots.length;
	});
	return { placements, rowCount: row + 1 };
}

/** Re-render the notation to an offscreen canvas at export resolution. */
async function renderNotationCanvas(
	p: Progression,
	o: NotationExportOpts
): Promise<HTMLCanvasElement> {
	const VF = await import('vexflow'); // registers Bravura into document.fonts
	await ensureJazzFont();
	// Canvas paints glyphs ONCE from whatever fonts are resident — unlike DOM
	// text it never re-flows when a webfont finishes. So both fonts must be fully
	// loaded before the first draw, or noteheads/names render blank/fallback.
	await Promise.all([
		document.fonts.load('40px Bravura'),
		document.fonts.load(`16px '${JAZZ_FONT}'`)
	]).catch(() => {
		/* a missing font degrades, doesn't throw (mirrors StaffSheet) */
	});
	await document.fonts.ready;

	const { Renderer, Stave, StaveNote, Voice, Formatter, Accidental } = VF;
	const ts: TimeSignature = p.timeSignature;
	const flat = flattenSlots(p.bars);
	const written = flat.map((f) => displayChord(f.slot.chord, o.offset));
	const voicings = written.map((sym) => {
		const c = parseChord(sym);
		return c.empty ? [] : notationVoicing(c.notes, c.bass);
	});

	const { placements, rowCount } = computeColumns(p.bars, EXPORT_WIDTH);
	const height = PAD * 2 + rowCount * ROW_H + (rowCount - 1) * ROW_GAP;

	// Supersample, clamped to the canvas pixel ceiling (tall charts).
	const scale = Math.max(1, Math.min(EXPORT_SCALE, Math.floor(PX_LIMIT / Math.max(EXPORT_WIDTH, height))));
	const canvas = document.createElement('canvas');
	canvas.width = Math.round(EXPORT_WIDTH * scale);
	canvas.height = Math.round(height * scale);
	const g = canvas.getContext('2d');
	if (!g) throw new Error('Canvas 2D unavailable.');
	g.scale(scale, scale); // draw in logical coords, rasterise at `scale`
	g.fillStyle = '#ffffff';
	g.fillRect(0, 0, EXPORT_WIDTH, height); // opaque paper (canvas starts transparent)

	const renderer = new Renderer(canvas, Renderer.Backends.CANVAS);
	const ctx = renderer.getContext(); // wraps the same 2d context; our scale transform persists

	const ink = getComputedStyle(document.documentElement).getPropertyValue('--color-text').trim() || '#1c1a1f';
	const nameCentres: { x: number; y: number; symbol: string }[] = [];

	for (const pl of placements) {
		const staveY = PAD + pl.row * (ROW_H + ROW_GAP) + NAME_BAND + ABOVE;
		const stave = new Stave(pl.x, staveY, pl.w);
		if (pl.firstInRow) stave.addClef('treble');
		if (pl.index === 0) stave.addTimeSignature(`${ts.numerator}/${ts.denominator}`);
		stave.setContext(ctx).draw();

		const notes = pl.bar.slots.map((slot, i) => {
			const vi = pl.slotStart + i;
			const dur = beatsToVexDuration(slot.beats, ts);
			const voiced = voicings[vi];
			if (!o.showNotes) {
				// Chart mode: an invisible placeholder keeps the bar spacing (the live
				// view hides these via CSS, which doesn't exist on canvas).
				const n = new StaveNote({ keys: ['b/4'], duration: dur });
				n.setStyle({ fillStyle: 'transparent', strokeStyle: 'transparent' });
				return n;
			}
			if (!voiced || voiced.length === 0) {
				return new StaveNote({ keys: ['b/4'], duration: `${dur}r` });
			}
			const keys = voiced.map(voicedToVexKey);
			const n = new StaveNote({ keys: keys.map((k) => k.key), duration: dur, stemDirection: -1 });
			keys.forEach((k, idx) => {
				if (k.accidental) n.addModifier(new Accidental(k.accidental), idx);
			});
			return n;
		});

		const voice = new Voice({ numBeats: ts.numerator, beatValue: ts.denominator }).setMode(Voice.Mode.SOFT);
		voice.addTickables(notes);
		const reserved = (pl.firstInRow ? CLEF_W : 0) + (pl.index === 0 ? TIME_W : 0) + 20;
		new Formatter().joinVoices([voice]).format([voice], pl.w - reserved);
		voice.draw(ctx, stave);

		// Chord names: our own text, above the staff, in the jazz font.
		notes.forEach((n, i) => {
			const sym = written[pl.slotStart + i]?.trim();
			if (sym) nameCentres.push({ x: n.getAbsoluteX(), y: staveY - ABOVE - 4, symbol: sym });
		});
	}

	// Draw the chord names last so nothing overpaints them.
	g.save();
	g.fillStyle = ink;
	g.textAlign = 'center';
	g.textBaseline = 'alphabetic';
	g.font = `16px '${JAZZ_FONT}'`;
	for (const n of nameCentres) g.fillText(n.symbol, n.x, n.y);
	g.restore();

	return canvas;
}

const toPng = (c: HTMLCanvasElement): Promise<Blob> =>
	new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('PNG encode failed'))), 'image/png'));

/** Download the notation as a PNG. */
export async function exportNotationPng(p: Progression, o: NotationExportOpts): Promise<void> {
	downloadBlob(await toPng(await renderNotationCanvas(p, o)), `${safeFileName(p.name)}.png`);
}

/** Copy the notation image to the clipboard; falls back to a download. */
export async function copyNotationImage(
	p: Progression,
	o: NotationExportOpts
): Promise<'copied' | 'downloaded'> {
	if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
		await exportNotationPng(p, o);
		return 'downloaded';
	}
	// Pass the generation Promise straight into ClipboardItem so the async render
	// runs INSIDE write() while the click's transient activation is still alive
	// (awaiting the blob first drops activation in WebKit → NotAllowedError).
	const blob = renderNotationCanvas(p, o).then(toPng);
	try {
		await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
		return 'copied';
	} catch {
		try {
			await navigator.clipboard.write([new ClipboardItem({ 'image/png': await blob })]);
			return 'copied';
		} catch {
			downloadBlob(await blob, `${safeFileName(p.name)}.png`);
			return 'downloaded';
		}
	}
}

/** Download the notation as a single-page raster PDF. */
export async function exportNotationPdf(p: Progression, o: NotationExportOpts): Promise<void> {
	downloadBlob(await canvasToPdf(await renderNotationCanvas(p, o)), `${safeFileName(p.name)}.pdf`);
}

/** zlib deflate (→ PDF /FlateDecode) via the platform CompressionStream. */
async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
	const stream = new Blob([bytes as unknown as BlobPart]).stream().pipeThrough(new CompressionStream('deflate'));
	return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Wrap the canvas as a single-image XObject in a hand-assembled PDF 1.4. */
async function canvasToPdf(canvas: HTMLCanvasElement): Promise<Blob> {
	const pxW = canvas.width;
	const pxH = canvas.height;
	const ptW = ((pxW * 72) / 96).toFixed(2);
	const ptH = ((pxH * 72) / 96).toFixed(2);

	let img: Uint8Array;
	let filter: string;
	if (typeof CompressionStream !== 'undefined') {
		const rgba = canvas.getContext('2d')!.getImageData(0, 0, pxW, pxH).data;
		const rgb = new Uint8Array(pxW * pxH * 3); // DeviceRGB, alpha flattened onto white
		for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
			const a = rgba[i + 3] / 255;
			rgb[j] = Math.round(rgba[i] * a + 255 * (1 - a));
			rgb[j + 1] = Math.round(rgba[i + 1] * a + 255 * (1 - a));
			rgb[j + 2] = Math.round(rgba[i + 2] * a + 255 * (1 - a));
		}
		img = await deflate(rgb);
		filter = '/FlateDecode';
	} else {
		// Old WebKit without CompressionStream: embed JPEG bytes directly.
		const jpeg = await new Promise<Blob>((res, rej) =>
			canvas.toBlob((b) => (b ? res(b) : rej(new Error('JPEG encode failed'))), 'image/jpeg', 0.95)
		);
		img = new Uint8Array(await jpeg.arrayBuffer());
		filter = '/DCTDecode';
	}

	const enc = new TextEncoder();
	const parts: Uint8Array[] = [];
	const off: number[] = [];
	let pos = 0;
	const put = (x: string | Uint8Array) => {
		const b = typeof x === 'string' ? enc.encode(x) : x;
		parts.push(b);
		pos += b.length;
	};
	const obj = (n: number, body: string) => {
		off[n] = pos;
		put(`${n} 0 obj\n${body}\nendobj\n`);
	};

	put('%PDF-1.4\n');
	obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
	obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
	obj(
		3,
		`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${ptW} ${ptH}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`
	);
	off[4] = pos;
	put(
		`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${pxW} /Height ${pxH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter ${filter} /Length ${img.length} >>\nstream\n`
	);
	put(img);
	put('\nendstream\nendobj\n');
	const content = `q ${ptW} 0 0 ${ptH} 0 0 cm /Im0 Do Q`;
	obj(5, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
	const xref = pos;
	put('xref\n0 6\n0000000000 65535 f \n');
	for (let n = 1; n <= 5; n++) put(`${String(off[n]).padStart(10, '0')} 00000 n \n`);
	put(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);

	return new Blob(parts as unknown as BlobPart[], { type: 'application/pdf' });
}
