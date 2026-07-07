<script lang="ts">
	import { scaleStaffKeys } from '$lib/model/scales';

	interface Props {
		/** Scale note names (ascending, one octave), e.g. ["C","D",…]. */
		notes: string[];
	}
	let { notes }: Props = $props();

	let container = $state<HTMLDivElement>();
	let error = $state<string | null>(null);
	let lastWidth = 0;
	let vf: typeof import('vexflow') | null = null;

	const signature = $derived(notes.join(','));

	const PAD = 8;
	const CLEF_ABOVE = 12;
	const CLEF_BELOW = 16;
	const PROV_Y = 150;

	function draw(VF: typeof import('vexflow')) {
		const { Renderer, Stave, StaveNote, Voice, Formatter, Accidental } = VF;
		const el = container;
		if (!el) return;
		el.innerHTML = '';

		const keys = scaleStaffKeys(notes);
		if (keys.length === 0) return;

		const width = Math.max(320, (el.clientWidth || 480) - 4);
		lastWidth = el.clientWidth || 0;
		const fmtWidth = width - 16 - 48;

		// Root notes orange, scale tones teal — matching the keyboard/fretboard
		// dots. VexFlow writes literal SVG attributes, so resolve the CSS vars here.
		const css = getComputedStyle(document.documentElement);
		const rootColor = css.getPropertyValue('--c-dominant').trim() || '#ff7b00';
		const toneColor = css.getPropertyValue('--c-major').trim() || '#1fb6a6';

		const makeNotes = () =>
			keys.map((k, i) => {
				const note = new StaveNote({ keys: [k.key], duration: 'q', stemDirection: -1 });
				// scaleStaffKeys ends on the octave root, so first + last are roots.
				const color = i === 0 || i === keys.length - 1 ? rootColor : toneColor;
				note.setStyle({ fillStyle: color, strokeStyle: color });
				if (k.accidental) {
					const acc = new Accidental(k.accidental);
					acc.setStyle({ fillStyle: color, strokeStyle: color });
					note.addModifier(acc, 0);
				}
				return note;
			});
		const buildVoice = (ns: InstanceType<typeof StaveNote>[]) => {
			const v = new Voice({ numBeats: keys.length, beatValue: 4 }).setMode(Voice.Mode.SOFT);
			v.addTickables(ns);
			return v;
		};
		const boxY = (bb: { getY?: () => number; y?: number }) => bb.getY?.() ?? bb.y ?? 0;
		const boxH = (bb: { getH?: () => number; h?: number }) => bb.getH?.() ?? bb.h ?? 0;

		const render = (y: number, height: number) => {
			const r = new Renderer(el, Renderer.Backends.SVG);
			r.resize(width, height);
			const ctx = r.getContext();
			const stave = new Stave(8, y, width - 16);
			stave.addClef('treble');
			stave.setContext(ctx).draw();
			const ns = makeNotes();
			const voice = buildVoice(ns);
			new Formatter().joinVoices([voice]).format([voice], fmtWidth);
			voice.draw(ctx, stave);
			return { stave, notes: ns };
		};

		// Pass 1 — measure the note extent above/below the staff lines.
		const { stave, notes: ns } = render(PROV_Y, PROV_Y * 2);
		const topLine = stave.getYForLine(0);
		const bottomLine = stave.getYForLine(4);
		let minTop = Infinity;
		let maxBot = -Infinity;
		for (const n of ns) {
			try {
				const bb = n.getBoundingBox?.();
				if (bb) {
					minTop = Math.min(minTop, boxY(bb));
					maxBot = Math.max(maxBot, boxY(bb) + boxH(bb));
				}
			} catch {
				/* ignore */
			}
		}
		const aboveLine = minTop === Infinity ? 0 : Math.max(0, topLine - minTop);
		const belowLine = maxBot === -Infinity ? 0 : Math.max(0, maxBot - bottomLine);
		const staveTopPad = topLine - PROV_Y;
		const lineSpan = bottomLine - topLine;
		const finalTopLine = PAD + Math.max(aboveLine, CLEF_ABOVE);
		const total = Math.ceil(finalTopLine + lineSpan + Math.max(belowLine, CLEF_BELOW) + PAD);

		// Pass 2 — render at a position that fits all the notes.
		el.innerHTML = '';
		render(finalTopLine - staveTopPad, total);
	}

	// The lazy VexFlow chunk can fail to load (flaky network before the service
	// worker has it cached) and draw() can throw — surface it instead of leaving
	// a silently blank box + an unhandled rejection. vf stays null after a failed
	// import, so a later render() retries and clears the message on success.
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
<div class="scale-staff" bind:this={container}></div>

<style lang="scss">
	.staff-error {
		color: var(--c-diminished);
		padding: var(--space-2) 0;
	}

	.scale-staff {
		width: 100%;
		max-width: 560px;
		min-height: 80px;
		background: var(--color-white);
		border: 1px solid var(--color-border);
	}
	.scale-staff :global(svg) {
		display: block;
	}
</style>
