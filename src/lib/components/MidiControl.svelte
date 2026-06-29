<script lang="ts">
	import { midi } from '$lib/stores/midi.svelte';
</script>

<div class="midi">
	{#if !midi.supported}
		<p class="note">Web MIDI needs a Chromium browser (Chrome / Edge).</p>
	{:else if midi.status === 'on'}
		<button class="btn btn--on" type="button" onclick={() => midi.disable()}>
			<span class="dot" aria-hidden="true"></span>
			Listening{midi.device ? ` · ${midi.device}` : ''} — stop
		</button>
		<p class="note">
			Play chords on your keyboard to add them.
			{#if midi.lastChord}<br />Last detected: <strong>{midi.lastChord}</strong>{/if}
		</p>
	{:else}
		<button
			class="btn"
			type="button"
			disabled={midi.status === 'requesting'}
			onclick={() => midi.enable()}
		>
			{midi.status === 'requesting' ? 'Allow MIDI…' : 'Connect a MIDI keyboard'}
		</button>
		{#if midi.error}<p class="err" role="alert">{midi.error}</p>{/if}
		<p class="note">Plug in a controller and play chords — each one fills the next empty bar.</p>
	{/if}
</div>

<style lang="scss">
	.midi {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.btn {
		align-self: flex-start;
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		border: 1px solid var(--color-black);
		background: transparent;
		padding: var(--space-2) var(--space-4);
		font-family: inherit;
		font-size: 0.6875rem;
		font-weight: 400;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-text);

		&:hover:not(:disabled) {
			background: var(--color-black);
			color: var(--color-white);
		}
		&:disabled {
			color: var(--color-grey-400);
			border-color: var(--color-grey-400);
			cursor: not-allowed;
		}
		&--on {
			border-color: var(--c-major);
			color: var(--c-major);

			&:hover {
				background: var(--c-major);
				color: var(--color-white);
			}
		}
	}

	.dot {
		width: 9px;
		height: 9px;
		border-radius: var(--radius-pill);
		background: var(--c-major);
		animation: pulse 1.2s ease-in-out infinite;
	}

	@keyframes pulse {
		50% {
			opacity: 0.3;
		}
	}

	.note {
		margin: 0;
		font-size: 0.75rem;
		line-height: 1.4;
		color: var(--color-text-faint);
	}

	.err {
		margin: 0;
		font-size: 0.8rem;
		color: var(--c-diminished);
	}
</style>
