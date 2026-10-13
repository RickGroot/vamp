<script lang="ts">
	import { progression, TEMPO_MIN, TEMPO_MAX } from '$lib/stores/progression.svelte';
	import { bpmFromTaps, registerTap } from '$lib/audio/tapTempo';
	import { view } from '$lib/stores/view.svelte';
	import { flattenSlots } from '$lib/model/slots';
	import { inferKey } from '$lib/model/key';
	import { displayChord } from '$lib/audio/transpose';
	import { resolveLoopRange } from '$lib/model/time';
	import LoopControl from './LoopControl.svelte';
	import LoopRings from './LoopRings.svelte';
	import KeyCompass from './KeyCompass.svelte';
	import ChordSymbol from './ChordSymbol.svelte';
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
	// The key's root goes through ChordSymbol: an uppercased "Bb" reads "BB".
	const keyRoot = $derived(progression.isBlank ? '' : displayChord(keyInfo.tonic, view.offset));

	// What the field says. Playing: the chord sounding now, big enough to read
	// from the stand, and where you are. Stopped: the chord the band will start on.
	const flat = $derived(flattenSlots(progression.current.bars));
	const loopStart = $derived(resolveLoopRange(progression.current).start);
	const nowSlot = $derived.by(() => {
		const i = progression.activeSlot;
		if (i === null || !progression.isPlaying || engine.source !== 'progression') return null;
		return flat[i] ?? null;
	});
	const startChord = $derived(
		flat.find((f) => f.barIndex >= loopStart && f.slot.chord.trim() !== '')?.slot.chord ?? ''
	);
	const fieldChord = $derived(
		nowSlot ? nowSlot.slot.chord.trim() : progression.isPlaying || progression.isLoading ? '' : startChord
	);
	const fieldLabel = $derived(
		progression.isLoading
			? 'Starting the band'
			: nowSlot
				? 'Now'
				: progression.isBlank
					? 'Ready'
					: `From bar ${loopStart + 1}`
	);
	const position = $derived(nowSlot ? `Bar ${nowSlot.barIndex + 1} of ${progression.current.bars.length}` : '');

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

<!-- The deck: one printed band between two heavy rules. The field on the left
     is the page's one block of colour — the chord sounding now (at rest, your
     tune's colour) — with the play disc cut into it; tempo, time and loop, and
     the key's record follow, each in its own panel. The grid regroups at each
     width rather than wrapping raggedly. -->
<div class="deck-host">
	<div class="deck">
		<div class="deck__field">
			<LoopRings bind:caption={session} disc={60}>
				<!-- The label says what a press will do; no aria-pressed as well, or it
				     announces "Stop, pressed". -->
				<button
					class="play"
					type="button"
					aria-label={progression.isPlaying || progression.isLoading ? 'Stop' : 'Play'}
					onclick={() => progression.toggle()}
				>
					{#if progression.isLoading}
						<span class="play__loading" aria-hidden="true"></span>
					{:else if progression.isPlaying}
						<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"
							><rect x="6" y="6" width="12" height="12" fill="currentColor" /></svg
						>
					{:else}
						<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"
							><path d="M8 5l11 7-11 7z" fill="currentColor" /></svg
						>
					{/if}
				</button>
			</LoopRings>
			<div class="now">
				<span class="label now__label">{fieldLabel}</span>
				<span class="now__chord">
					{#if fieldChord}<ChordSymbol symbol={displayChord(fieldChord, view.offset)} />{:else}—{/if}
				</span>
				<span class="now__sub"
					>{position}{#if position && session}&nbsp;·&nbsp;{/if}<span aria-live="polite">{session}</span
					>{#if !position && !session && !progression.isBlank}<span class="now__keys">Space to play</span
						>{/if}</span
				>
			</div>
		</div>

		<div class="deck__tempo">
			<label class="label" for="tempo">Tempo</label>
			<div class="tempo">
				<input
					id="tempo"
					class="tempo__value"
					type="text"
					inputmode="numeric"
					value={progression.current.tempo}
					oninput={onTempoInput}
					onchange={onTempoChange}
				/>
				<span class="tempo__unit" aria-hidden="true">BPM</span>
			</div>
			<div class="deck__tempo-tools">
				<div class="steps" role="group" aria-label="Tempo">
					<button
						class="bar-btn step"
						type="button"
						aria-label="Slower"
						onclick={() => progression.setTempo(progression.current.tempo - 1)}>−</button
					>
					<button
						class="bar-btn step"
						type="button"
						aria-label="Faster"
						onclick={() => progression.setTempo(progression.current.tempo + 1)}>+</button
					>
				</div>
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
				mode={keyInfo.mode}
				size={96}
			/>
			<div class="deck__key-text">
				<span class="label" id="key-label">Key</span>
				<span class="key__name" aria-live="polite"
					>{#if keyRoot}<ChordSymbol symbol={keyRoot} />&nbsp;{keyInfo.mode}{:else}—{/if}</span
				>
				<div class="steps">
					<button
						class="bar-btn step"
						type="button"
						aria-label="Transpose down a semitone"
						title="Transpose down a semitone"
						onclick={() => progression.transpose(-1)}>−</button
					>
					<button
						class="bar-btn step"
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
	/* The host is the size container (a container can't query itself). */
	.deck-host {
		container: deck / inline-size;
		margin-top: var(--space-6);
	}

	/* The rules between panels are the grid's gaps showing the ink behind, so
	   they stay exact whichever way the panels regroup. */
	.deck {
		display: grid;
		grid-template-columns: minmax(300px, 1.35fr) auto auto minmax(0, 1fr);
		grid-template-areas: 'field tempo settings key';
		gap: var(--rule-heavy);
		background: var(--ink);
		border-block: var(--rule-heavy) solid var(--ink);

		> * {
			background: var(--ground);
			min-width: 0;
		}
	}

	/* ---- The field ---- */
	.deck__field {
		grid-area: field;
		display: flex;
		align-items: center;
		gap: 0 var(--space-2);
		padding: var(--space-4) var(--space-6) var(--space-4) var(--space-2);
		background: var(--field);
		color: var(--on-field);
	}

	.now {
		display: grid;
		gap: var(--space-1);
		min-width: 0;
	}

	.now__label {
		color: var(--on-field);
	}

	.now__chord {
		--cs-stretch: 62%;
		--cs-weight: 900;
		font-family: var(--font-display);
		font-stretch: var(--display-stretch);
		font-weight: 900;
		font-size: 5.25rem;
		line-height: 0.95;
		min-height: 0.95em;
		overflow: hidden;
	}

	.now__sub {
		min-height: 1.2em;
		font-size: 0.75rem;
		font-weight: 800;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	/* The play disc: cut out of the field in its ink. */
	.play {
		display: grid;
		place-items: center;
		width: 60px;
		height: 60px;
		border: 0;
		border-radius: 50%;
		background: var(--on-field);
		color: var(--field);
		flex: 0 0 auto;
		transition: transform var(--motion-fast) var(--motion-ease-out);

		&:hover {
			transform: scale(1.06);
		}

		&:active {
			transform: scale(0.96);
		}

		&:focus-visible {
			outline-color: var(--on-field);
			outline-offset: 4px;
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
		border-radius: 50%;
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

	/* ---- Tempo: the number is the control ---- */
	.deck__tempo {
		grid-area: tempo;
		display: grid;
		align-content: start;
		gap: var(--space-2);
		padding: var(--space-4) var(--space-6);
	}

	.tempo {
		display: flex;
		align-items: flex-end;
		gap: var(--space-1);
	}

	.tempo__value {
		width: 3.1ch;
		padding: 0;
		border: 0;
		border-bottom: var(--rule-heavy) solid transparent;
		background: transparent;
		font-family: var(--font-display);
		font-stretch: var(--display-stretch);
		font-weight: 900;
		font-size: 5.25rem;
		line-height: 0.88;
		font-variant-numeric: tabular-nums;
		color: var(--ink);

		&:hover {
			border-bottom-color: var(--rule);
		}

		&:focus {
			outline: none;
			border-bottom-color: var(--ink);
		}
	}

	.tempo__unit {
		padding-bottom: 0.4rem;
		font-size: 0.875rem;
		font-weight: 900;
		letter-spacing: 0.06em;
	}

	.deck__tempo-tools {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.steps {
		display: flex;
	}

	.step {
		width: 38px;
		padding: 0;
		font-size: 1.125rem;

		& + & {
			border-left: 0;
		}

		@media (pointer: coarse) {
			width: var(--tap);
		}
	}

	/* ---- Time and loop: printed values you can change ---- */
	.deck__settings {
		grid-area: settings;
		display: grid;
		grid-template-rows: 1fr 1fr;
		gap: var(--rule-heavy);
		padding: 0;
		background: var(--ink);

		> :global(*) {
			padding: var(--space-3) var(--space-6);
			background: var(--ground);
		}
	}

	/* A resting hairline under each value says it can be changed. */
	.deck__settings :global(.field__select) {
		min-width: 0;
		padding: 0 2px;
		border-bottom-color: var(--rule);
		appearance: none;
		font-family: var(--font-display);
		font-stretch: var(--display-stretch);
		font-weight: 900;
		font-size: 2.5rem;
		line-height: 1;
		cursor: pointer;

		&:hover {
			background: transparent;
			border-bottom-color: var(--ink-3);
		}

		&:focus-visible {
			border-bottom-color: var(--ink);
		}
	}

	/* ---- The key ---- */
	.deck__key {
		grid-area: key;
		display: flex;
		align-items: center;
		gap: var(--space-4);
		padding: var(--space-4) var(--space-6);
	}

	.deck__key-text {
		display: grid;
		gap: var(--space-1);
		min-width: 0;
	}

	.key__name {
		--cs-stretch: 62%;
		--cs-weight: 900;
		display: flex;
		align-items: flex-start;
		font-family: var(--font-display);
		font-stretch: var(--display-stretch);
		font-weight: 900;
		font-size: 2rem;
		line-height: 0.95;
		text-transform: uppercase;
		white-space: nowrap;
		color: var(--ink);
		margin-bottom: var(--space-2);
	}

	/* No space bar on a phone. */
	@media (pointer: coarse) {
		.now__keys {
			display: none;
		}
	}

	/* Tablet-ish: the field across the top, the controls beneath. */
	@container deck (max-width: 900px) {
		.deck {
			grid-template-columns: auto auto minmax(0, 1fr);
			grid-template-areas:
				'field field field'
				'tempo settings key';
		}
	}

	/* Phone: four compact full-width bands — the field; tempo with its tools
	   beside the number; time | loop; the key. */
	@container deck (max-width: 560px) {
		.deck {
			grid-template-columns: minmax(0, 1fr);
			grid-template-areas:
				'field'
				'tempo'
				'settings'
				'key';
		}

		.deck__field {
			padding: var(--space-3) var(--space-4) var(--space-3) 0;
		}

		.now__chord {
			font-size: 4rem;
		}

		.deck__tempo {
			grid-template-columns: auto minmax(0, 1fr);
			align-items: center;
			column-gap: var(--space-4);
			padding: var(--space-3) var(--space-4);
		}

		.deck__tempo .label {
			grid-column: 1 / -1;
		}

		.tempo__value {
			font-size: 3.5rem;
		}

		/* A tidy 2×2 block, not a ragged wrap: −/+ beside Tap, Count-in beneath. */
		.deck__tempo-tools {
			display: grid;
			grid-template-columns: auto auto;
			justify-content: end;
		}

		.deck__tempo-tools > :last-child {
			grid-column: 1 / -1;
		}

		.deck__settings {
			grid-template-rows: none;
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		}

		.deck__settings > :global(*) {
			padding: var(--space-3) var(--space-4);
		}

		.deck__settings :global(.field__select) {
			font-size: 1.875rem;
		}

		.deck__key {
			gap: var(--space-3);
			padding: var(--space-2) var(--space-4);
		}

		.deck__key :global(.record) {
			width: 56px;
			height: 56px;
		}

		.deck__key-text {
			grid-template-columns: minmax(0, 1fr) auto;
			align-items: center;
			flex: 1 1 auto;
		}

		.deck__key-text .label {
			grid-column: 1 / -1;
		}

		.key__name {
			font-size: 1.75rem;
			margin-bottom: 0;
		}
	}
</style>

