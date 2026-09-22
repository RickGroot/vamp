<script lang="ts">
	// The drill line on a staff, with a playhead.
	//
	// Built on ScaleStaff's approach — lazy VexFlow import, two-pass measure/fit
	// layout, CSS custom properties resolved to hex before setStyle (VexFlow
	// writes literal SVG attributes and ignores inherited CSS vars) — extended to
	// arbitrary durations, wrapped rows and a highlight.
	//
	// The playhead is a separate no-re-render effect moving one overlay rect, so
	// advancing a note never re-runs the (expensive) VexFlow layout.
	import { beatsToVexDuration } from '$lib/notation/vex';
	import { voicedToVexKey } from '$lib/notation/vex';
	import type { DrillNote } from '$lib/practice/types';

	interface Props {
		notes: DrillNote[];
		/** Index of the sounding note, or null. */
		cue?: number | null;
		/** How many notes to show per row before wrapping. */
		perRow?: number;
	}
	let { notes, cue = null, perRow = 16 }: Props = $props();

	let container = $state<HTMLDivElement>();
	let error = $state<string | null>(null);
	let lastWidth = 0;
	let vf: typeof import('vexflow') | null = null;
	/** Screen-space box per note index, filled during draw, read by the playhead. */
	let boxes: { x: number; y: number; w: number; h: number }[] = [];
	let playhead = $state<{ x: number; y: number; w: number; h: number } | null>(null);

	const PAD = 8;
	const ROW_GAP = 14;
	const CLEF_W = 40;
	const PROV_Y = 150;

	// Re-layout only when the music changes — never when only the cue moves.
	const signature = $derived(
		JSON.stringify(notes.map((n) => [n.midi, n.name, n.durQuarters, n.role]))
	);

	/** A note's colour by role, so chord tones read at a glance. */
	function colourFor(role: DrillNote['role'], css: CSSStyleDeclaration): string {
		const token =
			role === 'root'
				? '--c-dominant'
				: role === 'third'
					? '--c-major'
					: role === 'seventh'
						? '--c-suspended'
						: role === 'fifth'
							? '--c-minor'
							: '--color-black';
		return css.getPropertyValue(token).trim() || '#1c1a1f';
	}

	function draw(VF: typeof import('vexflow')) {
		const { Renderer, Stave, StaveNote, Voice, Formatter, Accidental } = VF;
		const el = container;
		if (!el || notes.length === 0) return;
		el.innerHTML = '';
		boxes = [];

		const width = Math.max(320, (el.clientWidth || 640) - 4);
		lastWidth = el.clientWidth || 0;
		const css = getComputedStyle(document.documentElement);
		const restColour = css.getPropertyValue('--color-text-faint').trim() || '#999';

		const rows: DrillNote[][] = [];
		for (let i = 0; i < notes.length; i += perRow) rows.push(notes.slice(i, i + perRow));
		const indexOfRow = (row: number) => row * perRow;

		const makeRow = (rowNotes: DrillNote[]) =>
			rowNotes.map((n) => {
				const duration = beatsToVexDuration(n.durQuarters, { numerator: 4, denominator: 4 });
				if (n.midi === null) {
					// A rest is real notation, not a gap — it is what tells a brass
					// player to actually stop blowing.
					const rest = new StaveNote({ keys: ['b/4'], duration: `${duration}r` });
					rest.setStyle({ fillStyle: restColour, strokeStyle: restColour });
					return rest;
				}
				const key = voicedToVexKey({ midi: n.midi, name: n.name });
				const note = new StaveNote({ keys: [key.key], duration });
				const colour = colourFor(n.role, css);
				note.setStyle({ fillStyle: colour, strokeStyle: colour });
				if (key.accidental) {
					const acc = new Accidental(key.accidental);
					acc.setStyle({ fillStyle: colour, strokeStyle: colour });
					note.addModifier(acc, 0);
				}
				return note;
			});

		const renderRow = (rowNotes: DrillNote[], y: number, height: number, ctx?: unknown) => {
			const renderer = new Renderer(el, Renderer.Backends.SVG);
			renderer.resize(width, height);
			const context = renderer.getContext();
			const stave = new Stave(PAD, y, width - PAD * 2);
			stave.addClef('treble');
			stave.setContext(context).draw();
			const staveNotes = makeRow(rowNotes);
			const voice = new Voice({ numBeats: rowNotes.length, beatValue: 4 }).setMode(Voice.Mode.SOFT);
			voice.addTickables(staveNotes);
			new Formatter().joinVoices([voice]).format([voice], width - PAD * 2 - CLEF_W - 12);
			voice.draw(context, stave);
			void ctx;
			return { stave, staveNotes };
		};

		// Pass 1 — one throwaway render of EVERY note, to learn the true vertical
		// extent. Noteheads and the clef are font glyphs, so DOM getBBox returns the
		// em-box; only VexFlow's own getBoundingBox / getYForLine are trustworthy
		// here. Measuring all the notes at once keeps this to a single extra render
		// rather than one per row.
		const probe = renderRow(notes, PROV_Y, PROV_Y * 2);
		const topLine = probe.stave.getYForLine(0);
		const bottomLine = probe.stave.getYForLine(4);
		let minTop = Infinity;
		let maxBottom = -Infinity;
		for (const n of probe.staveNotes) {
			try {
				const bb = n.getBoundingBox?.();
				if (!bb) continue;
				const top = bb.getY?.() ?? 0;
				const h = bb.getH?.() ?? 0;
				minTop = Math.min(minTop, top);
				maxBottom = Math.max(maxBottom, top + h);
			} catch {
				/* VexFlow can refuse a bounding box before layout settles */
			}
		}
		const above = minTop === Infinity ? 0 : Math.max(0, topLine - minTop);
		const below = maxBottom === -Infinity ? 0 : Math.max(0, maxBottom - bottomLine);
		const staveTopPad = topLine - PROV_Y;
		const lineSpan = bottomLine - topLine;
		const rowHeight = Math.ceil(Math.max(above, 14) + lineSpan + Math.max(below, 18) + ROW_GAP);

		// Pass 2 — draw every row at its fitted height, recording note boxes.
		el.innerHTML = '';
		const renderer = new Renderer(el, Renderer.Backends.SVG);
		renderer.resize(width, rowHeight * rows.length + PAD * 2);
		const context = renderer.getContext();
		rows.forEach((row, r) => {
			const y = PAD + r * rowHeight + Math.max(above, 14) - staveTopPad;
			const stave = new Stave(PAD, y, width - PAD * 2);
			stave.addClef('treble');
			stave.setContext(context).draw();
			const staveNotes = makeRow(row);
			const voice = new Voice({ numBeats: row.length, beatValue: 4 }).setMode(Voice.Mode.SOFT);
			voice.addTickables(staveNotes);
			new Formatter().joinVoices([voice]).format([voice], width - PAD * 2 - CLEF_W - 12);
			voice.draw(context, stave);

			const top = stave.getYForLine(0) - Math.max(above, 14);
			staveNotes.forEach((n, i) => {
				let x = PAD + CLEF_W;
				try {
					x = n.getAbsoluteX();
				} catch {
					/* fall back to the clef edge */
				}
				boxes[indexOfRow(r) + i] = { x: x - 9, y: top, w: 20, h: lineSpan + Math.max(above, 14) + Math.max(below, 18) };
			});
		});
	}

	// The lazy VexFlow chunk can fail (flaky network before the service worker has
	// it cached) and draw() can throw — surface it rather than leaving a blank box
	// and an unhandled rejection. vf stays null after a failed import, so a later
	// render() retries and clears the message on success.
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
		void signature;
		void render();
	});

	// Playhead only — deliberately separate, so advancing a note never re-runs
	// the VexFlow layout above.
	$effect(() => {
		playhead = cue === null ? null : (boxes[cue] ?? null);
	});

	// Re-flow on WIDTH change only: reacting to height loops forever, because
	// auto-sizing the SVG changes the height.
	$effect(() => {
		if (!container) return;
		const ro = new ResizeObserver(() => {
			const w = container?.clientWidth ?? 0;
			if (Math.abs(w - lastWidth) > 1) void render();
		});
		ro.observe(container);
		return () => ro.disconnect();
	});
</script>

{#if error}<p class="staff-error label">{error}</p>{/if}

<div class="drill-staff">
	<div class="drill-staff__sheet" bind:this={container}></div>
	{#if playhead}
		<div
			class="drill-staff__playhead"
			aria-hidden="true"
			style="left:{playhead.x}px; top:{playhead.y}px; width:{playhead.w}px; height:{playhead.h}px"
		></div>
	{/if}
</div>

<style lang="scss">
	.staff-error {
		color: var(--c-diminished);
		padding: var(--space-2) 0;
	}

	.drill-staff {
		position: relative;
		width: 100%;
		background: var(--color-white);
		border: 1px solid var(--color-border);
	}

	.drill-staff__sheet :global(svg) {
		display: block;
	}

	.drill-staff__playhead {
		position: absolute;
		border: 2px solid var(--c-dominant);
		border-radius: 3px;
		pointer-events: none;
		transition:
			left 90ms var(--motion-ease-out),
			top 90ms var(--motion-ease-out);
	}

	@media (prefers-reduced-motion: reduce) {
		.drill-staff__playhead {
			transition: none;
		}
	}
</style>
