<script lang="ts">
	import { progression } from '$lib/stores/progression.svelte';
	import { resolveLoopRange } from '$lib/model/time';

	const barCount = $derived(progression.current.bars.length);
	const range = $derived(resolveLoopRange(progression.current));
	const from = $derived(range.start + 1);
	const to = $derived(range.end + 1);
	const isSubrange = $derived(progression.current.loopRange !== null);
	const bars = $derived(Array.from({ length: barCount }, (_, i) => i + 1));

	function onFrom(event: Event) {
		progression.setLoopRange(Number((event.target as HTMLSelectElement).value) - 1, to - 1);
	}
	function onTo(event: Event) {
		progression.setLoopRange(from - 1, Number((event.target as HTMLSelectElement).value) - 1);
	}
</script>

<div class="field">
	<label class="label" for="loop-from">Loop {#if !isSubrange}<span class="all">· all</span>{/if}</label>
	<div class="field__row loop">
		<select
			id="loop-from"
			class="field__select"
			value={from}
			onchange={onFrom}
			aria-label="Loop from bar"
		>
			{#each bars as b (b)}
				<option value={b} disabled={b > to}>{b}</option>
			{/each}
		</select>
		<span class="loop__dash">–</span>
		<select class="field__select" value={to} onchange={onTo} aria-label="Loop to bar">
			{#each bars as b (b)}
				<option value={b} disabled={b < from}>{b}</option>
			{/each}
		</select>
		{#if isSubrange}
			<button class="loop__clear" type="button" title="Loop whole progression" onclick={() => progression.clearLoopRange()}>×</button>
		{/if}
	</div>
</div>

<style lang="scss">
	.loop {
		align-items: center;
		gap: var(--space-1);
	}

	.loop .field__select {
		min-width: 3.5ch;
		text-align: center;
	}

	.all {
		color: var(--color-text-faint);
	}

	.loop__dash {
		color: var(--color-text-faint);
	}

	.loop__clear {
		margin-left: var(--space-1);
		border: 0;
		background: transparent;
		color: var(--color-grey-400);
		font-size: 1.1rem;
		line-height: 1;
		padding: 0 var(--space-1);

		&:hover {
			color: var(--color-black);
		}
	}
</style>
