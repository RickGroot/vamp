<script lang="ts">
	import StaffSheet from './StaffSheet.svelte';

	// Collapsed by default; VexFlow is only fetched (via StaffSheet's dynamic import)
	// once the user opens it.
	let open = $state(false);
	// Off = chords-only chart; on = chord tones written on the staff.
	let showNotes = $state(false);
</script>

<section class="notation" aria-label="Notation">
	<header class="notation__head">
		<button class="link" type="button" aria-expanded={open} onclick={() => (open = !open)}>
			{open ? 'Hide' : 'Show'} notation
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
	</header>

	{#if open}
		<div class="notation__body">
			<StaffSheet {showNotes} />
		</div>
	{/if}
</section>

<style lang="scss">
	.notation {
		margin-top: var(--space-12);
		border-top: 1px solid var(--color-border);
		padding-top: var(--space-6);
	}

	.notation__head {
		display: flex;
		align-items: center;
		gap: var(--space-6);
	}

	.link {
		border: 0;
		background: transparent;
		padding: var(--space-1) 0;
		font-family: inherit;
		font-size: 0.6875rem;
		font-weight: 400;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-text-muted);

		&:hover {
			color: var(--color-black);
		}
	}

	.toggle {
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
