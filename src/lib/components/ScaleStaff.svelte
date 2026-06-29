<script lang="ts">
	import { scaleStaffKeys } from '$lib/model/scales';

	interface Props {
		/** Scale note names (ascending, one octave), e.g. ["C","D",…]. */
		notes: string[];
	}
	let { notes }: Props = $props();

	let container = $state<HTMLDivElement>();
	let lastWidth = 0;
	let vf: typeof import('vexflow') | null = null;

	const signature = $derived(notes.join(','));

	function draw(VF: typeof import('vexflow')) {
		const { Renderer, Stave, StaveNote, Voice, Formatter, Accidental } = VF;
		const el = container;
		if (!el) return;
		el.innerHTML = '';

		const keys = scaleStaffKeys(notes);
		if (keys.length === 0) return;

		const width = Math.max(320, (el.clientWidth || 480) - 4);
		lastWidth = el.clientWidth || 0;
		const height = 132;

		const renderer = new Renderer(el, Renderer.Backends.SVG);
		renderer.resize(width, height);
		const ctx = renderer.getContext();

		const stave = new Stave(8, 34, width - 16);
		stave.addClef('treble');
		stave.setContext(ctx).draw();

		const staveNotes = keys.map((k) => {
			const note = new StaveNote({ keys: [k.key], duration: 'q', stemDirection: -1 });
			if (k.accidental) note.addModifier(new Accidental(k.accidental), 0);
			return note;
		});

		const voice = new Voice({ numBeats: keys.length, beatValue: 4 }).setMode(Voice.Mode.SOFT);
		voice.addTickables(staveNotes);
		new Formatter().joinVoices([voice]).format([voice], width - 16 - 48);
		voice.draw(ctx, stave);
	}

	async function render() {
		if (!container) return;
		if (!vf) vf = await import('vexflow');
		draw(vf);
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

<div class="scale-staff" bind:this={container}></div>

<style lang="scss">
	.scale-staff {
		width: 100%;
		max-width: 560px;
		min-height: 132px;
		background: var(--color-white);
		border: 1px solid var(--color-border);
	}
	.scale-staff :global(svg) {
		display: block;
	}
</style>
