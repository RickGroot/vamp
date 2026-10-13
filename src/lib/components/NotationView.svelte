<script lang="ts">
	import { view } from '$lib/stores/view.svelte';
	import StaffSheet from './StaffSheet.svelte';
	import NotationExportMenu from './NotationExportMenu.svelte';

	// Open by default (consistent with the Band / Practice sections). VexFlow is
	// still fetched lazily via StaffSheet's dynamic import when this mounts.
	const open = $derived(view.sections.notation);
	// Off = chords-only chart; on = chord tones written on the staff.
	let showNotes = $state(false);
</script>

<section class="notation" aria-label="Notation">
	<div class="notation__head">
		<h2 class="sec-head">
			<button class="sec-toggle" type="button" aria-expanded={open} onclick={() => view.setSectionOpen('notation', !open)}>
				<svg class="chev" class:chev--open={open} viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
				<span class="sec-title">Notation</span>
				<span class="sec-hint">{showNotes ? 'Chord tones on the staff' : 'Chord chart'}</span>
			</button>
		</h2>

		{#if open}
			<div class="notation__actions">
				<button
					class="bar-btn"
					class:bar-btn--on={showNotes}
					type="button"
					aria-pressed={showNotes}
					onclick={() => (showNotes = !showNotes)}>Helper notes</button
				>
				<NotationExportMenu {showNotes} />
			</div>
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
		border-top: var(--rule-heavy) solid var(--ink);
		padding-top: var(--space-4);
	}

	.notation__head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: var(--space-2) var(--space-4);
	}

	.notation__actions {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex: 0 0 auto;
	}

	.notation__body {
		margin-top: var(--space-4);
	}
</style>
