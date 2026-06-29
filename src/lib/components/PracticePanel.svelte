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
		<span class="sec-icon" class:sec-icon--open={open} aria-hidden="true">
			<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2">
				<circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3.5" />
			</svg>
		</span>
		<span class="wordmark practice__title">Practice</span>
		<span class="label practice__hint">Drills · Drone · MIDI · Record</span>
	</button>

	{#if open}
		<div class="grid">
			<div class="card card--drills">
				<header class="card__head">
					<span class="card__icon" aria-hidden="true">
						<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<circle cx="12" cy="14" r="7" /><path d="M12 14V10M9 3h6" />
						</svg>
					</span>
					<div class="card__meta">
						<span class="card__title">Drills</span>
						<span class="card__sub">Push your time, speed &amp; key fluency.</span>
					</div>
				</header>
				<DrillsControl />
			</div>

			<div class="card card--drone">
				<header class="card__head">
					<span class="card__icon" aria-hidden="true">
						<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M2 12c2-7 4-7 6 0s4 7 6 0 4-7 6 0" />
						</svg>
					</span>
					<div class="card__meta">
						<span class="card__title">Drone</span>
						<span class="card__sub">A held root to solo scales/modes over.</span>
					</div>
				</header>
				<DroneControl {defaultRoot} />
			</div>

			<div class="card card--midi">
				<header class="card__head">
					<span class="card__icon" aria-hidden="true">
						<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round">
							<rect x="3" y="5" width="18" height="14" rx="2" /><path d="M9 5v9M15 5v9" stroke-linecap="round" />
							<path d="M6.5 5v4M11.5 5v4M17.5 5v4" stroke-width="2.4" stroke-linecap="round" />
						</svg>
					</span>
					<div class="card__meta">
						<span class="card__title">MIDI input</span>
						<span class="card__sub">Play chords in from a keyboard.</span>
					</div>
				</header>
				<MidiControl />
			</div>

			<div class="card card--record">
				<header class="card__head">
					<span class="card__icon" aria-hidden="true">
						<svg viewBox="0 0 24 24" width="17" height="17"><circle cx="12" cy="12" r="6" fill="currentColor" /></svg>
					</span>
					<div class="card__meta">
						<span class="card__title">Record</span>
						<span class="card__sub">Capture your solo, then listen back.</span>
					</div>
				</header>
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

	.grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-4);
		margin-top: var(--space-6);
		/* equal-height cards per row */
	}

	.card {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		border: 1px solid var(--color-border);
		border-top: 3px solid var(--c-other);
		background: var(--color-white);
		padding: var(--space-4);
	}

	.card__head {
		display: flex;
		align-items: flex-start;
		gap: var(--space-3);
	}

	.card__icon {
		flex: 0 0 auto;
		width: 32px;
		height: 32px;
		border-radius: 9px;
		display: grid;
		place-items: center;
		background: var(--c-other);
		color: var(--color-white);
	}

	.card__meta {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.card__title {
		font-size: 1rem;
		font-weight: 400;
		line-height: 1.1;
	}

	.card__sub {
		font-size: 0.78rem;
		color: var(--color-text-faint);
		margin-top: 2px;
	}

	/* Per-tool accent colours (top border + icon chip). */
	.card--drills {
		border-top-color: var(--c-dominant);
	}
	.card--drills .card__icon {
		background: var(--c-dominant);
	}
	.card--drone {
		border-top-color: var(--c-suspended);
	}
	.card--drone .card__icon {
		background: var(--c-suspended);
	}
	.card--midi {
		border-top-color: var(--c-minor);
	}
	.card--midi .card__icon {
		background: var(--c-minor);
	}
	.card--record {
		border-top-color: var(--c-diminished);
	}
	.card--record .card__icon {
		background: var(--c-diminished);
	}

	@media (max-width: 720px) {
		.grid {
			grid-template-columns: 1fr;
		}
	}
</style>
