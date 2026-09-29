<script lang="ts">
	import { GUITAR_TUNING } from '$lib/model/scales';

	interface Props {
		/** Pitch classes (0–11) in the scale. */
		pcs: number[];
		/** Pitch class of the root. */
		rootPc: number;
	}
	let { pcs, rootPc }: Props = $props();

	const FRETS = 12;
	// Top string = high E, bottom = low E (how a right-handed player sees it).
	const STRINGS = [...GUITAR_TUNING].reverse();
	const FW = 32; // fret cell width
	const SH = 22; // string spacing
	const OPEN_W = 26; // open-note column (left of nut)
	const PAD_T = 12;
	const PAD_L = 6;
	const NECK_X = PAD_L + OPEN_W;
	const W = NECK_X + FRETS * FW + 6;
	const H = PAD_T + (STRINGS.length - 1) * SH + 26;
	const MARKERS = [3, 5, 7, 9, 12];

	const stringY = (s: number) => PAD_T + s * SH;
	const fretX = (f: number) => NECK_X + f * FW; // fret-wire x

	const set = $derived(new Set(pcs));
	const dots = $derived.by(() => {
		const out: { x: number; y: number; root: boolean; open: boolean }[] = [];
		STRINGS.forEach((open, s) => {
			for (let f = 0; f <= FRETS; f++) {
				const pc = (((open + f) % 12) + 12) % 12;
				if (!set.has(pc)) continue;
				out.push({
					x: f === 0 ? PAD_L + OPEN_W / 2 : NECK_X + (f - 0.5) * FW,
					y: stringY(s),
					root: pc === rootPc,
					open: f === 0
				});
			}
		});
		return out;
	});

	const bottomY = stringY(STRINGS.length - 1);
</script>

<svg class="fb" viewBox="0 0 {W} {H}" role="img" aria-label="scale on a guitar fretboard">
	<!-- inlay markers -->
	{#each MARKERS as m (m)}
		{#if m === 12}
			<circle class="inlay" cx={fretX(m) - FW / 2} cy={stringY(1)} r="3" />
			<circle class="inlay" cx={fretX(m) - FW / 2} cy={stringY(4)} r="3" />
		{:else}
			<circle class="inlay" cx={fretX(m) - FW / 2} cy={(PAD_T + bottomY) / 2} r="3" />
		{/if}
	{/each}

	<!-- strings -->
	{#each STRINGS as _s, s (s)}
		<line class="string" x1={NECK_X} y1={stringY(s)} x2={fretX(FRETS)} y2={stringY(s)} />
	{/each}

	<!-- nut + fret wires -->
	<line class="nut" x1={NECK_X} y1={PAD_T - 2} x2={NECK_X} y2={bottomY + 2} />
	{#each Array.from({ length: FRETS }) as _f, i (i)}
		<line class="fret" x1={fretX(i + 1)} y1={PAD_T} x2={fretX(i + 1)} y2={bottomY} />
	{/each}

	<!-- fret numbers -->
	{#each MARKERS as m (m)}
		<text class="fretnum" x={fretX(m) - FW / 2} y={H - 6} text-anchor="middle">{m}</text>
	{/each}

	<!-- scale tones -->
	{#each dots as d, i (i)}
		<circle
			class="tone"
			class:tone--root={d.root}
			class:tone--open={d.open}
			cx={d.x}
			cy={d.y}
			r={d.open ? 5.5 : 6.5}
		/>
		{#if d.root && !d.open}
			<!-- The root carries a paper pip: shape, not colour, marks it. -->
			<circle class="tone__pip" cx={d.x} cy={d.y} r="2.2" />
		{/if}
	{/each}
</svg>

<style lang="scss">
	.fb {
		display: block;
		width: 100%;
		max-width: 560px;
		height: auto;
	}
	.string {
		stroke: var(--color-grey-400);
		stroke-width: 1;
	}
	.nut {
		stroke: var(--color-black);
		stroke-width: 3;
	}
	.fret {
		stroke: var(--color-grey-200);
		stroke-width: 1.5;
	}
	.inlay {
		fill: var(--color-grey-200);
	}
	.fretnum {
		fill: var(--ink-3);
		font-family: inherit;
		font-size: 11px;
	}
	.tone {
		fill: var(--ink-2);
		stroke: var(--ink-2);
		stroke-width: 0;
	}
	.tone--root {
		fill: var(--ink);
		stroke: var(--ink);
	}
	.tone--open {
		fill: transparent;
		stroke-width: 2;
	}
	.tone__pip {
		fill: var(--paper);
	}
</style>
