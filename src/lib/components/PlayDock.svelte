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

	<p class="dock__cue" style:--q={family ? `var(--c-${family})` : 'transparent'}>
		<span class="dock__now">{now || '—'}</span>
		{#if next}<span class="dock__next">then {next}</span>{/if}
	</p>

	<button class="bar-btn dock__stand" type="button" onclick={onstand}>Stand</button>
</div>

<style lang="scss">
	.dock {
		position: fixed;
		left: 50%;
		bottom: calc(var(--space-3) + env(safe-area-inset-bottom));
		z-index: 40;
		display: flex;
		align-items: center;
		gap: var(--space-3);
		width: min(460px, calc(100% - 2 * var(--space-4)));
		padding: var(--space-2) var(--space-2) var(--space-2) var(--space-2);
		background: var(--paper);
		border: 1px solid var(--ink);
		border-radius: calc(var(--tap) / 2 + var(--space-2));
		box-shadow: 0 10px 28px var(--shadow);
		transform: translate(-50%, calc(100% + var(--space-6)));
		opacity: 0;
		transition:
			transform 260ms var(--motion-ease-out),
			opacity 200ms var(--motion-ease-out);
	}

	.dock--shown {
		transform: translate(-50%, 0);
		opacity: 1;
	}

	.dock__play {
		display: grid;
		place-items: center;
		flex: 0 0 auto;
		width: var(--tap);
		height: var(--tap);
		border: 0;
		border-radius: var(--radius-pill);
		background: radial-gradient(circle at 35% 30%, var(--sun) 0%, var(--spot) 78%);
		color: var(--on-spot);
		box-shadow: var(--lift);
	}

	.dock__cue {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		flex: 1 1 auto;
		min-width: 0;
		margin: 0;
	}

	.dock__now {
		font-family: var(--font-hand);
		font-size: 1.625rem;
		line-height: 1;
		padding-bottom: 2px;
		border-bottom: 4px solid var(--q);
		white-space: nowrap;
	}

	.dock__next {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 0.875rem;
		color: var(--ink-3);
	}

	.dock__stand {
		flex: 0 0 auto;
		min-height: var(--tap);
		border-radius: calc(var(--tap) / 2);
		padding: 0 var(--space-4);
	}
</style>
