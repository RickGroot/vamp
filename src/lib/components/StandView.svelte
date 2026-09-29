<script lang="ts">
	// The music stand: the view for when your hands are on your instrument.
	// One enormous chord you can read from two metres away, the next CHANGE
	// beneath it, the whole chart compact below, and the transport at the bottom
	// where a thumb reaches. A native <dialog>: it takes the screen, traps focus,
	// and Escape puts you back where you were.
	//
	// Focus lands on the stand itself (not the Close button), so Space still
	// toggles play from the layout's shortcut instead of pressing Close.
	import { progression, TEMPO_MIN, TEMPO_MAX } from '$lib/stores/progression.svelte';
	import { view } from '$lib/stores/view.svelte';
	import { engine } from '$lib/audio/engine';
	import { isValidChordSymbol } from '$lib/audio/chord';
	import { displayChord } from '$lib/audio/transpose';
	import { classifyChord } from '$lib/model/chords';
	import { flattenSlots } from '$lib/model/slots';
	import { resolveLoopRange } from '$lib/model/time';
	import { standCue } from '$lib/model/cue';
	import LoopRings from './LoopRings.svelte';
	import KeyCompass from './KeyCompass.svelte';
	import { inferKey } from '$lib/model/key';

	let { open = $bindable(false) }: { open?: boolean } = $props();

	let dialog: HTMLDialogElement | undefined = $state();
	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) dialog.showModal();
		else if (!open && dialog.open) dialog.close();
	});

	const flat = $derived(flattenSlots(progression.current.bars));
	const songChords = $derived(flat.map((f) => f.slot.chord));
	const keyInfo = $derived(inferKey(songChords));
	const range = $derived(resolveLoopRange(progression.current));
	const active = $derived(
		progression.isPlaying && engine.source === 'progression' ? progression.activeSlot : null
	);
	const cue = $derived(standCue(flat, range, active));

	const show = (chord: string | undefined) => (chord ? displayChord(chord, view.offset) : '');
	const familyOf = (chord: string | undefined) =>
		chord && isValidChordSymbol(chord) ? classifyChord(chord) : null;

	const nowChord = $derived(show(cue.now?.chord));
	const nowFamily = $derived(familyOf(cue.now?.chord));
	const nextChord = $derived(show(cue.next?.chord));
	const nextWhen = $derived(
		!cue.next ? '' : cue.barsAway === 0 ? 'this bar' : cue.barsAway === 1 ? 'next bar' : `in ${cue.barsAway} bars`
	);
	const playingBar = $derived(active === null ? -1 : (flat[active]?.barIndex ?? -1));
	const loopActive = $derived(progression.current.loopRange !== null);

	let session = $state('');

	function nudgeTempo(by: number) {
		progression.setTempo(Math.min(TEMPO_MAX, Math.max(TEMPO_MIN, progression.current.tempo + by)));
	}
</script>

<dialog
	class="stand"
	bind:this={dialog}
	aria-label="Music stand"
	oncancel={() => (open = false)}
	onclose={() => (open = false)}
>
	{#if open}
		<!-- svelte-ignore a11y_autofocus -->
		<div class="stand__page" tabindex="-1" autofocus>
			<header class="stand__head">
				<h2 class="stand__title">{progression.current.name || 'Untitled'}</h2>
				<p class="stand__meta hint">
					{progression.current.timeSignature.numerator}/{progression.current.timeSignature.denominator}
					· {progression.current.tempo} bpm
				</p>
				<KeyCompass
					tonic={progression.isBlank ? '' : keyInfo.tonic}
					chords={songChords}
					sounding={active === null ? '' : (cue.now?.chord ?? '')}
					offset={view.offset}
					size={76}
				/>
				<button class="bar-btn stand__close" type="button" onclick={() => (open = false)}>
					<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"
						><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg
					>
					Close
				</button>
			</header>

			<div class="stand__now" style:--q={nowFamily ? `var(--c-${nowFamily})` : 'var(--rule)'}>
				{#key nowChord}
					<p class="stand__chord" class:stand__chord--rest={!nowChord}>{nowChord || '—'}</p>
				{/key}
				<p class="stand__next">
					{#if nextChord}
						<span class="label">Next</span>
						<span class="stand__next-chord">{nextChord}</span>
						<span class="hint">{nextWhen}</span>
					{:else}
						<span class="hint">One chord — stay on it</span>
					{/if}
				</p>
			</div>

			<ol class="stand__chart" aria-label="Chart">
				{#each progression.current.bars as bar, b (bar.id)}
					<li
						class="stand__bar"
						class:stand__bar--now={b === playingBar}
						class:stand__bar--out={loopActive && (b < range.start || b > range.end)}
					>
						{#each bar.slots as slot (slot.id)}
							{@const fam = familyOf(slot.chord)}
							<span
								class="stand__slot"
								class:stand__slot--now={active !== null && flat[active]?.slot.id === slot.id}
								style:--q={fam ? `var(--c-${fam})` : 'transparent'}
								style:--wq={fam ? `var(--w-${fam})` : 'transparent'}
								>{show(slot.chord.trim()) || '·'}</span
							>
						{/each}
					</li>
				{/each}
			</ol>

			<div class="stand__transport">
				<div class="stand__tempo" role="group" aria-label="Tempo">
					<button class="stand__step" type="button" aria-label="Slower by 5 bpm" onclick={() => nudgeTempo(-5)}
						>−5</button
					>
					<span class="stand__bpm"><strong>{progression.current.tempo}</strong> bpm</span>
					<button class="stand__step" type="button" aria-label="Faster by 5 bpm" onclick={() => nudgeTempo(5)}
						>+5</button
					>
				</div>

				<LoopRings bind:caption={session} disc={72}>
					<button
						class="stand__play"
						class:stand__play--on={progression.isPlaying}
						type="button"
						aria-label={progression.isPlaying || progression.isLoading ? 'Stop' : 'Play'}
						onclick={() => progression.toggle()}
					>
						{#if progression.isLoading}
							<span class="stand__loading" aria-hidden="true"></span>
						{:else if progression.isPlaying}
							<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"
								><rect x="6" y="6" width="12" height="12" fill="currentColor" /></svg
							>
						{:else}
							<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"
								><path d="M8 5l11 7-11 7z" fill="currentColor" /></svg
							>
						{/if}
					</button>
				</LoopRings>

				<p class="stand__session" aria-live="polite">{session}</p>
			</div>
		</div>
	{/if}
</dialog>

<style lang="scss">
	.stand {
		width: 100vw;
		height: 100dvh;
		max-width: none;
		max-height: none;
		margin: 0;
		padding: 0;
		border: 0;
		color: var(--ink);
		background-color: var(--ground);
		/* The same sky as the page, the weather a little stronger: the stand is the art. */
		background-image:
			radial-gradient(90% 60% at 50% -10%, color-mix(in srgb, var(--weather) 30%, transparent), transparent 70%),
			var(--grain),
			var(--sky);
		background-size:
			auto,
			180px 180px,
			100% 100%;

		&::backdrop {
			background: var(--ground);
		}
	}

	.stand__page {
		display: grid;
		grid-template-rows: auto 1fr auto auto;
		gap: var(--space-4);
		max-width: 1100px;
		height: 100%;
		margin: 0 auto;
		padding: var(--space-4) var(--space-6) calc(var(--space-4) + env(safe-area-inset-bottom));
		outline: none;
	}

	.stand__head {
		display: flex;
		align-items: center;
		gap: var(--space-2) var(--space-4);
		flex-wrap: wrap;
	}

	.stand__title {
		font-family: var(--font-hand);
		font-weight: 400;
		font-size: 1.75rem;
		line-height: 1.1;
		min-width: 0;
	}

	.stand__meta {
		margin: 0;
		font-variant-numeric: tabular-nums;
	}

	.stand__close {
		margin-left: auto;
		min-height: var(--tap);
	}

	/* The chord you can read from across the room. */
	.stand__now {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 0;
		text-align: center;
	}

	.stand__chord {
		position: relative;
		margin: 0;
		font-family: var(--font-hand);
		font-size: clamp(5rem, 18vw, 12rem);
		line-height: 1;
		color: var(--ink);
		/* Lit from behind in its own colour. */
		text-shadow: 0 0 0.16em color-mix(in srgb, var(--q) 60%, transparent);
		animation: stand-land 300ms var(--motion-pop);

		/* Its ink, laid under it like the chart's stroke, only bolder. */
		&::after {
			content: '';
			position: absolute;
			left: 8%;
			right: 8%;
			bottom: -0.06em;
			height: 0.07em;
			border-radius: 0.04em;
			background: var(--q);
			transition: background-color var(--motion-standard) var(--motion-ease-out);
		}

		&--rest {
			color: var(--ink-4);
			text-shadow: none;
		}
	}

	@keyframes stand-land {
		from {
			transform: scale(0.92) translateY(0.04em);
		}
	}

	.stand__next {
		display: flex;
		align-items: baseline;
		gap: var(--space-3);
		margin: var(--space-8) 0 0;
	}

	.stand__next-chord {
		font-family: var(--font-hand);
		font-size: clamp(1.75rem, 5vw, 3rem);
		line-height: 1;
		color: var(--ink-2);
	}

	/* The whole tune, compact: four bars to a line, like the lead sheet. */
	.stand__chart {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		row-gap: var(--space-2);
		margin: 0;
		padding: 0;
		list-style: none;
		max-height: 30vh;
		/* Barlines overlap by a pixel; give that pixel room so no sideways scroll appears. */
		padding-right: 1px;
		overflow: hidden auto;
	}

	.stand__bar {
		display: flex;
		gap: 2px;
		margin-right: -1px;
		border-left: 1px solid var(--ink);
		border-right: 1px solid var(--ink);
		padding: var(--space-1);
		transition: opacity var(--motion-standard) var(--motion-ease-out);

		&--now {
			box-shadow: inset 0 4px 0 var(--spot);
		}

		&--out {
			opacity: 0.4;
		}
	}

	.stand__slot {
		flex: 1 1 0;
		min-width: 0;
		padding: var(--space-1) 2px;
		border-radius: var(--radius);
		border-bottom: 3px solid var(--q);
		background:
			var(--wq);
		box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--q) var(--ring), transparent);
		font-family: var(--font-hand);
		font-size: clamp(1rem, 3.2vw, 1.5rem);
		line-height: 1.2;
		text-align: center;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;

		&--now {
			background: var(--q);
			color: var(--on-pigment);
		}
	}

	/* Everything you touch mid-tune, in the thumb zone. */
	.stand__transport {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-4) var(--space-8);
		flex-wrap: wrap;
		padding-top: var(--space-2);
		border-top: 1px solid var(--rule);
	}

	.stand__tempo {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.stand__step {
		min-width: var(--tap);
		min-height: var(--tap);
		border: 1px solid var(--edge);
		border-radius: var(--radius);
		background: var(--paper);
		font-family: inherit;
		font-size: 0.9375rem;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		color: var(--ink);

		&:hover {
			border-color: var(--ink);
			background: var(--wash);
		}
	}

	.stand__bpm {
		min-width: 6ch;
		text-align: center;
		font-variant-numeric: tabular-nums;
		color: var(--ink-2);

		strong {
			font-size: 1.25rem;
			color: var(--ink);
		}
	}

	.stand__play {
		display: grid;
		place-items: center;
		width: 72px;
		height: 72px;
		border: 0;
		border-radius: var(--radius-pill);
		background: radial-gradient(circle at 35% 30%, var(--sun) 0%, var(--spot) 78%);
		color: var(--on-spot);
		box-shadow: var(--lift);

		&:active {
			transform: scale(0.96);
		}

		&:focus-visible {
			outline-offset: 3px;
		}

		&--on {
			box-shadow:
				var(--lift),
				0 0 0 3px var(--ground),
				0 0 0 5px var(--spot);
		}
	}

	.stand__loading {
		width: 22px;
		height: 22px;
		border: 2px solid currentColor;
		border-top-color: transparent;
		border-radius: var(--radius-pill);
		animation: stand-spin 700ms linear infinite;
	}

	@keyframes stand-spin {
		to {
			transform: rotate(360deg);
		}
	}

	.stand__session {
		min-width: 12ch;
		margin: 0;
		font-size: 0.875rem;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		color: var(--ink-2);
	}

	@media (max-width: 600px) {
		.stand__page {
			padding: var(--space-2) var(--space-4) calc(var(--space-3) + env(safe-area-inset-bottom));
			gap: var(--space-3);
		}

		.stand__title {
			font-size: 1.375rem;
		}

		.stand__meta {
			display: none;
		}

		.stand__chart {
			max-height: 26vh;
		}

		.stand__transport {
			gap: var(--space-3) var(--space-6);
		}

		.stand__session {
			flex-basis: 100%;
			text-align: center;
			min-height: 1.2em;
		}
	}
</style>
