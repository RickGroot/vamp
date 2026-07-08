<script lang="ts">
	import { progression } from '$lib/stores/progression.svelte';
	import { view } from '$lib/stores/view.svelte';
	import { parseChord } from '$lib/audio/chord';
	import { displayChord } from '$lib/audio/transpose';
	import { voicedToVexKey, beatsToVexDuration, notationVoicing } from '$lib/notation/vex';
	import { ensureJazzFont, JAZZ_FONT } from '$lib/notation/font';
	import type { Bar, TimeSignature } from '$lib/model/types';
	import type { RenderContext } from 'vexflow';

	const CHORD_FONT_SIZE = 16;

	interface Props {
		/** When true, render the chord tones as notes; otherwise a chords-only chart. */
		showNotes?: boolean;
	}
	let { showNotes = false }: Props = $props();

	let container = $state<HTMLDivElement>();
	let error = $state<string | null>(null);
	let noteEls = $state<Element[]>([]);
	// Last rendered width — re-flow only when the width changes (a height change
	// from auto-sizing the SVG must not retrigger a render and loop).
	let lastWidth = 0;
	// VexFlow is a large, DOM-only library — loaded lazily, only when this view mounts.
	let vf: typeof import('vexflow') | null = null;

	// A compact signature of everything the score depends on, so the render effect
	// re-runs on any chord / duration / meter / transposition / mode / structure change.
	const signature = $derived(
		JSON.stringify({
			ts: progression.current.timeSignature,
			offset: view.offset,
			notes: showNotes,
			bars: progression.current.bars.map((b) => b.slots.map((s) => [s.chord, s.beats]))
		})
	);

	const CLEF_W = 36;
	const TIME_W = 28;
	// Provisional pass spacing — wide enough that rows can't overlap while we
	// measure each one's true content extent.
	const PROV_TOP = 200;
	const PROV_H = 360;
	const ROW_GAP = 16; // gap between one row's lowest content and the next row's top
	const PAD = 8;
	const LABEL_GAP = 8; // gap between a chord name and the notes/staff below it
	const LABEL_ASCENT = CHORD_FONT_SIZE; // vertical room a chord name occupies
	// Treble-clef overhang past the staff lines (constant) — reserved so the clef is
	// never clipped, and notehead slack around VexFlow's note bounding box.
	const CLEF_ABOVE = 12;
	const CLEF_BELOW = 16;
	const HEAD_PAD = 6;

	interface Placement {
		bar: Bar;
		index: number;
		x: number;
		w: number;
		row: number;
		firstInRow: boolean;
		/** Global slot index of this bar's first slot (into `written`/`voicings`). */
		slotStart: number;
	}

	/** A chord name to draw above the staff. */
	interface Label {
		x: number;
		row: number;
		slot: number;
		symbol: string;
	}

	/** Assign each bar an x position, width and row (wrapping to fit `available`). */
	function computeColumns(bars: Bar[], available: number): { placements: Placement[]; rowCount: number } {
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

	function draw(VF: typeof import('vexflow')) {
		const { Renderer, Stave, StaveNote, Voice, Formatter, Accidental } = VF;
		const el = container;
		if (!el) return;
		el.innerHTML = '';

		const bars = progression.current.bars;
		const ts: TimeSignature = progression.current.timeSignature;
		const offset = view.offset;
		// Notation shows written pitch for the selected instrument, voiced compactly
		// around the treble staff (readable, never the deep playback registers).
		const written = bars.flatMap((b) => b.slots.map((s) => displayChord(s.chord, offset)));
		const voicings = written.map((symbol) => {
			const chord = parseChord(symbol);
			return chord.empty ? [] : notationVoicing(chord.notes, chord.bass);
		});

		const available = Math.max(320, (el.clientWidth || 600) - 4);
		lastWidth = el.clientWidth || 0;
		const { placements, rowCount } = computeColumns(bars, available);

		// Build a bar's notes (no chord labels — those are drawn separately, always
		// above the staff, so they can never collide with the staff lines).
		const buildNotes = (p: Placement) =>
			p.bar.slots.map((slot, i) => {
				const vi = p.slotStart + i;
				const dur = beatsToVexDuration(slot.beats, ts);
				const voiced = voicings[vi];
				if (!showNotes) return { note: new StaveNote({ keys: ['b/4'], duration: dur }), vi };
				if (!voiced || voiced.length === 0) {
					return { note: new StaveNote({ keys: ['b/4'], duration: `${dur}r` }), vi };
				}
				// Keys keep the chord's own spelling (F#m7 shows sharps, Bb7 flats).
				const keys = voiced.map(voicedToVexKey);
				// Stems down so the (above-staff) chord names always sit clear of the notes.
				const note = new StaveNote({ keys: keys.map((k) => k.key), duration: dur, stemDirection: -1 });
				keys.forEach((k, idx) => {
					if (k.accidental) note.addModifier(new Accidental(k.accidental), idx);
				});
				return { note, vi };
			});

		const boxY = (bb: { getY?: () => number; y?: number }) => bb.getY?.() ?? bb.y ?? 0;
		const boxH = (bb: { getH?: () => number; h?: number }) => bb.getH?.() ?? bb.h ?? 0;

		// Draw a bar's stave + notes at baseline y. Returns the chord labels, the stave's
		// true top/bottom line Y, and the notes' vertical extent — all from VexFlow's own
		// geometry (DOM getBBox is unreliable for the font-glyph noteheads/clef).
		const drawPlacement = (ctx: RenderContext, p: Placement, y: number) => {
			const stave = new Stave(p.x, y, p.w);
			if (p.firstInRow) stave.addClef('treble');
			if (p.index === 0) stave.addTimeSignature(`${ts.numerator}/${ts.denominator}`);
			stave.setContext(ctx).draw();

			const built = buildNotes(p);
			const notes = built.map((b) => b.note);
			const voice = new Voice({ numBeats: ts.numerator, beatValue: ts.denominator }).setMode(
				Voice.Mode.SOFT
			);
			voice.addTickables(notes);
			const reserved = (p.firstInRow ? CLEF_W : 0) + (p.index === 0 ? TIME_W : 0) + 20;
			new Formatter().joinVoices([voice]).format([voice], p.w - reserved);
			voice.draw(ctx, stave);

			let minY = Infinity;
			let maxY = -Infinity;
			for (const b of built) {
				try {
					const bb = b.note.getBoundingBox?.();
					if (bb) {
						minY = Math.min(minY, boxY(bb));
						maxY = Math.max(maxY, boxY(bb) + boxH(bb));
					}
				} catch {
					/* ignore unmeasurable note */
				}
			}
			const labels: Label[] = built.map((b) => ({
				x: b.note.getAbsoluteX(),
				row: p.row,
				slot: b.vi,
				symbol: written[b.vi]
			}));
			return { labels, topLine: stave.getYForLine(0), bottomLine: stave.getYForLine(4), minY, maxY };
		};

		// Pass 1 — draw spaced out and gather, per row, the staff lines + note extent.
		const r1 = new Renderer(el, Renderer.Backends.SVG);
		r1.resize(available, PROV_TOP + rowCount * PROV_H);
		const c1 = r1.getContext();
		const topLine1 = Array.from({ length: rowCount }, () => 0);
		const bottomLine1 = Array.from({ length: rowCount }, () => 40);
		const rowMinY = Array.from({ length: rowCount }, () => Infinity);
		const rowMaxY = Array.from({ length: rowCount }, () => -Infinity);
		const hasName = Array.from({ length: rowCount }, () => false);
		for (const p of placements) {
			const res = drawPlacement(c1, p, PROV_TOP + p.row * PROV_H);
			topLine1[p.row] = res.topLine;
			bottomLine1[p.row] = res.bottomLine;
			if (res.minY < rowMinY[p.row]) rowMinY[p.row] = res.minY;
			if (res.maxY > rowMaxY[p.row]) rowMaxY[p.row] = res.maxY;
			if (res.labels.some((l) => l.symbol.trim())) hasName[p.row] = true;
		}

		const lineSpan = bottomLine1[0] - topLine1[0];
		const staveTopPad = topLine1[0] - PROV_TOP;
		const clamp0 = (n: number) => Math.max(0, n);

		// How far notes poke above the top line / below the bottom line (0 if within).
		const noteAbove = Array.from({ length: rowCount }, (_, r) =>
			rowMinY[r] === Infinity ? 0 : clamp0(topLine1[r] - rowMinY[r] + HEAD_PAD)
		);
		const noteBelow = Array.from({ length: rowCount }, (_, r) =>
			rowMaxY[r] === -Infinity ? 0 : clamp0(rowMaxY[r] - bottomLine1[r] + HEAD_PAD)
		);

		// Reserve, per row: above the top line — the chord-name band over the highest note,
		// or the clef ascent; below — the lowest note or the clef descent.
		const aboveReserve = Array.from({ length: rowCount }, (_, r) =>
			Math.max(CLEF_ABOVE, noteAbove[r] + (hasName[r] ? LABEL_GAP + LABEL_ASCENT : 0))
		);
		const belowReserve = Array.from({ length: rowCount }, (_, r) =>
			Math.max(CLEF_BELOW, noteBelow[r])
		);

		// Pack rows, tracking each row's top staff line.
		const topLine = Array.from({ length: rowCount }, () => 0);
		topLine[0] = PAD + aboveReserve[0];
		for (let r = 1; r < rowCount; r++) {
			topLine[r] = topLine[r - 1] + lineSpan + belowReserve[r - 1] + ROW_GAP + aboveReserve[r];
		}
		const total = Math.ceil(topLine[rowCount - 1] + lineSpan + belowReserve[rowCount - 1] + PAD);

		// Pass 2 — final render at packed positions.
		el.innerHTML = '';
		const r2 = new Renderer(el, Renderer.Backends.SVG);
		r2.resize(available, total);
		const c2 = r2.getContext();
		const labels: Label[] = [];
		for (const p of placements) labels.push(...drawPlacement(c2, p, topLine[p.row] - staveTopPad).labels);

		// Chord names: our own SVG text, a fixed gap above each row's highest note / top line.
		const svg2 = el.querySelector('svg');
		const NS = 'http://www.w3.org/2000/svg';
		for (const lab of labels) {
			if (!lab.symbol.trim() || !svg2) continue;
			const baseline = topLine[lab.row] - clamp0(noteAbove[lab.row]) - LABEL_GAP;
			const t = document.createElementNS(NS, 'text');
			t.setAttribute('x', String(Math.round(lab.x)));
			t.setAttribute('y', String(Math.round(baseline)));
			t.setAttribute('text-anchor', 'middle');
			t.setAttribute('font-family', JAZZ_FONT);
			t.setAttribute('font-size', String(CHORD_FONT_SIZE));
			t.setAttribute('class', 'chord-name');
			t.setAttribute('data-slot', String(lab.slot));
			t.textContent = lab.symbol.trim();
			svg2.appendChild(t);
		}

		// Note groups in render order (= global slot index) for highlighting.
		noteEls = [...el.querySelectorAll('.vf-stavenote')];
	}

	async function render() {
		if (!container) return;
		try {
			if (!vf) vf = await import('vexflow');
			// Load the jazz font before measuring/drawing so layout uses its real metrics.
			await ensureJazzFont();
			if (typeof document !== 'undefined') {
				try {
					await document.fonts.load(`${CHORD_FONT_SIZE}px '${JAZZ_FONT}'`);
				} catch {
					/* measurement falls back to default metrics */
				}
			}
			draw(vf);
			error = null;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Could not render notation.';
		}
	}

	$effect(() => {
		void signature; // re-render on score / transposition / mode changes
		void render();
	});

	// Highlight the currently-playing chord (noteheads + its chord name) without a re-render.
	$effect(() => {
		const active = progression.activeSlot;
		noteEls.forEach((g, i) => g.classList.toggle('vf-active', i === active));
		container
			?.querySelectorAll('.chord-name')
			.forEach((t) => t.classList.toggle('chord-active', Number(t.getAttribute('data-slot')) === active));
	});

	// Re-flow when the container *width* changes (responsive multi-line layout).
	// Ignore height-only changes — auto-sizing the SVG changes height and would loop.
	$effect(() => {
		if (!container) return;
		const ro = new ResizeObserver(() => {
			const w = container?.clientWidth ?? 0;
			if (Math.abs(w - lastWidth) > 1) {
				lastWidth = w;
				void render();
			}
		});
		ro.observe(container);
		return () => ro.disconnect();
	});
</script>

<div class="staff-wrap">
	{#if error}<p class="staff-error label">{error}</p>{/if}
	<div class="staff" class:chart={!showNotes} bind:this={container}></div>
</div>

<style lang="scss">
	.staff-wrap {
		background: var(--color-white);
		border: 1px solid var(--color-border);
		padding: var(--space-2);
	}

	.staff {
		width: 100%;
		min-height: 120px;
	}

	.staff-error {
		color: var(--c-diminished);
		padding: var(--space-2);
	}

	.staff :global(svg) {
		display: block;
	}

	/* Jazz chord names (our own text, above each staff). */
	.staff :global(.chord-name) {
		fill: var(--color-text);
	}
	.staff :global(.chord-active) {
		fill: var(--c-major);
	}

	/* Chord-chart mode: hide the placeholder noteheads + stems, keep the chord names. */
	.staff.chart :global(.vf-notehead > text) {
		display: none;
	}
	.staff.chart :global(.vf-stavenote > path) {
		display: none;
	}

	/* Active (playing) chord highlight — colours the chord tones in helper-notes mode. */
	.staff :global(.vf-active path) {
		fill: var(--c-major);
		stroke: var(--c-major);
	}
</style>
