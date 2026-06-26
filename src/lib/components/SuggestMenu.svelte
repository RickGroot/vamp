<script lang="ts">
	import { progression } from '$lib/stores/progression.svelte';
	import { view } from '$lib/stores/view.svelte';
	import { flattenSlots } from '$lib/model/slots';
	import { inferKey, diatonicChords } from '$lib/model/key';
	import { displayChord } from '$lib/audio/transpose';

	let open = $state(false);

	const keyInfo = $derived(
		inferKey(flattenSlots(progression.current.bars).map((f) => f.slot.chord))
	);
	const chords = $derived(diatonicChords(keyInfo));

	function onFocusOut(event: FocusEvent) {
		const next = event.relatedTarget as Node | null;
		if (!(event.currentTarget as HTMLElement).contains(next)) open = false;
	}
</script>

<div class="host" onfocusout={onFocusOut}>
	<button class="bar-btn" type="button" aria-expanded={open} onclick={() => (open = !open)}>
		Suggest
	</button>

	{#if open}
		<div class="vmenu left" role="menu">
			<p class="label hint">In {keyInfo.tonic} {keyInfo.mode}</p>
			{#each chords as c (c.roman)}
				<button class="vmenu__row chord" type="button" onclick={() => progression.appendChordBar(c.symbol)}>
					<span class="rn">{c.roman}</span>
					<span>{displayChord(c.symbol, view.offset)}</span>
				</button>
			{/each}
		</div>
	{/if}
</div>

<style lang="scss">
	.host {
		position: relative;
		display: inline-block;
	}

	.left {
		right: auto;
		left: 0;
		min-width: 180px;
	}

	.hint {
		padding: var(--space-2) var(--space-3) var(--space-1);
		color: var(--color-text-faint);
	}

	.chord {
		display: flex;
		align-items: baseline;
		gap: var(--space-3);
	}

	.rn {
		min-width: 3ch;
		color: var(--color-text-faint);
		font-size: 0.85rem;
	}
</style>
