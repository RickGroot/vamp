<script lang="ts">
	import { progression } from '$lib/stores/progression.svelte';
	import { EXAMPLES, type Example } from '$lib/model/examples';

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

<div class="examples" onfocusout={onFocusOut}>
	<button class="examples__btn" type="button" aria-expanded={open} onclick={() => (open = !open)}>
		Examples
	</button>

	{#if open}
		<div class="menu" role="menu">
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
						<button class="item" type="button" role="menuitem" onclick={() => load(example)}>
							<span class="item__title">{example.title}</span>
							<span class="item__origin label">{example.origin}</span>
						</button>
					</li>
				{:else}
					<li class="menu__empty label">No songs match “{query}”.</li>
				{/each}
			</ul>
			<p class="menu__note label">Public-domain · simplified</p>
		</div>
	{/if}
</div>

<style lang="scss">
	.examples {
		position: relative;
		display: inline-block;
	}

	.examples__btn {
		border: 1px solid var(--color-black);
		background: transparent;
		padding: var(--space-2) var(--space-3);
		font-family: inherit;
		font-size: 0.6875rem;
		font-weight: 400;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-text);

		&:hover {
			background: var(--color-black);
			color: var(--color-white);
		}
	}

	.menu {
		position: absolute;
		top: 100%;
		left: 0;
		margin-top: var(--space-1);
		min-width: 260px;
		background: var(--color-white);
		border: 1px solid var(--color-black);
		box-shadow: 0 8px 24px rgba(28, 26, 31, 0.14);
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
			border-bottom-color: var(--color-accent);
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
		padding: var(--space-2) var(--space-3);
		text-align: left;
		color: var(--color-text);

		&:hover {
			background: var(--color-grey-100);
			box-shadow: inset 3px 0 0 var(--c-major);
		}
	}

	.item__title {
		font-size: 1rem;
		font-weight: 300;
		letter-spacing: -0.01em;
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
