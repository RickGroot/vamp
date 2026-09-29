<script lang="ts">
	import { progression } from '$lib/stores/progression.svelte';
	import { EXAMPLES, type Example } from '$lib/model/examples';
	import { dismissable } from '$lib/actions/dismissable';

	let open = $state(false);
	let query = $state('');

	const filtered = $derived(
		query.trim() === ''
			? EXAMPLES
			: EXAMPLES.filter((e) => e.title.toLowerCase().includes(query.trim().toLowerCase()))
	);

	function load(example: Example) {
		progression.loadExample(example);
		open = false;
		query = '';
	}

	function onFocusOut(event: FocusEvent) {
		const next = event.relatedTarget as Node | null;
		if (!(event.currentTarget as HTMLElement).contains(next)) open = false;
	}
</script>

<div class="examples" onfocusout={onFocusOut} use:dismissable={{ open, close: () => (open = false) }}>
	<button class="bar-btn" type="button" aria-expanded={open} onclick={() => (open = !open)}>
		Examples
	</button>

	{#if open}
		<!-- Disclosure popover, not an ARIA menu (contains a search input + list). -->
		<div class="menu">
			<input
				class="menu__search"
				type="text"
				placeholder="Search songs…"
				autocomplete="off"
				bind:value={query}
			/>
			<ul class="menu__list">
				{#each filtered as example (example.id)}
					<li>
						<button class="item" type="button" onclick={() => load(example)}>
							<span class="item__title">{example.title}</span>
							<span class="item__origin hint">{example.origin}</span>
						</button>
					</li>
				{:else}
					<li class="menu__empty hint">No songs match “{query}”.</li>
				{/each}
			</ul>
			<p class="menu__note hint">Public-domain · simplified</p>
		</div>
	{/if}
</div>

<style lang="scss">
	.examples {
		position: relative;
		display: inline-block;
	}

	

	.menu {
		position: absolute;
		top: 100%;
		left: 0;
		margin-top: var(--space-1);
		min-width: 260px;
		background: var(--color-white);
		border: 1px solid var(--ink);
		border-radius: var(--radius);
		box-shadow: 0 10px 28px var(--shadow);
		z-index: 50;
	}

	.menu__search {
		display: block;
		width: 100%;
		border: 0;
		border-bottom: 1px solid var(--color-border);
		background: transparent;
		padding: var(--space-3);
		font-family: inherit;
		font-size: 1rem;

		&:focus {
			outline: none;
			border-bottom-color: var(--ink);
			box-shadow: inset 0 -1px 0 var(--ink);
		}
	}

	.menu__list {
		list-style: none;
		margin: 0;
		padding: var(--space-1);
		max-height: 320px;
		overflow-y: auto;
	}

	.item {
		display: flex;
		flex-direction: column;
		gap: 2px;
		width: 100%;
		border: 0;
		background: transparent;
		border-radius: 2px;
		padding: var(--space-2) var(--space-3);
		text-align: left;
		color: var(--ink);

		&:hover,
		&:focus-visible {
			background: var(--wash);
		}
	}

	/* Tune names in the hand the chart is written in — a set list. */
	.item__title {
		font-family: var(--font-hand);
		font-size: 1.25rem;
		line-height: 1.15;
	}

	.item__origin {
		color: var(--color-text-faint);
	}

	.menu__empty {
		padding: var(--space-3);
		color: var(--color-text-faint);
	}

	.menu__note {
		margin: 0;
		padding: var(--space-2) var(--space-3);
		border-top: 1px solid var(--color-border);
		color: var(--color-text-faint);
	}
</style>
