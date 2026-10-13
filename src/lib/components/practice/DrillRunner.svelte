<script lang="ts">
	// The music-stand view: big notation, where you are, and the controls you
	// actually reach for mid-session. Everything else lives in the picker.
	import { practice } from '$lib/stores/practice.svelte';
	import DrillStaff from './DrillStaff.svelte';
	import KeyCompass from '../KeyCompass.svelte';

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
	// The sunflower walks the circle of fifths with the run: this key's notes
	// lit, its tonic at the top. All in WRITTEN pitch, like the staff.
	const phrasePcs = $derived([
		...new Set(
			phraseNotes.flatMap((n) => (n.midi === null ? [] : [((n.midi % 12) + 12) % 12]))
		)
	]);

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
		<KeyCompass tonic={shown?.writtenRoot ?? ''} notes={phrasePcs} size={80} />
		<div class="runner__what">
			<h2 class="runner__title">{practice.definition.name}</h2>
			<p class="hint runner__sub">
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
			<!-- Two printed segments: hear the line played, or play it yourself over
			     the backing. Each names what you get, so neither reads as an action. -->
			<div class="lead" role="group" aria-label="The line" title="Hear the line, or play it yourself over the backing">
				<button
					class="lead__opt"
					type="button"
					aria-pressed={practice.leadAudible}
					onclick={() => practice.setLeadAudible(true)}>Hear it</button
				>
				<button
					class="lead__opt"
					type="button"
					aria-pressed={!practice.leadAudible}
					onclick={() => practice.setLeadAudible(false)}>Play it</button
				>
			</div>
		</div>
	</header>

	<!-- Polite and per-key, not per-note: announcing every note would flood a
	     screen reader at drilling tempos. -->
	<p class="runner__status hint" role="status" aria-live="polite">{statusText}</p>

	{#if run.notes.length === 0}
		<p class="runner__empty">
			This pattern doesn’t fit the {practice.rangeLabel.toLowerCase()} range. Try a narrower pattern, a
			different register, or a wider range.
		</p>
	{:else}
		<DrillStaff notes={phraseNotes} />
		{#if next}
			<p class="runner__next hint">Next up · {next.writtenRoot} at {next.tempo} bpm</p>
		{/if}
	{/if}

	{#if run.skipped.length > 0}
		<p class="runner__skipped hint">
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

	/* The record beside the title, the transport on the right. Practice's one
	   block of colour is Start: the key's colour (the record's label), like the
	   field on Sketch. */
	.runner__head {
		--field: var(--c-major);
		--on-field: var(--on-pigment);
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: center;
		gap: var(--space-3) var(--space-4);
	}

	@media (max-width: 640px) {
		.runner__head {
			grid-template-columns: auto minmax(0, 1fr);
		}

		.runner__transport {
			grid-column: 1 / -1;
		}
	}

	.lead {
		display: inline-flex;
		border: var(--rule-heavy) solid var(--ink);
	}

	.lead__opt {
		min-height: 40px;
		padding: 0 var(--space-3);
		border: 0;
		background: transparent;
		font-family: inherit;
		font-size: 0.75rem;
		font-weight: 800;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--ink-2);

		&:hover {
			background: var(--wash);
			color: var(--ink);
		}

		&[aria-pressed='true'] {
			background: var(--ink);
			color: var(--ground);
		}

		@media (pointer: coarse) {
			min-height: var(--tap);
		}
	}

	/* The drill's name, set like the tune title on Sketch. */
	.runner__title {
		font-family: var(--font-display);
		font-stretch: var(--display-stretch);
		font-weight: 900;
		font-size: 2.75rem;
		line-height: 0.95;
		text-transform: uppercase;
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

	/* Start lives in the field, like Sketch's play disc: a block of the field's
	   colour with its word on it. */
	.play {
		min-height: var(--tap);
		min-width: 120px;
		border: var(--rule-heavy) solid var(--field);
		border-radius: 0;
		padding: 0 var(--space-6);
		font-family: inherit;
		font-size: 0.8125rem;
		font-weight: 800;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--on-field);
		background: var(--field);
		transition: transform var(--motion-fast) var(--motion-ease-out);

		&:active {
			transform: scale(0.97);
		}

		&:focus-visible {
			outline-offset: 3px;
		}
	}

	/* Running: the field turns over to the board, ink border kept. */
	.play--on {
		background: var(--ground);
		color: var(--ink);
		border-color: var(--ink);
	}

	.runner__status {
		margin: 0;
		color: var(--color-text-muted);
	}

	.runner__empty {
		padding: var(--space-4);
		border: var(--rule-heavy) dashed var(--ink-4);
		color: var(--color-text-muted);
		margin: 0;
	}

	.runner__next {
		margin: 0;
		color: var(--color-text-faint);
	}

	.runner__skipped {
		margin: 0;
		color: var(--danger);
	}

	@media (prefers-reduced-motion: reduce) {
		.play {
			transition: none;
		}
	}
</style>
