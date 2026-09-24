<script lang="ts">
	// The drill line on a staff.
	//
	// Built on ScaleStaff's approach — lazy VexFlow import, two-pass measure/fit
	// layout, CSS custom properties resolved to hex before setStyle (VexFlow
	// writes literal SVG attributes and ignores inherited CSS vars) — extended to
	// arbitrary durations and wrapped rows.
	//
	// Deliberately plain black notation: this is sheet music to read off a stand,
	// so it looks like sheet music. Role information lives in the degree labels,
	// not in the noteheads. There is no moving playhead either — tracking one
	// per note meant animating `left`/`top` on an overlay, which forces layout on
	// every note and was visibly rough at drilling tempos. Progress is reported in
	// text instead, once per key.
	import { untrack } from 'svelte';
	import { beatsToVexDuration } from '$lib/notation/vex';
	import { voicedToVexKey } from '$lib/notation/vex';
	import type { DrillNote } from '$lib/practice/types';

	interface Props {
		notes: DrillNote[];
		/** Upper bound on notes per row; the real figure is fitted to the width. */
		maxPerRow?: number;
	}
	let { notes, maxPerRow = 16 }: Props = $props();

	let container = $state<HTMLDivElement>();
	let error = $state<string | null>(null);
	let lastWidth = 0;
	let vf: typeof import('vexflow') | null = null;
	/** Chord names to draw above the staff (guide-tone drills only). */
	let chordLabels = $state<{ x: number; y: number; text: string }[]>([]);

	const PAD = 8;
	const ROW_GAP = 14;
	const CLEF_W = 40;
	const PROV_Y = 150;
	const CHORD_ROOM = 20; // vertical room reserved for chord names above the staff
	/**
	 * VexFlow's own minimum spacing per note, measured (~64–66px for eighths with
	 * accidentals). The formatter OVERFLOWS the stave rather than compressing
	 * below this, so the row length has to be fitted to it — 16 notes on a 345px
	 * phone staff ran the last third of every row off the screen.
	 */
	const MIN_NOTE_W = 66;
	/**
	 * Below this the notation is drawn scaled down, so a phone still gets a
	 * useful number of notes per row instead of four. Layout maths stays in
	 * unscaled ("logical") units; only the final canvas size and the HTML chord
	 * labels are multiplied by the factor.
	 */
	const NARROW_W = 560;
	const NARROW_SCALE = 0.7;

	const hasChords = $derived(notes.some((n) => n.chord));

	// Re-layout only when the music changes. Everything draw() depends on belongs
	// in here — it is the render effect's ONLY trigger (see the effect below).
	const signature = $derived(
		JSON.stringify([maxPerRow, notes.map((n) => [n.midi, n.name, n.durQuarters, n.chord])])
	);

	function draw(VF: typeof import('vexflow')) {
		const { Renderer, Stave, StaveNote, Voice, Formatter, Accidental } = VF;
		const el = container;
		if (!el || notes.length === 0) return;
		el.innerHTML = '';

		const cssWidth = Math.max(280, (el.clientWidth || 640) - 4);
		lastWidth = el.clientWidth || 0;
		const scale = cssWidth < NARROW_W ? NARROW_SCALE : 1;
		// Everything below lays out in logical units; `scale` is applied once, to
		// the drawing context and the canvas size.
		const width = cssWidth / scale;
		// VexFlow writes literal SVG attributes and ignores inherited CSS vars, so
		// the ink colour has to be resolved here rather than set in the stylesheet.
		const css = getComputedStyle(document.documentElement);
		const ink = css.getPropertyValue('--color-black').trim() || '#1c1a1f';

		const noteRoom = width - PAD * 2 - CLEF_W - 12;
		const perRow = Math.max(4, Math.min(maxPerRow, Math.floor(noteRoom / MIN_NOTE_W)));

		const rows: DrillNote[][] = [];
		for (let i = 0; i < notes.length; i += perRow) rows.push(notes.slice(i, i + perRow));

		const makeRow = (rowNotes: DrillNote[]) =>
			rowNotes.map((n) => {
				const duration = beatsToVexDuration(n.durQuarters, { numerator: 4, denominator: 4 });
				if (n.midi === null) {
					// A rest is real notation, not a gap — it is what tells a brass
					// player to actually stop blowing.
					const rest = new StaveNote({ keys: ['b/4'], duration: `${duration}r` });
					rest.setStyle({ fillStyle: ink, strokeStyle: ink });
					return rest;
				}
				const key = voicedToVexKey({ midi: n.midi, name: n.name });
				const note = new StaveNote({ keys: [key.key], duration });
				note.setStyle({ fillStyle: ink, strokeStyle: ink });
				if (key.accidental) {
					const acc = new Accidental(key.accidental);
					acc.setStyle({ fillStyle: ink, strokeStyle: ink });
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

		// Pass 1 — one throwaway render of every note, to learn the true vertical
		// extent. Noteheads and the clef are font glyphs, so DOM getBBox returns the
		// em-box; only VexFlow's own getBoundingBox / getYForLine are trustworthy.
		//
		// Every note, deliberately. Probing only the extremes was tried and measured:
		// it saved ~3ms on a 65-note staff (47 -> 44ms median), because the final pass
		// and the label DOM dominate, and it needed staff-position ranking to be right
		// at all — MIDI order is not drawn order (E# sits below F; Cb above B), and
		// stems flip at the middle line. Not worth the subtlety for noise-level gain.
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
		// Chord names sit above the staff, so reserve room for them in the row
		// height rather than letting them collide with high notes.
		const chordRoom = hasChords ? CHORD_ROOM : 0;
		const topRoom = Math.max(above, 14) + chordRoom;
		const rowHeight = Math.ceil(topRoom + lineSpan + Math.max(below, 18) + ROW_GAP);

		// Pass 2 — draw every row at its fitted height.
		el.innerHTML = '';
		// Built locally and assigned ONCE at the end. Pushing into the $state array
		// directly meant this function read the very state it wrote; running inside
		// the render effect, that re-scheduled the effect, which re-rendered, which
		// wrote again — a loop that froze the page on every drill with chord labels
		// (i.e. every drill over your own changes).
		const labels: { x: number; y: number; text: string }[] = [];
		const logicalHeight = rowHeight * rows.length + PAD * 2;
		const renderer = new Renderer(el, Renderer.Backends.SVG);
		// The canvas is sized in CSS pixels; the context is scaled so the logical
		// layout below fits inside it.
		renderer.resize(Math.round(width * scale), Math.round(logicalHeight * scale));
		const context = renderer.getContext();
		if (scale !== 1) context.scale(scale, scale);
		rows.forEach((row, r) => {
			const y = PAD + r * rowHeight + topRoom - staveTopPad;
			const stave = new Stave(PAD, y, width - PAD * 2);
			stave.addClef('treble');
			stave.setContext(context).draw();
			const staveNotes = makeRow(row);
			const voice = new Voice({ numBeats: row.length, beatValue: 4 }).setMode(Voice.Mode.SOFT);
			voice.addTickables(staveNotes);
			new Formatter().joinVoices([voice]).format([voice], width - PAD * 2 - CLEF_W - 12);
			voice.draw(context, stave);

			// Chord names are our own HTML, not VexFlow annotations — same choice as
			// StaffSheet, and it keeps them out of the formatter's spacing.
			if (hasChords) {
				const top = stave.getYForLine(0) - Math.max(above, 14);
				let lastChord = '';
				staveNotes.forEach((n, i) => {
					const chord = row[i].chord;
					if (!chord || chord === lastChord) return;
					let x = PAD + CLEF_W;
					try {
						x = n.getAbsoluteX();
					} catch {
						/* fall back to the clef edge */
					}
					// HTML overlay, so these are CSS pixels — scale them to match.
					labels.push({ x: (x - 4) * scale, y: (top - chordRoom) * scale, text: chord });
					lastChord = chord;
				});
			}
		});
		chordLabels = labels;
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

	// Re-render when — and ONLY when — the music changes. `render()` is untracked
	// because once VexFlow has loaded it runs draw() synchronously, and every $state
	// draw() touched became a dependency of this effect: `notes` by identity (so
	// every upstream recompute re-rendered musically identical notation) and, until
	// the labels were built locally, the chord-label array draw() writes. The
	// value-compared signature is the whole contract; nothing else may trigger this.
	$effect(() => {
		void signature;
		// Tracked explicitly: the element is bound before effects run today, but if
		// that ever changed, an untracked render would bail on a missing container
		// and never be retried.
		void container;
		untrack(() => void render());
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
	<!-- Keyed on position, not x + text: on a long tune the form repeats, so the
	     same chord lands in the same column on different rows — an x-and-text key
	     collided and Svelte threw each_key_duplicate, dropping every label. -->
	{#each chordLabels as chord (`${chord.x},${chord.y}`)}
		<span class="drill-staff__chord" style="left:{chord.x}px; top:{chord.y}px">{chord.text}</span>
	{/each}
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

	.drill-staff__chord {
		position: absolute;
		font-size: 0.85rem;
		color: var(--color-text);
		pointer-events: none;
		white-space: nowrap;
	}
</style>
