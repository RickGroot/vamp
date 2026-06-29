<script lang="ts">
	import { progression, TEMPO_MIN, TEMPO_MAX } from '$lib/stores/progression.svelte';
	import { bpmFromTaps, registerTap } from '$lib/audio/tapTempo';
	import { view } from '$lib/stores/view.svelte';
	import LoopControl from './LoopControl.svelte';

	const TIME_SIGNATURES = [
		{ label: '4/4', numerator: 4, denominator: 4 },
		{ label: '3/4', numerator: 3, denominator: 4 },
		{ label: '6/8', numerator: 6, denominator: 8 },
		{ label: '2/4', numerator: 2, denominator: 4 },
		{ label: '5/4', numerator: 5, denominator: 4 }
	];

	const currentTs = $derived(
		`${progression.current.timeSignature.numerator}/${progression.current.timeSignature.denominator}`
	);

	function onTempo(event: Event) {
		progression.setTempo(Number((event.target as HTMLInputElement).value));
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

<div class="transport">
	<!-- Transport: things you touch while playing. -->
	<div class="transport__row">
		<button
			class="play"
			class:play--on={progression.isPlaying}
			type="button"
			aria-label={progression.isPlaying ? 'Stop' : 'Play'}
			aria-pressed={progression.isPlaying}
			onclick={() => progression.toggle()}
		>
			{#if progression.isLoading}
				<span class="play__loading" aria-hidden="true"></span>
			{:else if progression.isPlaying}
				<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"
					><rect x="6" y="6" width="12" height="12" fill="currentColor" /></svg
				>
			{:else}
				<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"
					><path d="M8 5l11 7-11 7z" fill="currentColor" /></svg
				>
			{/if}
		</button>

		<div class="field">
			<label class="label" for="tempo">Tempo</label>
			<div class="field__row">
				<input
					id="tempo"
					class="field__input"
					type="number"
					min={TEMPO_MIN}
					max={TEMPO_MAX}
					step="1"
					value={progression.current.tempo}
					oninput={onTempo}
				/>
				<span class="field__unit label">bpm</span>
				<button
					class="tap"
					class:tap--pulse={pulse}
					type="button"
					title="Tap repeatedly to set the tempo"
					onclick={onTap}>Tap</button
				>
				<button
					class="tap"
					class:tap--active={view.countIn}
					type="button"
					aria-pressed={view.countIn}
					title="Play a one-bar count-in before the loop"
					onclick={() => view.setCountIn(!view.countIn)}>Count-in</button
				>
			</div>
		</div>

		<LoopControl />
	</div>

	<!-- Arrange: track-wide settings. (Instrument / groove / mix live in the Band panel.) -->
	<div class="transport__row">
		<div class="field">
			<label class="label" for="timesig">Time</label>
			<select id="timesig" class="field__select" value={currentTs} onchange={onTimeSignature}>
				{#each TIME_SIGNATURES as ts (ts.label)}
					<option value={ts.label}>{ts.label}</option>
				{/each}
			</select>
		</div>

		<div class="field">
			<span class="label">Key</span>
			<div class="field__row key">
				<button
					class="step"
					type="button"
					aria-label="Transpose down a semitone"
					onclick={() => progression.transpose(-1)}>−</button
				>
				<button
					class="step"
					type="button"
					aria-label="Transpose up a semitone"
					onclick={() => progression.transpose(1)}>+</button
				>
			</div>
		</div>
	</div>
</div>

<style lang="scss">
	.transport {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		padding: var(--space-6) 0;
	}

	.transport__row {
		display: flex;
		align-items: flex-end;
		gap: var(--space-6);
		flex-wrap: wrap;
	}

	.play {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 56px;
		height: 56px;
		border: 0;
		border-radius: var(--radius-pill);
		background: var(--grad-flow);
		background-size: 230% 100%;
		background-position: 0% 0;
		color: var(--color-white);
		flex: 0 0 auto;
		transition:
			background-position var(--motion-grad) var(--motion-ease-out),
			filter var(--motion-fast) var(--motion-ease-out),
			box-shadow var(--motion-standard) var(--motion-ease-out);
		box-shadow: 0 4px 14px color-mix(in srgb, var(--c-augmented) 35%, transparent);

		&:hover {
			filter: brightness(1.08);
		}

		/* Playing → sweep to the cool end of the gradient. */
		&--on {
			background-position: 100% 0;
			box-shadow: 0 0 0 4px color-mix(in srgb, var(--c-major) 30%, transparent);
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

	.tap {
		margin-left: var(--space-2);
		border: 1px solid var(--color-black);
		background: transparent;
		padding: var(--space-1) var(--space-3);
		font-family: inherit;
		font-size: 0.6875rem;
		font-weight: 400;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-text);
		transition:
			background-color var(--motion-fast) var(--motion-ease-out),
			border-color var(--motion-fast) var(--motion-ease-out),
			color var(--motion-fast) var(--motion-ease-out);

		&:hover {
			background: var(--color-black);
			color: var(--color-white);
		}

		&--pulse,
		&--active {
			background: var(--c-major);
			border-color: var(--c-major);
			color: var(--color-white);
		}
	}

	.key {
		align-items: center;
		gap: var(--space-1);
	}

	.step {
		width: 28px;
		height: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 1px solid var(--color-border);
		background: transparent;
		font-family: inherit;
		font-size: 1.1rem;
		line-height: 1;
		color: var(--color-text);

		&:hover {
			border-color: var(--color-black);
			background: var(--color-black);
			color: var(--color-white);
		}
	}
</style>
