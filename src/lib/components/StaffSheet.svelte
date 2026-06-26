<script lang="ts">
	import { progression } from '$lib/stores/progression.svelte';
	import { view } from '$lib/stores/view.svelte';
	import { voiceSequence } from '$lib/audio/voicing';
	import { displayChord } from '$lib/audio/transpose';
	import { midiToVexKey, beatsToVexDuration } from '$lib/notation/vex';
	import type { Bar, TimeSignature } from '$lib/model/types';

	interface Props {
		/** When true, render the chord tones as notes; otherwise a chords-only chart. */
		showNotes?: boolean;
	}
	let { showNotes = false }: Props = $props();

	let container = $state<HTMLDivElement>();
	let error = $state<string | null>(null);
	let noteEls = $state<Element[]>([]);
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
	const ROW_H = 92;
	const TOP_Y = 16;

	interface Placement {
		bar: Bar;
		index: number;
		x: number;
		y: number;
		w: number;
		firstInRow: boolean;
	}

	function layout(bars: Bar[], available: number): { placements: Placement[]; height: number } {
		const placements: Placement[] = [];
		let x = 10;
		let y = TOP_Y;
		let rowLen = 0;
		const widthOf = (bar: Bar, firstInRow: boolean, globalFirst: boolean) =>
			60 + bar.slots.length * 54 + (firstInRow ? CLEF_W : 0) + (globalFirst ? TIME_W : 0);

		bars.forEach((bar, index) => {
			let firstInRow = rowLen === 0;
			let w = widthOf(bar, firstInRow, index === 0);
			if (!firstInRow && x + w > available) {
				y += ROW_H;
				x = 10;
				rowLen = 0;
				firstInRow = true;
				w = widthOf(bar, true, index === 0);
			}
			placements.push({ bar, index, x, y, w, firstInRow });
			x += w;
			rowLen++;
		});
		return { placements, height: y + ROW_H };
	}

	function draw(VF: typeof import('vexflow')) {
		const { Renderer, Stave, StaveNote, Voice, Formatter, Annotation, Accidental } = VF;
		const el = container;
		if (!el) return;
		el.innerHTML = '';

		const bars = progression.current.bars;
		const ts: TimeSignature = progression.current.timeSignature;
		const offset = view.offset;
		// Notation shows written pitch for the selected instrument.
		const written = bars.flatMap((b) => b.slots.map((s) => displayChord(s.chord, offset)));
		const voicings = voiceSequence(written, 'piano', 4);

		const available = Math.max(320, (el.clientWidth || 600) - 4);
		const { placements, height } = layout(bars, available);

		const renderer = new Renderer(el, Renderer.Backends.SVG);
		renderer.resize(available, height);
		const ctx = renderer.getContext();

		const label = (note: InstanceType<typeof StaveNote>, symbol: string) => {
			if (symbol.trim()) {
				note.addModifier(
					new Annotation(symbol.trim()).setVerticalJustification(Annotation.VerticalJustify.TOP),
					0
				);
			}
			return note;
		};

		let vi = 0;
		for (const p of placements) {
			const stave = new Stave(p.x, p.y, p.w);
			if (p.firstInRow) stave.addClef('treble');
			if (p.index === 0) stave.addTimeSignature(`${ts.numerator}/${ts.denominator}`);
			stave.setContext(ctx).draw();

			const notes = p.bar.slots.map((slot) => {
				const dur = beatsToVexDuration(slot.beats, ts);
				const midi = voicings[vi];
				const symbol = written[vi];
				vi++;

				// Chords-only chart: a single placeholder note carrying the chord label;
				// its notehead + stem are hidden via CSS (see the `.chart` rules below).
				if (!showNotes) return label(new StaveNote({ keys: ['b/4'], duration: dur }), symbol);

				// Helper-notes: render the chord tones (empty slot = rest).
				if (!midi || midi.length === 0) {
					return new StaveNote({ keys: ['b/4'], duration: `${dur}r` });
				}
				const keys = midi.map(midiToVexKey);
				const note = new StaveNote({ keys: keys.map((k) => k.key), duration: dur });
				keys.forEach((k, i) => {
					if (k.accidental) note.addModifier(new Accidental(k.accidental), i);
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
		}

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

	// Re-flow when the container width changes (responsive multi-line layout).
	$effect(() => {
		if (!container) return;
		const ro = new ResizeObserver(() => void render());
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
