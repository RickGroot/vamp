<script lang="ts">
	// One chord of a Learn passage as a printed chip: the chord under a 6px tab of
	// its quality's ink, its Roman numeral beneath. Sounding, it is a solid block
	// of that ink with an ink rule round it (yellow on the wash is too faint to
	// carry it alone). Tap it to hear the chord on its own.
	//
	// The colour is the chord's QUALITY and nothing else — so a quiz only shows
	// chips once the question is answered.
	import { displayChord } from '$lib/audio/transpose';
	import { classifyChord } from '$lib/model/chords';
	import { view } from '$lib/stores/view.svelte';
	import ChordSymbol from '../ChordSymbol.svelte';
	import Numeral from '../Numeral.svelte';

	let {
		symbol,
		numeral = '',
		on = false,
		mark,
		onclick
	}: {
		/** Concert symbol; shown at the written pitch. */
		symbol: string;
		numeral?: string;
		/** Sounding now. */
		on?: boolean;
		/** A word in the corner ("Home"). */
		mark?: string;
		onclick: () => void;
	} = $props();
</script>

<button
	class="chip"
	class:chip--on={on}
	style:--q="var(--c-{classifyChord(symbol)})"
	aria-current={on ? 'true' : undefined}
	{onclick}
>
	<span class="chip__chord"><ChordSymbol symbol={displayChord(symbol, view.offset)} /></span>
	{#if numeral}<span class="chip__num" style:--chars={Math.max(3, numeral.length)}><Numeral {numeral} /></span>{/if}
	{#if mark}<span class="label chip__mark">{mark}</span>{/if}
</button>

<style lang="scss">
	.chip {
		position: relative;
		container-type: inline-size;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-1);
		width: 100%;
		min-height: var(--tap);
		padding: var(--space-2) var(--space-3) var(--space-3);
		border: 0;
		border-top: 6px solid var(--q);
		border-radius: 0;
		background: var(--wash);
		font-family: inherit;
		color: var(--ink);
		text-align: left;
		cursor: pointer;

		&:hover {
			background: var(--rule);
		}
	}

	.chip--on,
	.chip--on:hover {
		background: var(--q);
		color: var(--on-pigment);
		box-shadow: inset 0 0 0 var(--rule-heavy) var(--ink);
	}

	/* Sized to the chip, never past it: a chord can't spill into its neighbour
	   at a large text size. */
	.chip__chord {
		font-size: min(2.25rem, 40cqi);
		line-height: 1;
	}

	/* Shrinks only when a long numeral (♭VImaj7) meets a phone's narrow chip. */
	.chip__num {
		font-size: min(0.9375rem, calc(190cqi / var(--chars)));
		font-weight: 800;
	}

	/* Bottom right, level with the numeral: the chord's name owns the top of
	   the chip, and on a phone a wide one (E♭m) reaches the right edge. */
	.chip__mark {
		position: absolute;
		right: var(--space-2);
		bottom: var(--space-3);
		color: var(--ink);
	}

	.chip--on .chip__mark {
		color: var(--on-pigment);
	}
</style>
