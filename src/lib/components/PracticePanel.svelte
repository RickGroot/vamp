<script lang="ts">
	import { view } from '$lib/stores/view.svelte';
	import DrillsControl from './DrillsControl.svelte';
	import DroneControl from './DroneControl.svelte';
	import Recorder from './Recorder.svelte';
	import MidiControl from './MidiControl.svelte';

	interface Props {
		/** Inferred key tonic, used as the drone's default root. */
		defaultRoot: string;
	}

	let { defaultRoot }: Props = $props();

	const open = $derived(view.sections.woodshed);
</script>

<!-- "Woodshed", not "Practice": the Practice workspace is a separate route,
     and two things with one name read as one. These tools shape how YOUR
     song plays back while you practise over it. -->
<section class="practice" aria-label="Woodshed">
	<h2 class="sec-head">
		<button class="sec-toggle" type="button" aria-expanded={open} onclick={() => view.setSectionOpen('woodshed', !open)}>
			<svg class="chev" class:chev--open={open} viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
			<span class="sec-title">Woodshed</span>
			<span class="sec-hint">Drills · Drone · MIDI · Record, over your song</span>
		</button>
	</h2>

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
						<h3 class="card__title">Drills</h3>
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
						<h3 class="card__title">Drone</h3>
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
						<h3 class="card__title">MIDI input</h3>
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
						<h3 class="card__title">Record</h3>
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
		margin-top: var(--space-12);
		border-top: 1px solid var(--rule);
		padding-top: var(--space-4);
	}

	/* Four tools, two to a row, separated by hairline rules — not dashboard cards. */
	.grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-6) var(--space-8);
		margin-top: var(--space-4);
	}

	.card {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		min-width: 0;
		border-top: 1px solid var(--rule);
		padding-top: var(--space-4);
	}

	.card__head {
		display: flex;
		align-items: flex-start;
		gap: var(--space-3);
	}

	.card__icon {
		flex: 0 0 auto;
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		color: var(--ink-2);
	}

	.card__meta {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.card__title {
		margin: 0;
		font-size: 1rem;
		font-weight: 600;
		line-height: 1.2;
	}

	.card__sub {
		font-size: 0.875rem;
		color: var(--ink-3);
		margin-top: 2px;
	}

	@media (max-width: 720px) {
		.grid {
			grid-template-columns: 1fr;
		}
	}
</style>
