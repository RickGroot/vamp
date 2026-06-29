<script lang="ts">
	import DrillsControl from './DrillsControl.svelte';
	import DroneControl from './DroneControl.svelte';
	import Recorder from './Recorder.svelte';
	import MidiControl from './MidiControl.svelte';

	interface Props {
		/** Inferred key tonic, used as the drone's default root. */
		defaultRoot: string;
	}

	let { defaultRoot }: Props = $props();

	let open = $state(true);
</script>

<section class="practice" aria-label="Practice tools">
	<button class="practice__toggle" type="button" aria-expanded={open} onclick={() => (open = !open)}>
		<span class="chev" class:chev--open={open} aria-hidden="true">▸</span>
		<span class="wordmark practice__title">Practice</span>
		<span class="label practice__hint">Drills · Drone · Record · MIDI</span>
	</button>

	{#if open}
		<div class="practice__grid">
			<div class="card">
				<span class="label card__title">Drills</span>
				<span class="card__sub">Push your time, speed and key fluency while the loop runs.</span>
				<DrillsControl />
			</div>
			<div class="card">
				<span class="label card__title">Drone</span>
				<span class="card__sub">A held root to solo over — practise scales/modes against it.</span>
				<DroneControl {defaultRoot} />
			</div>
			<div class="card">
				<span class="label card__title">MIDI input</span>
				<span class="card__sub">Play chords in from a hardware keyboard.</span>
				<MidiControl />
			</div>
			<div class="card">
				<span class="label card__title">Record</span>
				<Recorder />
			</div>
		</div>
	{/if}
</section>

<style lang="scss">
	.practice {
		margin-top: var(--space-8);
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

	.chev {
		font-size: 0.8rem;
		color: var(--color-text-faint);
		transition: transform var(--motion-fast) var(--motion-ease-out);
	}
	.chev--open {
		transform: rotate(90deg);
	}

	.practice__title {
		font-size: 1.1rem;
	}
	.practice__hint {
		color: var(--color-text-faint);
		text-transform: none;
		letter-spacing: 0;
	}

	.practice__grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-6);
		margin-top: var(--space-6);
		align-items: start;
	}

	.card {
		border: var(--border-hairline);
		background: var(--color-white);
		padding: var(--space-4);
	}

	.card__title {
		display: block;
		margin-bottom: var(--space-1);
	}

	.card__sub {
		display: block;
		font-size: 0.78rem;
		color: var(--color-text-faint);
		margin-bottom: var(--space-3);
	}

	@media (max-width: 720px) {
		.practice__grid {
			grid-template-columns: 1fr;
		}
	}
</style>
