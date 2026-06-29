<script lang="ts">
	import { progression } from '$lib/stores/progression.svelte';
	import { view } from '$lib/stores/view.svelte';
	import { parseChord } from '$lib/audio/chord';
	import { displayChord } from '$lib/audio/transpose';
	import { midiToVexKey, beatsToVexDuration, notationVoicing } from '$lib/notation/vex';
	import type { Bar, TimeSignature } from '$lib/model/types';
	import type { RenderContext } from 'vexflow';

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
	const PROV_TOP = 160;
	const PROV_H = 320;
	const ROW_GAP = 14; // gap between a row's lowest note and the next row's content
	const PAD = 8;

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
		const { Renderer, Stave, StaveNote, Voice, Formatter, Annotation, Accidental } = VF;
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

		const label = (note: InstanceType<typeof StaveNote>, symbol: string) => {
			if (symbol.trim()) {
				note.addModifier(
					new Annotation(symbol.trim()).setVerticalJustification(Annotation.VerticalJustify.TOP),
					0
				);
			}
			return note;
		};

		// Draw one bar's stave + notes/labels at a given baseline y.
		const drawPlacement = (ctx: RenderContext, p: Placement, y: number) => {
			const stave = new Stave(p.x, y, p.w);
			if (p.firstInRow) stave.addClef('treble');
			if (p.index === 0) stave.addTimeSignature(`${ts.numerator}/${ts.denominator}`);
			stave.setContext(ctx).draw();

			const notes = p.bar.slots.map((slot, i) => {
				const vi = p.slotStart + i;
				const dur = beatsToVexDuration(slot.beats, ts);
				const midi = voicings[vi];
				const symbol = written[vi];

				// Chords-only chart: a single placeholder note carrying the chord label;
				// its notehead + stem are hidden via CSS (see the `.chart` rules below).
				if (!showNotes) return label(new StaveNote({ keys: ['b/4'], duration: dur }), symbol);

				// Helper-notes: render the chord tones (empty slot = rest).
				if (!midi || midi.length === 0) {
					return new StaveNote({ keys: ['b/4'], duration: `${dur}r` });
				}
				const keys = midi.map(midiToVexKey);
				// Stems down so the chord name always sits clear above the noteheads.
				const note = new StaveNote({ keys: keys.map((k) => k.key), duration: dur, stemDirection: -1 });
				keys.forEach((k, idx) => {
					if (k.accidental) note.addModifier(new Accidental(k.accidental), idx);
				});
				return label(note, symbol);
			});

			const voice = new Voice({ numBeats: ts.numerator, beatValue: ts.denominator }).setMode(
				Voice.Mode.SOFT
			);
			voice.addTickables(notes);
			const reserved = (p.firstInRow ? CLEF_W : 0) + (p.index === 0 ? TIME_W : 0) + 20;
			new Formatter().joinVoices([voice]).format([voice], p.w - reserved);
			voice.draw(ctx, stave);
		};

		// Pass 1 — draw spaced out and measure each row's true content extent
		// (chord names + ledger lines), so rows can be packed without overlap/clip.
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
		const above = Array.from({ length: rowCount }, () => 12);
		const below = Array.from({ length: rowCount }, () => 4);
		const scan = (sel: string) => {
			svg1?.querySelectorAll(sel).forEach((node) => {
				try {
					const b = (node as SVGGraphicsElement).getBBox();
					const r = Math.round((b.y + b.height / 2 - PROV_TOP) / PROV_H);
					if (r < 0 || r >= rowCount) return;
					const staveY = PROV_TOP + r * PROV_H;
					above[r] = Math.max(above[r], staveY - b.y);
					below[r] = Math.max(below[r], b.y + b.height - (staveY + staveH));
				} catch {
					/* skip un-measurable node */
				}
			});
		};
		scan('.vf-stavenote');
		scan('.vf-annotation');

		// Pack rows by their measured heights.
		const rowY: number[] = [PAD + Math.max(0, above[0])];
		for (let r = 1; r < rowCount; r++) {
			rowY[r] = rowY[r - 1] + staveH + Math.max(0, below[r - 1]) + ROW_GAP + Math.max(0, above[r]);
		}
		const total = Math.ceil(rowY[rowCount - 1] + staveH + Math.max(0, below[rowCount - 1]) + PAD);

		// Pass 2 — final render at packed positions.
		el.innerHTML = '';
		const r2 = new Renderer(el, Renderer.Backends.SVG);
		r2.resize(available, total);
		const c2 = r2.getContext();
		for (const p of placements) drawPlacement(c2, p, rowY[p.row]);

		// Note groups in render order (= global slot index) for highlighting.
		noteEls = [...el.querySelectorAll('.vf-stavenote')];
	}

	async function render() {
		if (!container) return;
		try {
			if (!vf) vf = await import('vexflow');
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

	// Highlight the currently-playing chord without a full re-render.
	$effect(() => {
		const active = progression.activeSlot;
		noteEls.forEach((g, i) => g.classList.toggle('vf-active', i === active));
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

	/* Chord-chart mode: hide notehead glyphs + stems, keep the chord labels.
	   (The chord annotation is nested in .vf-annotation, not a direct text child.) */
	.staff.chart :global(.vf-notehead > text) {
		display: none;
	}

	.staff.chart :global(.vf-stavenote > path) {
		display: none;
	}

	/* Active (playing) chord highlight — colours noteheads and the chord label. */
	.staff :global(.vf-active path) {
		fill: var(--c-major);
		stroke: var(--c-major);
	}

	.staff :global(.vf-active text) {
		fill: var(--c-major);
	}
</style>
