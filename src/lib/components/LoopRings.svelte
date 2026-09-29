<script lang="ts">
	// The loop as a tree's cross-section, drawn round the play disc: one arc per
	// looped bar in its chord's pigment, a hand that travels round in time, and a
	// growth ring for every chorus you've played this session. When you stop,
	// the rings (and the caption under them) are the record of what you did.
	//
	// The hand reads the engine's own clock each frame while the song plays, so
	// it can't drift from the band; stopped, nothing animates. Reduced motion:
	// the hand steps bar to bar instead of sweeping.
	import { onMount, type Snippet } from 'svelte';
	import { MediaQuery } from 'svelte/reactivity';
	import { engine, type EngineState } from '$lib/audio/engine';
	import { isValidChordSymbol } from '$lib/audio/chord';
	import { progression } from '$lib/stores/progression.svelte';
	import { classifyChord } from '$lib/model/chords';
	import { flattenSlots } from '$lib/model/slots';
	import { loopBars, resolveLoopRange } from '$lib/model/time';
	import { loopFraction } from '$lib/art/music';
	import { barArcs, polar, ringPath, sessionSummary, tensionsOf } from '$lib/art/rings';

	let {
		children,
		caption = $bindable(''),
		disc = 56
	}: {
		children: Snippet;
		caption?: string;
		/** Diameter of the disc it rings, in px — the drawing scales with it. */
		disc?: number;
	} = $props();

	const SIZE = 120;
	const C = SIZE / 2;
	const R_BAND = 35; // the loop's own ring, just outside the 28-unit disc
	const R_RING = 42; // first growth ring
	const RING_GAP = 2.4;
	const MAX_RINGS = 6;

	const reducedMotion = new MediaQuery('(prefers-reduced-motion: reduce)');

	const bars = $derived(loopBars(progression.current));
	const families = $derived(
		bars.map((bar) => {
			const slot = bar.slots.find((s) => s.chord.trim() !== '' && isValidChordSymbol(s.chord));
			return slot ? classifyChord(slot.chord) : null;
		})
	);
	const arcs = $derived(barArcs(bars.length, C, C, R_BAND, 0.07));
	const tensions = $derived(tensionsOf(families));

	// Which looped bar is sounding (the highlight is a global slot index).
	const currentBar = $derived.by(() => {
		const active = progression.activeSlot;
		if (active === null || engine.source !== 'progression') return -1;
		const flat = flattenSlots(progression.current.bars)[active];
		return flat ? flat.barIndex - resolveLoopRange(progression.current).start : -1;
	});

	const playingThis = $derived(progression.isPlaying && currentBar >= 0);

	// ---- session: choruses played since you last pressed play ----
	let choruses = $state(0);
	let sessionMs = $state(0);
	let startedAt = 0;

	onMount(() => {
		let prev: EngineState = engine.state;
		let fresh = false;
		const offState = engine.onState((s) => {
			if (prev === 'stopped' && s === 'loading') {
				choruses = 0;
				sessionMs = 0;
				fresh = true;
			}
			// Time the music, not the sample download before it.
			if (s === 'playing' && fresh) {
				startedAt = performance.now();
				fresh = false;
			}
			if (s === 'stopped' && prev !== 'stopped' && startedAt) {
				sessionMs = performance.now() - startedAt;
				startedAt = 0;
			}
			prev = s;
		});
		const offLoop = engine.onLoop(() => {
			if (engine.source === 'progression') choruses += 1;
		});
		return () => {
			offState();
			offLoop();
		};
	});

	// ---- the hand ----
	let frac = $state(0);
	$effect(() => {
		if (!playingThis) return;
		if (reducedMotion.current) {
			// Step with the music instead of sweeping.
			frac = bars.length ? currentBar / bars.length : 0;
			return;
		}
		let raf = 0;
		const tick = () => {
			frac = loopFraction(engine.clock());
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	});

	const hand = $derived(polar(C, C, R_BAND, frac * Math.PI * 2));

	const shownRings = $derived(Math.min(choruses, MAX_RINGS));
	const rings = $derived(
		Array.from({ length: shownRings }, (_, i) => ({
			d: ringPath(C, C, R_RING + i * RING_GAP, choruses - shownRings + i, tensions),
			// Newest ring outermost and darkest, like the growing edge of a trunk.
			opacity: shownRings === 1 ? 0.9 : 0.3 + 0.6 * (i / (shownRings - 1))
		}))
	);

	// The session's line of text: bound out, so the transport can set it where it reads best.
	const text = $derived(
		playingThis
			? `Chorus ${choruses + 1}`
			: sessionMs > 0 && choruses > 0
				? sessionSummary(choruses, sessionMs)
				: ''
	);
	$effect(() => {
		caption = text;
	});
</script>

<div class="clock" style:--disc="{disc}px" style:--art="{(disc * SIZE) / 56}px">
	<svg class="clock__art" viewBox="0 0 {SIZE} {SIZE}" aria-hidden="true">
		{#each rings as ring, i (i)}
			<path class="clock__ring" d={ring.d} style:opacity={ring.opacity} />
		{/each}
		{#each arcs as d, i (i)}
			<path
				class="clock__bar"
				class:clock__bar--now={playingThis && i === currentBar}
				class:clock__bar--dim={playingThis && i !== currentBar}
				{d}
				style:stroke={families[i] ? `var(--c-${families[i]})` : 'var(--rule)'}
			/>
		{/each}
		{#if playingThis}
			<circle class="clock__hand" cx={hand[0]} cy={hand[1]} r="3.2" />
		{/if}
	</svg>
	{@render children()}
</div>

<style lang="scss">
	/* Takes up exactly the disc's footprint in the row; the rings are drawn in
	   the margin around it, so the transport doesn't grow as you play. */
	.clock {
		position: relative;
		display: grid;
		place-items: center;
		flex: 0 0 auto;
		width: var(--disc);
		height: var(--disc);
		margin: calc(var(--disc) / 4) calc(var(--disc) * 0.54) calc(var(--disc) / 4) calc(var(--disc) * 0.4);
	}

	.clock__art {
		position: absolute;
		left: 50%;
		top: 50%;
		width: var(--art);
		height: var(--art);
		transform: translate(-50%, -50%);
		overflow: visible;
		pointer-events: none;
	}

	.clock__bar {
		fill: none;
		stroke-width: 4;
		stroke-linecap: round;
		opacity: 0.75;
		transition:
			opacity var(--motion-standard) var(--motion-ease-out),
			stroke-width var(--motion-standard) var(--motion-ease-out);
	}

	.clock__bar--dim {
		opacity: 0.35;
	}

	.clock__bar--now {
		opacity: 1;
		stroke-width: 5.5;
	}

	.clock__ring {
		fill: none;
		stroke: var(--ink-2);
		stroke-width: 0.8;
	}

	.clock__hand {
		fill: var(--ink);
		stroke: var(--ground);
		stroke-width: 1.5;
	}


</style>
