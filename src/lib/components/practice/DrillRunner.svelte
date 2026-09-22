<script lang="ts">
	// The music-stand view: big notation, where you are, and the controls you
	// actually reach for mid-session. Everything else lives in the picker.
	import { practice } from '$lib/stores/practice.svelte';
	import DrillStaff from './DrillStaff.svelte';

	const run = $derived(practice.run);
	const total = $derived(run.phrases.length);
	// Before playback starts, show the first key rather than an empty slot.
	const rep = $derived(practice.rep ?? 0);
	const shown = $derived(run.phrases.find((p) => p.rep === rep) ?? run.phrases[0] ?? null);
	const next = $derived(run.phrases.find((p) => p.rep === rep + 1) ?? null);
	const repNumber = $derived(rep + 1);

	// Only the current key is on the stand. Rendering all twelve at once would be
	// a wall of notation you cannot read, and a much taller staff.
	const phraseNotes = $derived(run.notes.filter((n) => n.rep === rep));

	const statusText = $derived(
		practice.isPlaying
			? total > 1
				? `Key ${repNumber} of ${total}: ${shown?.writtenRoot ?? ''} at ${shown?.tempo ?? practice.tempo} bpm`
				: `Playing at ${shown?.tempo ?? practice.tempo} bpm`
			: practice.isLoading
				? 'Loading sounds'
				: 'Stopped'
	);
</script>

<section class="runner" aria-label="Drill runner">
	<header class="runner__head">
		<div class="runner__what">
			<h2 class="wordmark runner__title">{practice.definition.name}</h2>
			<p class="label runner__sub">
				<!-- A song-sourced drill has no meaningful "key" to show — it follows
				     the changes — so name the sketch instead. -->
				{practice.usesSong ? practice.songName : (shown?.writtenRoot ?? practice.root)} ·
				{practice.rangeLabel} · {shown?.tempo ?? practice.tempo} bpm
			</p>
		</div>

		<div class="runner__transport">
			<button
				class="play"
				class:play--on={practice.isPlaying}
				type="button"
				aria-pressed={practice.isPlaying}
				onclick={() => void practice.toggle()}
			>
				{#if practice.isLoading}Loading{:else if practice.isPlaying}Stop{:else}Start{/if}
			</button>
			<button
				class="bar-btn"
				class:bar-btn--on={practice.leadAudible}
				type="button"
				aria-pressed={practice.leadAudible}
				title="Hear the line, or play it yourself over the backing"
				onclick={() => practice.setLeadAudible(!practice.leadAudible)}
			>
				{practice.leadAudible ? 'Hearing it' : 'Playing it'}
			</button>
		</div>
	</header>

	<!-- Polite and per-key, not per-note: announcing every note would flood a
	     screen reader at drilling tempos. -->
	<p class="runner__status label" role="status" aria-live="polite">{statusText}</p>

	{#if run.notes.length === 0}
		<p class="runner__empty">
			This pattern doesn’t fit the {practice.rangeLabel.toLowerCase()} range. Try a narrower pattern, a
			different register, or a wider range.
		</p>
	{:else}
		<DrillStaff notes={phraseNotes} />
		{#if next}
			<p class="runner__next label">Next up · {next.writtenRoot} at {next.tempo} bpm</p>
		{/if}
	{/if}

	{#if run.skipped.length > 0}
		<p class="runner__skipped label">
			Skipped {run.skipped.length}
			{run.skipped.length === 1 ? 'key' : 'keys'} that didn’t fit the range: {run.skipped
				.map((s) => s.concertRoot)
				.join(', ')}
		</p>
	{/if}
</section>

<style lang="scss">
	.runner {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.runner__head {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: var(--space-4);
		flex-wrap: wrap;
	}

	.runner__title {
		font-size: 1.5rem;
		margin: 0;
	}

	.runner__sub {
		margin: var(--space-1) 0 0;
		color: var(--color-text-muted);
	}

	.runner__transport {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.play {
		border: 0;
		padding: var(--space-3) var(--space-6);
		font-family: inherit;
		font-size: 0.8125rem;
		font-weight: 400;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-white);
		background: var(--grad-flow);
		background-size: 230% 100%;
		background-position: 0% 0;
		transition: background-position var(--motion-grad) var(--motion-ease-out);

		&:focus-visible {
			outline: 2px solid var(--color-accent);
			outline-offset: 2px;
		}
	}

	.play--on {
		background-position: 100% 0;
	}

	.runner__status {
		margin: 0;
		color: var(--color-text-muted);
	}

	.runner__empty {
		padding: var(--space-4);
		border: 1px dashed var(--color-border);
		color: var(--color-text-muted);
		margin: 0;
	}

	.runner__next {
		margin: 0;
		color: var(--color-text-faint);
	}

	.runner__skipped {
		margin: 0;
		color: var(--c-diminished);
	}

	@media (prefers-reduced-motion: reduce) {
		.play {
			transition: none;
		}
	}
</style>
