<script lang="ts">
	// A chord symbol set like a Real Book: big root, small raised quality, the
	// slash bass back at full size. Size it with font-size on the parent; width
	// and weight follow --cs-stretch / --cs-weight. Display only.
	//
	// Flats and sharps are DRAWN, not typed: Archivo has no ♭/♯, and the system
	// fallback glyph came out light, wide and different on every platform — a
	// gap between root and quality in exactly the place a chart is read.
	import { chordFace } from '$lib/model/symbol';

	let { symbol }: { symbol: string } = $props();

	const face = $derived(chordFace(symbol));
	const pieces = (text: string) => text.split(/([♭♯])/).filter((p) => p !== '');
</script>

{#snippet ink(text: string)}{#each pieces(text) as part, i (i)}{#if part === '♭'}<svg
				class="acc acc--flat"
				viewBox="0 0 10.4 24"
				role="img"
				aria-label="flat"
				><path
					fill-rule="evenodd"
					d="M0.8 0h2.4v12.6c1.5-1.5 3.1-2.2 4.4-2.2 1.6 0 2.6 1.1 2.6 2.9 0 2.7-2.4 5.6-7 10.7H0.8z M3.2 14.6v6.4c2.6-2.5 3.9-4.5 3.9-6 0-0.8-0.4-1.3-1.1-1.3-0.8 0-1.8 0.3-2.8 0.9z"
				/></svg
			>{:else if part === '♯'}<svg class="acc acc--sharp" viewBox="0 0 14 26" role="img" aria-label="sharp"
				><path d="M4 1h2.2v24H4z M8.6 0h2.2v24H8.6z M1 9.4 13 6.2v3.4L1 12.8z M1 17 13 13.8v3.4L1 20.4z" /></svg
			>{:else}{part}{/if}{/each}{/snippet}

{#if face}<span class="cs" class:cs--long={face.quality.length >= 5}
		><span class="cs__root">{@render ink(face.root)}</span>{#if face.quality}<span class="cs__q"
				>{@render ink(face.quality)}</span
			>{/if}{#if face.bass}<span class="cs__bass">/{@render ink(face.bass)}</span>{/if}</span
	>{:else}<span class="cs">{symbol}</span>{/if}

<style lang="scss">
	.cs {
		display: inline-flex;
		align-items: flex-start;
		max-width: 100%;
		white-space: nowrap;
		font-family: var(--font-display);
		font-stretch: var(--cs-stretch, 72%);
		font-weight: var(--cs-weight, 800);
		line-height: 1;
		letter-spacing: 0;
	}

	.cs__q {
		font-size: 0.56em;
		margin-left: 0.05em;
		position: relative;
		top: 0.02em;
	}

	/* Long qualities (7sus4, maj7♯11) set a size smaller, so they fit the
	   measure instead of being cut off. */
	.cs--long .cs__q {
		font-size: 0.46em;
	}

	.cs__bass {
		font-size: 0.8em;
		align-self: flex-end;
	}

	/* Drawn accidentals, sized to the cap height they sit beside. */
	.acc {
		display: inline-block;
		fill: currentColor;
		vertical-align: baseline;
	}

	.acc--flat {
		height: 0.76em;
		width: 0.33em;
		margin: 0 0.02em 0 0.04em;
	}

	.acc--sharp {
		height: 0.8em;
		width: 0.43em;
		margin: 0 0.02em 0 0.04em;
		vertical-align: -0.05em;
	}
</style>
