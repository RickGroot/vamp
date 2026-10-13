<script lang="ts">
	// A small transport that follows you once the real one scrolls away — so
	// play/stop and "what's sounding" are always in the thumb zone, whether
	// you're down in the notation, the scales or the band.
	import { progression } from '$lib/stores/progression.svelte';
	import { view } from '$lib/stores/view.svelte';
	import { engine } from '$lib/audio/engine';
	import { displayChord } from '$lib/audio/transpose';
	import { isValidChordSymbol } from '$lib/audio/chord';
	import { classifyChord } from '$lib/model/chords';
	import { flattenSlots } from '$lib/model/slots';
	import { resolveLoopRange } from '$lib/model/time';
	import { standCue } from '$lib/model/cue';
	import ChordSymbol from './ChordSymbol.svelte';

	let { shown, onstand }: { shown: boolean; onstand: () => void } = $props();

	const cue = $derived(
		standCue(
			flattenSlots(progression.current.bars),
			resolveLoopRange(progression.current),
			progression.isPlaying && engine.source === 'progression' ? progression.activeSlot : null
		)
	);
	const now = $derived(cue.now?.chord ? displayChord(cue.now.chord, view.offset) : '');
	const next = $derived(cue.next?.chord ? displayChord(cue.next.chord, view.offset) : '');
	const family = $derived(
		cue.now?.chord && isValidChordSymbol(cue.now.chord) ? classifyChord(cue.now.chord) : null
	);
</script>

<div class="dock" class:dock--shown={shown} inert={!shown} aria-hidden={!shown}>
	<button
		class="dock__play"
		type="button"
		aria-label={progression.isPlaying || progression.isLoading ? 'Stop' : 'Play'}
		onclick={() => progression.toggle()}
	>
		{#if progression.isPlaying || progression.isLoading}
			<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"
				><rect x="6" y="6" width="12" height="12" fill="currentColor" /></svg
			>
		{:else}
			<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"
				><path d="M8 5l11 7-11 7z" fill="currentColor" /></svg
			>
		{/if}
	</button>

	<p class="dock__cue" style:--q={family ? `var(--c-${family})` : 'var(--rule)'}>
		<span class="dock__now">{#if now}<ChordSymbol symbol={now} />{:else}—{/if}</span>
		{#if next}<span class="dock__next">then <ChordSymbol symbol={next} /></span>{/if}
	</p>

	<button class="bar-btn dock__stand" type="button" onclick={onstand}>Stand</button>
</div>

<style lang="scss">
	/* A printed strip along the bottom: a square of the field holding play, the
	   chord you're on, and the way to the stand. */
	.dock {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 40;
		display: flex;
		align-items: stretch;
		gap: var(--space-3);
		padding: 0 max(var(--space-4), calc((100% - 1100px) / 2 + var(--space-6))) env(safe-area-inset-bottom);
		background: var(--paper);
		border-top: var(--rule-heavy) solid var(--ink);
		transform: translateY(calc(100% + var(--space-2)));
		transition: transform 260ms var(--motion-ease-out);
	}

	.dock--shown {
		transform: translateY(0);
	}

	.dock__play {
		display: grid;
		place-items: center;
		flex: 0 0 auto;
		width: 64px;
		min-height: 60px;
		border: 0;
		background: var(--field);
		color: var(--on-field);

		&:focus-visible {
			outline-offset: -6px;
			outline-color: var(--on-field);
		}
	}

	.dock__cue {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		flex: 1 1 auto;
		min-width: 0;
		margin: 0;
	}

	.dock__now {
		--cs-stretch: 62%;
		--cs-weight: 900;
		font-size: 2rem;
		line-height: 1;
		padding-top: 4px;
		box-shadow: inset 0 4px 0 var(--q);
		white-space: nowrap;
	}

	.dock__next {
		display: inline-flex;
		align-items: baseline;
		gap: var(--space-1);
		overflow: hidden;
		white-space: nowrap;
		font-size: 0.75rem;
		font-weight: 800;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--ink-3);

		:global(.cs) {
			font-size: 1.375rem;
			text-transform: none;
			color: var(--ink-2);
		}
	}

	.dock__stand {
		flex: 0 0 auto;
		align-self: center;
		min-height: var(--tap);
	}
</style>
