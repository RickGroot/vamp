<script lang="ts">
	// The drill line on a staff.
	//
	// Built on ScaleStaff's approach — lazy VexFlow import, two-pass measure/fit
	// layout, CSS custom properties resolved to hex before setStyle (VexFlow
	// writes literal SVG attributes and ignores inherited CSS vars) — extended to
	// arbitrary durations, measures and wrapped rows.
	//
	// Deliberately plain black notation: this is sheet music to read off a stand,
	// so it looks like sheet music. Role information lives in the degree labels,
	// not in the noteheads. There is no moving playhead either — tracking one
	// per note meant animating `left`/`top` on an overlay, which forces layout on
	// every note and was visibly rough at drilling tempos. Progress is reported in
	// text instead, once per key.
	//
	// Barlines fall where the click's bars fall (practice/measures.ts): a row
	// holds whole measures and ends on a barline, a note crossing a barline is
	// tied over it, and the key ends on a double barline (a final one on the
	// last key).
	import { untrack } from 'svelte';
	import { view } from '$lib/stores/view.svelte';
	import { beatsToVexDuration } from '$lib/notation/vex';
	import { voicedToVexKey } from '$lib/notation/vex';
	import { ensureMusicFont } from '$lib/notation/font';
	import { toMeasures, type Piece } from '$lib/practice/measures';
	import type { DrillNote } from '$lib/practice/types';
	import type { StaveNote as VexStaveNote } from 'vexflow';

	interface Props {
		notes: DrillNote[];
		/** Bar length in quarter notes (the click's bar), for the barlines. */
		quartersPerBar?: number;
		/** The last key of the run: closes with a final barline instead of a double one. */
		final?: boolean;
		/** Upper bound on notes per row; the real figure is fitted to the width. */
		maxPerRow?: number;
	}
	let { notes, quartersPerBar = 4, final = false, maxPerRow = 16 }: Props = $props();

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
	/** A barline inside a row costs about this fraction of a note's width. */
	const BAR_COST = 0.4;
	/**
	 * Below this the notation is drawn scaled down, so a phone still gets a
	 * useful number of notes per row instead of four. Layout maths stays in
	 * unscaled ("logical") units; only the final canvas size and the HTML chord
	 * labels are multiplied by the factor.
	 */
	const NARROW_W = 560;
	const NARROW_SCALE = 0.7;

	const hasChords = $derived(notes.some((n) => n.chord));

	// Re-layout only when the music changes — or the theme does, since the notes
	// are inked with a colour resolved at draw time. Everything draw() depends on
	// belongs in here — it is the render effect's ONLY trigger (see the effect below).
	// Note positions are in it too: they decide where the barlines fall.
	const signature = $derived(
		JSON.stringify([
			view.night,
			maxPerRow,
			quartersPerBar,
			final,
			notes.map((n) => [n.midi, n.name, n.atQuarters, n.durQuarters, n.chord])
		])
	);

	/** A row of the staff: pieces of notes, with a barline after each finished measure. */
	type Item = { kind: 'piece'; piece: Piece } | { kind: 'bar' };

	function draw(VF: typeof import('vexflow')) {
		const { Renderer, Stave, StaveNote, Voice, Formatter, Accidental, BarNote, StaveTie, BarlineType } = VF;
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
		const inked = { fillStyle: ink, strokeStyle: ink };

		const noteRoom = width - PAD * 2 - CLEF_W - 12;
		const perRow = Math.max(4, Math.min(maxPerRow, Math.floor(noteRoom / MIN_NOTE_W)));

		const measures = toMeasures(notes, quartersPerBar);

		// Accidentals as engraved: with barlines, an accidental holds for the rest of
		// its measure (per letter and octave). So print one only when it CHANGES
		// within the bar — including a natural to cancel it, or an F after an F♯
		// would be read as F♯ — and start fresh at every barline. A tied
		// continuation carries its accidental and prints none.
		const shownAccidental = new Map<Piece, string | null>();
		for (const m of measures) {
			const held = new Map<string, string>();
			for (const piece of m.pieces) {
				const n = notes[piece.note];
				if (n.midi === null || !piece.first) {
					shownAccidental.set(piece, null);
					continue;
				}
				const key = voicedToVexKey({ midi: n.midi, name: n.name });
				const place = key.key.replace(/[#b]+(?=\/)/, '');
				const want = key.accidental ?? '';
				shownAccidental.set(piece, want === (held.get(place) ?? '') ? null : want || 'n');
				held.set(place, want);
			}
		}

		const pieceNote = (piece: Piece): VexStaveNote => {
			const n = notes[piece.note];
			const duration = beatsToVexDuration(piece.durQuarters, { numerator: 4, denominator: 4 });
			if (n.midi === null) {
				// A rest is real notation, not a gap — it is what tells a brass
				// player to actually stop blowing.
				const rest = new StaveNote({ keys: ['b/4'], duration: `${duration}r` });
				rest.setStyle(inked);
				return rest;
			}
			const key = voicedToVexKey({ midi: n.midi, name: n.name });
			const note = new StaveNote({ keys: [key.key], duration });
			note.setStyle(inked);
			const accidental = shownAccidental.get(piece);
			if (accidental) {
				const acc = new Accidental(accidental);
				acc.setStyle(inked);
				note.addModifier(acc, 0);
			}
			return note;
		};

		// How wide a measure must be, from VexFlow's own minimum spacing (with some
		// air, and room for its barline) — so rows pack as many whole bars as fit.
		// The old per-note worst case (MIN_NOTE_W) put one bar of eighths per row.
		const measureWidth = (pieces: Piece[]) => {
			try {
				const ticks = pieces.map(pieceNote);
				const v = new Voice({ numBeats: ticks.length, beatValue: 4 }).setMode(Voice.Mode.SOFT);
				v.addTickables(ticks);
				const f = new Formatter().joinVoices([v]);
				return f.preCalculateMinTotalWidth([v]) * 1.25 + MIN_NOTE_W * BAR_COST;
			} catch {
				return pieces.length * MIN_NOTE_W;
			}
		};

		// Rows of whole measures, each ending on its barline. A measure wider than a
		// row (sixteenths in 4/4 on a phone) spills over, with no barline at the break.
		const rows: Item[][] = [];
		let row: Item[] = [];
		// The whole measures on the current row: their length and minimum width.
		let fitted: { quarters: number; width: number }[] = [];
		let count = 0;
		const breakRow = () => {
			if (row.length) rows.push(row);
			row = [];
			fitted = [];
			count = 0;
		};
		// The formatter shares a row out by DURATION, so a bar of eighths beside a
		// whole-bar rest gets only half the row. A bar joins a row only if every bar
		// on it would still get its minimum width under that share.
		const fitsWith = (next: { quarters: number; width: number }) => {
			const all = [...fitted, next];
			const quarters = all.reduce((s, m) => s + m.quarters, 0);
			return all.every((m) => (noteRoom * m.quarters) / quarters >= m.width);
		};
		for (const m of measures) {
			const quarters = m.pieces.reduce((s, p) => s + p.durQuarters, 0);
			const w = measureWidth(m.pieces);
			if (w > noteRoom) {
				// Too long for any row: lay it out note by note at the worst-case spacing.
				breakRow();
				for (const piece of m.pieces) {
					if (count + 1 > perRow) breakRow();
					row.push({ kind: 'piece', piece });
					count += 1;
				}
				// Nothing else shares the row it ends on.
				fitted = [{ quarters, width: noteRoom }];
			} else {
				const next = { quarters, width: w };
				if (row.length && (!fitsWith(next) || count + m.pieces.length > maxPerRow)) breakRow();
				for (const piece of m.pieces) row.push({ kind: 'piece', piece });
				count += m.pieces.length;
				fitted.push(next);
			}
			if (m.complete) row.push({ kind: 'bar' });
		}
		breakRow();

		/** Build a row's tickables, keeping each piece's StaveNote for ties and labels. */
		const makeRow = (items: Item[]) => {
			const placed: { piece: Piece; note: VexStaveNote }[] = [];
			const tickables = items.map((item) => {
				if (item.kind === 'bar') {
					const bar = new BarNote();
					bar.setStyle(inked);
					return bar;
				}
				const note = pieceNote(item.piece);
				placed.push({ piece: item.piece, note });
				return note;
			});
			return { tickables, placed };
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
		const probeRenderer = new Renderer(el, Renderer.Backends.SVG);
		probeRenderer.resize(width, PROV_Y * 2);
		const probeCtx = probeRenderer.getContext();
		const probeStave = new Stave(PAD, PROV_Y, width - PAD * 2);
		probeStave.addClef('treble');
		probeStave.setContext(probeCtx).draw();
		const probe = makeRow(measures.flatMap((m) => m.pieces.map((piece): Item => ({ kind: 'piece', piece }))));
		const probeVoice = new Voice({ numBeats: probe.tickables.length, beatValue: 4 }).setMode(Voice.Mode.SOFT);
		probeVoice.addTickables(probe.tickables);
		new Formatter().joinVoices([probeVoice]).format([probeVoice], noteRoom);
		probeVoice.draw(probeCtx, probeStave);

		const topLine = probeStave.getYForLine(0);
		const bottomLine = probeStave.getYForLine(4);
		let minTop = Infinity;
		let maxBottom = -Infinity;
		for (const { note } of probe.placed) {
			try {
				const bb = note.getBoundingBox?.();
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
		let lastChord = '';
		// A tie left hanging at the end of the previous row, to finish on this one.
		let carryTie = false;

		rows.forEach((items, r) => {
			const isLast = r === rows.length - 1;
			// A row that ends on a finished measure ends on its barline: the stave's
			// own end line draws it, so the trailing in-voice barline is dropped.
			const endsOnBar = items[items.length - 1]?.kind === 'bar';
			const body = endsOnBar ? items.slice(0, -1) : items;

			const y = PAD + r * rowHeight + topRoom - staveTopPad;
			const stave = new Stave(PAD, y, width - PAD * 2);
			stave.addClef('treble');
			// The key ends on a double barline (a final one on the last key); a row
			// broken mid-measure has no barline at the break.
			stave.setEndBarType(
				isLast ? (final ? BarlineType.END : BarlineType.DOUBLE) : endsOnBar ? BarlineType.SINGLE : BarlineType.NONE
			);
			stave.setContext(context).draw();

			const { tickables, placed } = makeRow(body);
			const voice = new Voice({ numBeats: tickables.length, beatValue: 4 }).setMode(Voice.Mode.SOFT);
			voice.addTickables(tickables);
			new Formatter().joinVoices([voice]).format([voice], noteRoom);
			voice.draw(context, stave);

			// Ties over the barlines. One that runs off the end of a row is drawn to
			// the stave's edge and picked up again at the start of the next.
			placed.forEach(({ piece, note }, i) => {
				if (i === 0 && carryTie) {
					const tie = new StaveTie({ lastNote: note, lastIndexes: [0] });
					tie.setStyle(inked);
					tie.setContext(context).draw();
				}
				if (!piece.tieToNext) return;
				const next = placed[i + 1];
				const tie = new StaveTie(
					next
						? { firstNote: note, lastNote: next.note, firstIndexes: [0], lastIndexes: [0] }
						: { firstNote: note, firstIndexes: [0] }
				);
				tie.setStyle(inked);
				tie.setContext(context).draw();
			});
			carryTie = placed[placed.length - 1]?.piece.tieToNext ?? false;

			// Chord names are our own HTML, not VexFlow annotations — same choice as
			// StaffSheet, and it keeps them out of the formatter's spacing.
			if (hasChords) {
				const top = stave.getYForLine(0) - Math.max(above, 14);
				for (const { piece, note } of placed) {
					const chord = notes[piece.note].chord;
					if (!piece.first || !chord || chord === lastChord) continue;
					let x = PAD + CLEF_W;
					try {
						x = note.getAbsoluteX();
					} catch {
						/* fall back to the clef edge */
					}
					// HTML overlay, so these are CSS pixels — scale them to match.
					labels.push({ x: (x - 4) * scale, y: (top - chordRoom) * scale, text: chord });
					lastChord = chord;
				}
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
			// Measured before the music font loads, every bar packs at the worst case.
			await ensureMusicFont();
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
		color: var(--danger);
		padding: var(--space-2) 0;
	}

	.drill-staff {
		position: relative;
		width: 100%;
		background: var(--color-white);
		border: 1px solid var(--color-border);
	}

	/* VexFlow draws staves and clefs in literal black from its SVG root; inking
	   the root makes them follow the theme (black on plum was 1.29:1). */
	.drill-staff__sheet :global(svg) {
		display: block;
		fill: var(--ink);
		stroke: var(--ink);
	}

	.drill-staff__chord {
		position: absolute;
		font-size: 0.85rem;
		color: var(--color-text);
		pointer-events: none;
		white-space: nowrap;
	}
</style>
