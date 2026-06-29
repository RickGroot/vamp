<script lang="ts">
	import { progression } from '$lib/stores/progression.svelte';
	import { view } from '$lib/stores/view.svelte';
	import { parseChord } from '$lib/audio/chord';
	import { displayChord } from '$lib/audio/transpose';
	import { midiToVexKey, beatsToVexDuration, notationVoicing } from '$lib/notation/vex';
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
	const ROW_GAP = 16; // gap between a row's lowest note and the next row's chord names
	const PAD = 8;
	const LABEL_GAP = 10; // gap between a chord name and the content below it
	const LABEL_ASCENT = CHORD_FONT_SIZE + 3; // vertical room a chord name occupies

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
				const midi = voicings[vi];
				if (!showNotes) return { note: new StaveNote({ keys: ['b/4'], duration: dur }), vi };
				if (!midi || midi.length === 0) {
					return { note: new StaveNote({ keys: ['b/4'], duration: `${dur}r` }), vi };
				}
				const keys = midi.map(midiToVexKey);
				// Stems down so the (above-staff) chord names always sit clear of the notes.
				const note = new StaveNote({ keys: keys.map((k) => k.key), duration: dur, stemDirection: -1 });
				keys.forEach((k, idx) => {
					if (k.accidental) note.addModifier(new Accidental(k.accidental), idx);
				});
				return { note, vi };
			});

		// Draw a bar's stave + notes at baseline y; return each note's x + slot for labels.
		const drawPlacement = (ctx: RenderContext, p: Placement, y: number): Label[] => {
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

			return built.map((b) => ({
				x: b.note.getAbsoluteX(),
				row: p.row,
				slot: b.vi,
				symbol: written[b.vi]
			}));
		};

		// Pass 1 — draw spaced out and measure each row's note extent above/below the staff.
		const r1 = new Renderer(el, Renderer.Backends.SVG);
		r1.resize(available, PROV_TOP + rowCount * PROV_H);
		const c1 = r1.getContext();
		for (const p of placements) drawPlacement(c1, p, PROV_TOP + p.row * PROV_H);

		const svg1 = el.querySelector('svg');
		const staveH = (() => {
			const s = svg1?.querySelector('.vf-stave') as SVGGraphicsElement | null;
			try {
				return s ? s.getBBox().height : 40;
			} catch {
				return 40;
			}
		})();
		const noteAbove = Array.from({ length: rowCount }, () => 0);
		const below = Array.from({ length: rowCount }, () => 4);
		svg1?.querySelectorAll('.vf-stavenote').forEach((node) => {
			try {
				const b = (node as SVGGraphicsElement).getBBox();
				const r = Math.round((b.y + b.height / 2 - PROV_TOP) / PROV_H);
				if (r < 0 || r >= rowCount) return;
				const staveY = PROV_TOP + r * PROV_H;
				noteAbove[r] = Math.max(noteAbove[r], staveY - b.y);
				below[r] = Math.max(below[r], b.y + b.height - (staveY + staveH));
			} catch {
				/* skip un-measurable node */
			}
		});

		// Reserve room above each row for its highest note plus the chord-name band.
		const above = noteAbove.map((n) => Math.max(0, n) + LABEL_GAP + LABEL_ASCENT);
		const rowY: number[] = [PAD + above[0]];
		for (let r = 1; r < rowCount; r++) {
			rowY[r] = rowY[r - 1] + staveH + Math.max(0, below[r - 1]) + ROW_GAP + above[r];
		}
		const total = Math.ceil(rowY[rowCount - 1] + staveH + Math.max(0, below[rowCount - 1]) + PAD);

		// Pass 2 — final render at packed positions.
		el.innerHTML = '';
		const r2 = new Renderer(el, Renderer.Backends.SVG);
		r2.resize(available, total);
		const c2 = r2.getContext();
		const labels: Label[] = [];
		for (const p of placements) labels.push(...drawPlacement(c2, p, rowY[p.row]));

		// Chord names: our own SVG text, a fixed gap above each row's highest content.
		const svg2 = el.querySelector('svg');
		const NS = 'http://www.w3.org/2000/svg';
		for (const lab of labels) {
			if (!lab.symbol.trim() || !svg2) continue;
			const baseline = rowY[lab.row] - Math.max(0, noteAbove[lab.row]) - LABEL_GAP;
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
