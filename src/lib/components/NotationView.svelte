<script lang="ts">
	import StaffSheet from './StaffSheet.svelte';

	// Open by default (consistent with the Band / Practice sections). VexFlow is
	// still fetched lazily via StaffSheet's dynamic import when this mounts.
	let open = $state(true);
	// Off = chords-only chart; on = chord tones written on the staff.
	let showNotes = $state(false);
</script>

<section class="notation" aria-label="Notation">
	<div class="notation__head">
		<button class="notation__toggle" type="button" aria-expanded={open} onclick={() => (open = !open)}>
			<span class="chev" class:chev--open={open} aria-hidden="true">▸</span>
			<span class="wordmark notation__title">Notation</span>
			<span class="label notation__hint">{showNotes ? 'Chord tones on the staff' : 'Chord chart'}</span>
		</button>

		{#if open}
			<button
				class="toggle"
				class:toggle--on={showNotes}
				type="button"
				aria-pressed={showNotes}
				onclick={() => (showNotes = !showNotes)}>Helper notes</button
			>
		{/if}
	</div>

	{#if open}
		<div class="notation__body">
			<StaffSheet {showNotes} />
		</div>
	{/if}
</section>

<style lang="scss">
	.notation {
		margin-top: var(--space-8);
		border-top: 1px solid var(--color-border);
		padding-top: var(--space-6);
	}

	.notation__head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
	}

	.notation__toggle {
		display: flex;
		align-items: baseline;
		gap: var(--space-3);
		flex: 1 1 auto;
		min-width: 0;
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

	.notation__title {
		font-size: 1.1rem;
	}
	.notation__hint {
		color: var(--color-text-faint);
		text-transform: none;
		letter-spacing: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.toggle {
		flex: 0 0 auto;
		border: 1px solid var(--color-border);
		background: transparent;
		padding: var(--space-1) var(--space-3);
		font-family: inherit;
		font-size: 0.6875rem;
		font-weight: 400;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-text-muted);
		transition:
			background-color var(--motion-fast) var(--motion-ease-out),
			border-color var(--motion-fast) var(--motion-ease-out),
			color var(--motion-fast) var(--motion-ease-out);

		&:hover {
			border-color: var(--color-black);
			color: var(--color-black);
		}
		&--on {
			background: var(--c-major);
			border-color: var(--c-major);
			color: var(--color-white);
		}
	}

	.notation__body {
		margin-top: var(--space-6);
	}
</style>
