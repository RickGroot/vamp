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
		min-width: 1.4ch;
		field-sizing: content;
		text-align: center;
	}

	/* The first number reads up to the dash, not centred away from it. */
	.loop .field__select:first-of-type {
		text-align: right;
		text-align-last: right;
	}

	.all {
		color: var(--ink-3);
	}

	.loop__dash {
		font-family: var(--font-display);
		font-stretch: var(--display-stretch);
		font-weight: 900;
		font-size: 1.75rem;
		line-height: 1;
		color: var(--ink);
	}

	.loop__clear {
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		margin-left: var(--space-2);
		border: var(--rule-heavy) solid var(--ink);
		background: transparent;
		color: var(--ink);
		font-size: 1rem;
		font-weight: 800;
		line-height: 1;
		padding: 0;

		&:hover {
			background: var(--ink);
			color: var(--ground);
		}

		@media (pointer: coarse) {
			width: var(--tap);
			height: var(--tap);
		}
	}
</style>
