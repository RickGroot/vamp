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
	import ChordSymbol from './ChordSymbol.svelte';
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
	const nextChord = $derived(show(cue.next?.chord));
	const nextWhen = $derived(
		!cue.next ? '' : cue.barsAway === 0 ? 'this bar' : cue.barsAway === 1 ? 'next bar' : `in ${cue.barsAway} bars`
	);
	const playingBar = $derived(active === null ? -1 : (flat[active]?.barIndex ?? -1));
	const position = $derived(playingBar < 0 ? '' : `Bar ${playingBar + 1} of ${progression.current.bars.length}`);
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
				<p class="stand__meta">
					{progression.current.timeSignature.numerator}/{progression.current.timeSignature.denominator}
					· {progression.current.tempo} bpm
				</p>
				<KeyCompass
					tonic={progression.isBlank ? '' : keyInfo.tonic}
					chords={songChords}
					sounding={active === null ? '' : (cue.now?.chord ?? '')}
					offset={view.offset}
					mode={keyInfo.mode}
					size={56}
				/>
				<button class="bar-btn stand__close" type="button" onclick={() => (open = false)}>
					<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"
						><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg
					>
					Close
				</button>
			</header>

			<!-- The field: the chord you are on, readable from across the room. -->
			<div class="stand__now">
				<p class="stand__now-head">
					<span class="label">{active === null ? `From bar ${range.start + 1}` : 'Now'}</span>
					<span class="label">{position}</span>
				</p>
				{#key nowChord}
					<p class="stand__chord" class:stand__chord--rest={!nowChord}>
						{#if nowChord}<ChordSymbol symbol={nowChord} />{:else}—{/if}
					</p>
				{/key}
			</div>

			<p class="stand__next">
				{#if nextChord}
					<span class="label">Next change · {nextWhen}</span>
					<span class="stand__next-chord"><ChordSymbol symbol={nextChord} /></span>
				{:else}
					<span class="label">One chord — stay on it</span>
				{/if}
			</p>

			<ol class="stand__chart" aria-label="Chart">
				{#each progression.current.bars as bar, b (bar.id)}
					<li class="stand__bar" class:stand__bar--out={loopActive && (b < range.start || b > range.end)}>
						{#each bar.slots as slot (slot.id)}
							{@const fam = familyOf(slot.chord)}
							<span
								class="stand__slot"
								class:stand__slot--now={active !== null && flat[active]?.slot.id === slot.id}
								style:--q={fam ? `var(--c-${fam})` : 'var(--rule)'}
								>{#if slot.chord.trim()}<ChordSymbol symbol={show(slot.chord.trim())} />{:else}·{/if}</span
							>
						{/each}
					</li>
				{/each}
			</ol>

			<div class="stand__transport">
				<div class="stand__tempo" role="group" aria-label="Tempo">
					<button class="bar-btn stand__step" type="button" aria-label="Slower by 5 bpm" onclick={() => nudgeTempo(-5)}
						>−5</button
					>
					<span class="stand__bpm"><strong>{progression.current.tempo}</strong> bpm</span>
					<button class="bar-btn stand__step" type="button" aria-label="Faster by 5 bpm" onclick={() => nudgeTempo(5)}
						>+5</button
					>
				</div>

				<LoopRings bind:caption={session} disc={72}>
					<button
						class="stand__play"
						type="button"
						aria-label={progression.isPlaying || progression.isLoading ? 'Stop' : 'Play'}
						onclick={() => progression.toggle()}
					>
						{#if progression.isLoading}
							<span class="stand__loading" aria-hidden="true"></span>
						{:else if progression.isPlaying}
							<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"
								><rect x="6" y="6" width="12" height="12" fill="currentColor" /></svg
							>
						{:else}
							<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"
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
		background: var(--ground);

		&::backdrop {
			background: var(--ground);
		}
	}

	.stand__page {
		display: grid;
		grid-template-rows: auto minmax(0, 1fr) auto auto auto;
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
		padding-bottom: var(--space-3);
	}

	.stand__title {
		min-width: 0;
		font-family: var(--font-display);
		font-stretch: var(--display-stretch);
		font-weight: 900;
		font-size: 2rem;
		line-height: 1;
	}

	.stand__meta {
		margin: 0;
		font-size: 0.75rem;
		font-weight: 800;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		font-variant-numeric: tabular-nums;
		color: var(--ink-3);
	}

	.stand__close {
		margin-left: auto;
		min-height: var(--tap);
	}

	/* The field: one block of the chord's colour, the chord set as large as it
	   will go. */
	.stand__now {
		display: grid;
		grid-template-rows: auto minmax(0, 1fr);
		min-height: 0;
		padding: var(--space-4) var(--space-6) var(--space-6);
		background: var(--field);
		color: var(--on-field);
	}

	.stand__now-head {
		display: flex;
		justify-content: space-between;
		margin: 0;

		.label {
			color: var(--on-field);
		}
	}

	.stand__chord {
		--cs-stretch: 62%;
		--cs-weight: 900;
		align-self: end;
		margin: 0;
		font-family: var(--font-display);
		font-stretch: var(--display-stretch);
		font-weight: 900;
		font-size: min(36vw, 34vh, 18rem);
		line-height: 0.82;
		overflow: hidden;
		animation: stand-cut 140ms var(--motion-ease-out);

		&--rest {
			opacity: 0.5;
		}
	}

	@keyframes stand-cut {
		from {
			opacity: 0.4;
		}
	}

	.stand__next {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
		margin: 0;
		padding: var(--space-3) 0;
		border-bottom: var(--rule-heavy) solid var(--ink);
	}

	.stand__next-chord {
		--cs-stretch: 62%;
		--cs-weight: 900;
		font-size: clamp(2.25rem, 7vw, 3.75rem);
		line-height: 1;
	}

	/* The whole tune, compact: four bars to a line, like the lead sheet. */
	.stand__chart {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		row-gap: var(--space-2);
		margin: var(--space-3) 0 0;
		padding: 0 var(--rule-heavy) 0 0;
		list-style: none;
		max-height: 26vh;
		overflow: hidden auto;
	}

	.stand__bar {
		display: flex;
		gap: 3px;
		margin-right: calc(-1 * var(--rule-heavy));
		border-left: var(--rule-heavy) solid var(--ink);
		border-right: var(--rule-heavy) solid var(--ink);
		padding: 0 var(--space-1);
		transition: opacity var(--motion-standard) var(--motion-ease-out);

		&--out {
			opacity: 0.35;
		}
	}

	.stand__slot {
		flex: 1 1 0;
		min-width: 0;
		container-type: inline-size;
		padding: var(--space-2) var(--space-1) var(--space-1);
		border-top: 4px solid var(--q);
		font-size: min(clamp(1.05rem, 3.2vw, 1.625rem), 30cqi);
		line-height: 1.1;
		white-space: nowrap;
		overflow: hidden;

		&--now {
			background: var(--q);
			color: var(--on-pigment);
		}
	}

	/* Everything you touch mid-tune, in the thumb zone. The play disc is inked
	   on the board here, rather than cut into a second field of colour. */
	.stand__transport {
		--field: var(--ground);
		--on-field: var(--ink);
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-4) var(--space-8);
		flex-wrap: wrap;
		margin-top: var(--space-3);
		padding-top: var(--space-2);
		border-top: var(--rule-heavy) solid var(--ink);
	}

	.stand__tempo {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.stand__step {
		min-width: var(--tap);
		min-height: var(--tap);
		font-variant-numeric: tabular-nums;
	}

	.stand__bpm {
		min-width: 6ch;
		text-align: center;
		font-size: 0.75rem;
		font-weight: 800;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		font-variant-numeric: tabular-nums;
		color: var(--ink-2);

		strong {
			font-family: var(--font-display);
			font-stretch: var(--display-stretch);
			font-weight: 900;
			font-size: 2.25rem;
			letter-spacing: 0;
			color: var(--ink);
		}
	}

	.stand__play {
		display: grid;
		place-items: center;
		width: 72px;
		height: 72px;
		border: 0;
		border-radius: 50%;
		background: var(--ink);
		color: var(--ground);
		transition: transform var(--motion-fast) var(--motion-ease-out);

		&:active {
			transform: scale(0.96);
		}

		&:focus-visible {
			outline-offset: 4px;
		}
	}

	.stand__loading {
		width: 22px;
		height: 22px;
		border: 2px solid currentColor;
		border-top-color: transparent;
		border-radius: 50%;
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
		font-size: 0.75rem;
		font-weight: 800;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		font-variant-numeric: tabular-nums;
		color: var(--ink-2);
	}

	@media (max-width: 600px) {
		.stand__page {
			padding: var(--space-2) var(--space-4) calc(var(--space-3) + env(safe-area-inset-bottom));
		}

		.stand__title {
			font-size: 1.5rem;
		}

		.stand__meta {
			display: none;
		}

		.stand__now {
			padding: var(--space-3) var(--space-4) var(--space-4);
		}

		.stand__chart {
			max-height: 24vh;
		}

		.stand__transport {
			gap: var(--space-2) var(--space-6);
		}

		.stand__session {
			flex-basis: 100%;
			text-align: center;
			min-height: 1.2em;
		}
	}
</style>
