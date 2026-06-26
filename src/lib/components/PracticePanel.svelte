<script lang="ts">
	import MixerControl from './MixerControl.svelte';
	import DroneControl from './DroneControl.svelte';
	import Recorder from './Recorder.svelte';

	interface Props {
		/** Inferred key tonic, used as the drone's default root. */
		defaultRoot: string;
	}

	let { defaultRoot }: Props = $props();

	let open = $state(true);
</script>

<section class="practice" aria-label="Practice tools">
	<button class="practice__toggle" type="button" aria-expanded={open} onclick={() => (open = !open)}>
		<span class="practice__chevron" class:practice__chevron--open={open} aria-hidden="true">▸</span>
		<span class="wordmark practice__title">Practice</span>
		<span class="label practice__hint">Mixer · Trade solos · Drone · Record</span>
	</button>

	{#if open}
		<div class="practice__grid">
			<div class="card card--wide">
				<MixerControl />
			</div>
			<div class="card">
				<span class="label card__title">Drone</span>
				<DroneControl {defaultRoot} />
			</div>
			<div class="card card--wide">
				<Recorder />
			</div>
		</div>
	{/if}
</section>

<style lang="scss">
	.practice {
		margin-top: var(--space-12);
		border-top: 1px solid var(--color-border);
		padding-top: var(--space-6);
	}

	.practice__toggle {
		display: flex;
		align-items: baseline;
		gap: var(--space-3);
		width: 100%;
		border: 0;
		background: transparent;
		padding: 0;
		text-align: left;
		color: var(--color-text);
	}

	.practice__chevron {
		font-size: 0.8rem;
		color: var(--color-text-faint);
		transition: transform var(--motion-fast) var(--motion-ease-out);
	}

	.practice__chevron--open {
		transform: rotate(90deg);
	}

	.practice__title {
		font-size: 1.1rem;
	}

	.practice__hint {
		color: var(--color-text-faint);
	}

	.practice__grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-6);
		margin-top: var(--space-6);
	}

	.card {
		border: var(--border-hairline);
		background: var(--color-white);
		padding: var(--space-4);
	}

	.card--wide {
		grid-column: 1 / -1;
	}

	.card__title {
		display: block;
		margin-bottom: var(--space-3);
	}

	@media (max-width: 720px) {
		.practice__grid {
			grid-template-columns: 1fr;
		}
	}
</style>
