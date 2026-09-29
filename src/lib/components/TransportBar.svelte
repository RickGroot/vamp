<script lang="ts">
	import { progression, TEMPO_MIN, TEMPO_MAX } from '$lib/stores/progression.svelte';
	import { bpmFromTaps, registerTap } from '$lib/audio/tapTempo';
	import { view } from '$lib/stores/view.svelte';
	import { flattenSlots } from '$lib/model/slots';
	import { inferKey } from '$lib/model/key';
	import { displayChord } from '$lib/audio/transpose';
	import LoopControl from './LoopControl.svelte';
	import LoopRings from './LoopRings.svelte';
	import KeyCompass from './KeyCompass.svelte';
	import { engine } from '$lib/audio/engine';

	const TIME_SIGNATURES = [
		{ label: '4/4', numerator: 4, denominator: 4 },
		{ label: '3/4', numerator: 3, denominator: 4 },
		{ label: '6/8', numerator: 6, denominator: 8 },
		{ label: '2/4', numerator: 2, denominator: 4 },
		{ label: '5/4', numerator: 5, denominator: 4 }
	];

	// The key the chords imply, spelled in WRITTEN pitch like everything you read.
	const keyInfo = $derived(
		inferKey(flattenSlots(progression.current.bars).map((f) => f.slot.chord))
	);
	const songChords = $derived(flattenSlots(progression.current.bars).map((f) => f.slot.chord));
	// The chord sounding now, for the compass (the song's own highlight only).
	const sounding = $derived.by(() => {
		const i = progression.activeSlot;
		if (i === null || !progression.isPlaying || engine.source !== 'progression') return '';
		return songChords[i] ?? '';
	});
	let session = $state('');
	const keyName = $derived(
		progression.isBlank ? '—' : `${displayChord(keyInfo.tonic, view.offset)} ${keyInfo.mode}`
	);

	const currentTs = $derived(
		`${progression.current.timeSignature.numerator}/${progression.current.timeSignature.denominator}`
	);
	// Imported/shared songs may carry a meter outside the fixed list (e.g. 7/8) —
	// surface it as an extra option so the select never renders blank.
	const customTs = $derived(TIME_SIGNATURES.some((t) => t.label === currentTs) ? null : currentTs);

	// Live-apply only values that are already valid; committing the clamp on every
	// keystroke would rewrite the field mid-typing (typing "90" became 200).
	function onTempoInput(event: Event) {
		const n = Number((event.target as HTMLInputElement).value);
		if (Number.isFinite(n) && n >= TEMPO_MIN && n <= TEMPO_MAX) progression.setTempo(n);
	}

	// Commit + clamp on change (blur/Enter/spinners) and resync the display.
	function onTempoChange(event: Event) {
		const input = event.target as HTMLInputElement;
		const n = Number(input.value);
		progression.setTempo(Number.isFinite(n) && n > 0 ? n : progression.current.tempo);
		input.value = String(progression.current.tempo);
	}

	let taps = $state<number[]>([]);
	let pulse = $state(false);
	let pulseTimer: ReturnType<typeof setTimeout> | undefined;

	function onTap() {
		taps = registerTap(taps, performance.now());
		const bpm = bpmFromTaps(taps);
		if (bpm !== null) progression.setTempo(bpm);

		pulse = true;
		clearTimeout(pulseTimer);
		pulseTimer = setTimeout(() => (pulse = false), 120);
	}

	function onTimeSignature(event: Event) {
		const label = (event.target as HTMLSelectElement).value;
		const match = TIME_SIGNATURES.find((t) => t.label === label);
		if (match) progression.setTimeSignature({ numerator: match.numerator, denominator: match.denominator });
	}
</script>

<!-- The transport deck: the sun (play) on the left, the sunflower (key) on the
     right, the controls you touch while playing between them. One panel whose
     grid regroups at each width rather than wrapping raggedly: a single row on
     a desktop, two on a tablet, three on a phone. -->
<div class="deck-host">
<div class="deck">
	<div class="deck__play">
		<LoopRings bind:caption={session}>
			<!-- The label says what a press will do; no aria-pressed as well, or it
			     announces "Stop, pressed". -->
			<button
				class="play"
				class:play--on={progression.isPlaying}
				type="button"
				aria-label={progression.isPlaying || progression.isLoading ? 'Stop' : 'Play'}
				onclick={() => progression.toggle()}
			>
				{#if progression.isLoading}
					<span class="play__loading" aria-hidden="true"></span>
				{:else if progression.isPlaying}
					<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"
						><rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor" /></svg
					>
				{:else}
					<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"
						><path d="M8 5l11 7-11 7z" fill="currentColor" /></svg
					>
				{/if}
			</button>
		</LoopRings>
		<!-- What you've played this session, under the rings. -->
		<p class="session" aria-live="polite">{session}</p>
	</div>

	<div class="deck__tempo">
		<label class="label" for="tempo">Tempo</label>
		<div class="stepper" role="group" aria-label="Tempo">
			<button
				class="stepper__btn"
				type="button"
				aria-label="Slower"
				onclick={() => progression.setTempo(progression.current.tempo - 1)}>−</button
			>
			<input
				id="tempo"
				class="stepper__value"
				type="text"
				inputmode="numeric"
				value={progression.current.tempo}
				oninput={onTempoInput}
				onchange={onTempoChange}
			/>
			<button
				class="stepper__btn"
				type="button"
				aria-label="Faster"
				onclick={() => progression.setTempo(progression.current.tempo + 1)}>+</button
			>
		</div>
		<div class="deck__tempo-tools">
			<button
				class="bar-btn"
				class:bar-btn--on={pulse}
				type="button"
				title="Tap repeatedly to set the tempo"
				onclick={onTap}>Tap</button
			>
			<button
				class="bar-btn"
				class:bar-btn--on={view.countIn}
				type="button"
				aria-pressed={view.countIn}
				title="Play a one-bar count-in before the loop"
				onclick={() => view.setCountIn(!view.countIn)}>Count-in</button
			>
		</div>
	</div>

	<!-- Track-wide settings. (Instrument / groove / mix live in the Band panel.) -->
	<div class="deck__settings">
		<div class="field">
			<label class="label" for="timesig">Time</label>
			<select id="timesig" class="field__select" value={currentTs} onchange={onTimeSignature}>
				{#if customTs}
					<option value={customTs}>{customTs} (custom)</option>
				{/if}
				{#each TIME_SIGNATURES as ts (ts.label)}
					<option value={ts.label}>{ts.label}</option>
				{/each}
			</select>
		</div>
		<LoopControl />
	</div>

	<div class="deck__key" role="group" aria-labelledby="key-label">
		<KeyCompass
			tonic={progression.isBlank ? '' : keyInfo.tonic}
			chords={songChords}
			{sounding}
			offset={view.offset}
		/>
		<div class="deck__key-text">
			<span class="label" id="key-label">Key</span>
			<span class="key__name" aria-live="polite">{keyName}</span>
			<div class="key__steps">
				<button
					class="step"
					type="button"
					aria-label="Transpose down a semitone"
					title="Transpose down a semitone"
					onclick={() => progression.transpose(-1)}>−</button
				>
				<button
					class="step"
					type="button"
					aria-label="Transpose up a semitone"
					title="Transpose up a semitone"
					onclick={() => progression.transpose(1)}>+</button
				>
			</div>
		</div>
	</div>
</div>
</div>

<style lang="scss">
	/* One panel of paper floating on the sky. The grid names its regions so each
	   width can arrange them deliberately. */
	/* The host is the size container (a container can't query itself). */
	.deck-host {
		container: deck / inline-size;
	}

	.deck {
		display: grid;
		grid-template-columns: auto minmax(0, auto) minmax(0, 1fr) auto;
		grid-template-areas: 'play tempo settings key';
		align-items: center;
		gap: var(--space-4) var(--space-8);
		margin-top: var(--space-4);
		padding: var(--space-4) var(--space-6);
		border: 1px solid var(--rule);
		border-radius: 18px;
		background: color-mix(in srgb, var(--paper) 88%, transparent);
		box-shadow: 0 10px 30px var(--shadow);
	}

	.deck__play {
		grid-area: play;
		position: relative;
		display: grid;
		justify-items: center;
		min-width: 120px;
	}

	.deck__tempo {
		grid-area: tempo;
		display: grid;
		gap: var(--space-2);
		justify-items: start;
	}

	.deck__tempo-tools {
		display: flex;
		gap: var(--space-2);
	}

	.deck__settings {
		grid-area: settings;
		display: flex;
		align-items: flex-end;
		gap: var(--space-6);
		flex-wrap: wrap;
	}

	.deck__key {
		grid-area: key;
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}

	.deck__key-text {
		display: grid;
		gap: 2px;
	}

	.key__steps {
		display: flex;
		gap: var(--space-2);
		margin-top: var(--space-1);
	}

	/* Tablet-ish: the controls stack between the sun and the sunflower. */
	@container deck (max-width: 860px) {
		.deck {
			grid-template-columns: auto minmax(0, 1fr) auto;
			grid-template-areas:
				'play tempo key'
				'play settings key';
			gap: var(--space-4) var(--space-6);
		}
	}

	/* Phone: sun beside tempo, then the key, then time and loop. */
	@container deck (max-width: 520px) {
		.deck {
			grid-template-columns: auto minmax(0, 1fr);
			grid-template-areas:
				'play tempo'
				'key key'
				'settings settings';
			gap: var(--space-3) var(--space-4);
			padding: var(--space-3) var(--space-4);
			border-radius: 14px;
		}

		.deck__play {
			min-width: 96px;
		}

		.deck__key {
			padding-top: var(--space-3);
			border-top: 1px solid var(--rule);
		}

		.deck__key-text {
			grid-template-columns: auto auto;
			align-items: center;
			column-gap: var(--space-4);
		}

		.deck__key-text .label {
			grid-column: 1 / -1;
		}

		.key__steps {
			margin-top: 0;
		}

		.deck__settings {
			padding-top: var(--space-3);
			border-top: 1px solid var(--rule);
			gap: var(--space-4);
		}

		.deck__key :global(.flower) {
			width: 72px;
			height: 72px;
		}
	}

	/* The play button is the sun: the one thing you press to make music. */
	.play {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 56px;
		height: 56px;
		border: 0;
		border-radius: var(--radius-pill);
		background: radial-gradient(circle at 35% 30%, var(--sun) 0%, var(--spot) 78%);
		color: var(--on-spot);
		flex: 0 0 auto;
		box-shadow: var(--lift);
		transition:
			transform var(--motion-fast) var(--motion-pop),
			box-shadow var(--motion-fast) var(--motion-ease-out);

		&:hover {
			transform: scale(1.05);
		}

		&:active {
			transform: scale(0.95);
		}

		&:focus-visible {
			outline-offset: 4px;
		}

		/* Playing: a ring of light round the sun. */
		&--on {
			box-shadow:
				var(--lift),
				0 0 0 3px var(--paper),
				0 0 0 5px var(--spot);
		}

		svg {
			display: block;
		}
	}

	.play__loading {
		width: 18px;
		height: 18px;
		border: 2px solid currentColor;
		border-top-color: transparent;
		border-radius: var(--radius-pill);
		animation: spin 700ms linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* Reduced motion freezes the spinner, so say it in a way that holds still. */
	@media (prefers-reduced-motion: reduce) {
		.play__loading {
			border-top-color: currentColor;
			border-style: dotted;
		}
	}

	.session {
		min-height: 1.2em;
		margin: 2px 0 0;
		text-align: center;
		font-size: 0.8125rem;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		color: var(--ink-2);
		white-space: nowrap;
	}

	/* − 100 + : big targets either side of a number you can also type. */
	.stepper {
		display: inline-flex;
		align-items: stretch;
		border: 1px solid var(--edge);
		border-radius: var(--radius-pill);
		background: var(--paper);
		overflow: hidden;
	}

	.stepper__btn {
		width: var(--tap);
		min-height: 40px;
		border: 0;
		background: transparent;
		font-family: inherit;
		font-size: 1.25rem;
		line-height: 1;
		color: var(--ink);

		&:hover {
			background: var(--wash);
		}
	}

	.stepper__value {
		width: 4ch;
		border: 0;
		border-inline: 1px solid var(--rule);
		background: transparent;
		font-family: inherit;
		font-size: 1.25rem;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		text-align: center;
		color: var(--ink);

		&:focus {
			outline: none;
			background: var(--wash);
		}
	}

	.stepper:has(.stepper__value:focus-visible) {
		outline: 2px solid var(--ink);
		outline-offset: 2px;
	}

	.key__name {
		font-size: 1.125rem;
		font-weight: 600;
		white-space: nowrap;
		color: var(--ink);
	}

	.step {
		width: 36px;
		height: 36px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 1px solid var(--edge);
		border-radius: var(--radius-pill);
		background: var(--paper);
		font-family: inherit;
		font-size: 1.125rem;
		line-height: 1;
		color: var(--ink);

		&:hover {
			border-color: var(--ink);
			background: var(--wash);
		}

		@media (pointer: coarse) {
			width: var(--tap);
			height: var(--tap);
		}
	}
</style>
