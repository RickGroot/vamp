<script lang="ts">
	// A chord symbol set like a Real Book: big root, small raised quality, the
	// slash bass back at full size. Size it with font-size on the parent; width
	// and weight follow --cs-stretch / --cs-weight. Display only.
	//
	// Flats and sharps are DRAWN, not typed (Accidental.svelte): Archivo has no
	// ♭/♯, and the system fallback glyph came out light, wide and different on
	// every platform — a gap between root and quality in exactly the place a
	// chart is read. Because they are images, the drawn face is hidden from
	// assistive tech and the chord is SAID instead ("E flat minor seven").
	//
	// Wrap it in a positioned element if the spoken span must stay inside a
	// clipped box: it is absolutely positioned, 1px, clipped.
	import { chordFace, spokenChord } from '$lib/model/symbol';
	import Accidental from './Accidental.svelte';

	let { symbol }: { symbol: string } = $props();

	const face = $derived(chordFace(symbol));
	const pieces = (text: string) => text.split(/([♭♯])/).filter((p) => p !== '');
</script>

{#snippet ink(text: string)}{#each pieces(text) as part, i (i)}{#if part === '♭'}<Accidental
				kind="flat"
			/>{:else if part === '♯'}<Accidental kind="sharp" />{:else}{part}{/if}{/each}{/snippet}

{#if face}<span class="cs" class:cs--long={face.quality.length >= 5} aria-hidden="true"
		><span class="cs__root">{@render ink(face.root)}</span>{#if face.quality}<span class="cs__q"
				>{@render ink(face.quality)}</span
			>{/if}{#if face.bass}<span class="cs__bass">/{@render ink(face.bass)}</span>{/if}</span
	><span class="visually-hidden">{spokenChord(symbol)}</span>{:else}<span class="cs">{symbol}</span>{/if}

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
</style>
