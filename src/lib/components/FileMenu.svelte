<script lang="ts">
	import { onMount } from 'svelte';
	import { progression } from '$lib/stores/progression.svelte';
	import { library } from '$lib/stores/library.svelte';
	import { readFileAsText } from '$lib/storage/backup';

	let open = $state(false);
	let fileInput = $state<HTMLInputElement>();

	const dateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' });

	onMount(() => void library.refresh());

	function onFocusOut(event: FocusEvent) {
		const next = event.relatedTarget as Node | null;
		if (!(event.currentTarget as HTMLElement).contains(next)) open = false;
	}

	function onNew() {
		progression.newProgression();
		open = false;
	}

	async function onSave() {
		await library.save($state.snapshot(progression.current));
	}

	function onLoad(id: string) {
		const item = library.items.find((p) => p.id === id);
		if (item) {
			progression.load($state.snapshot(item));
			open = false;
		}
	}

	async function onImport(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		try {
			await library.import(await readFileAsText(file));
		} catch {
			/* ignore bad file */
		}
		open = false;
	}
</script>

<div class="host" onfocusout={onFocusOut}>
	<button class="bar-btn" type="button" aria-expanded={open} onclick={() => (open = !open)}>File</button>

	{#if open}
		<div class="vmenu" role="menu">
			<button class="vmenu__row" type="button" onclick={onNew}>New</button>
			<button class="vmenu__row" type="button" onclick={onSave}>Save</button>
			<button class="vmenu__row" type="button" onclick={() => fileInput?.click()}>Import…</button>
			<input
				bind:this={fileInput}
				class="file"
				type="file"
				accept="application/json,.json"
				onchange={onImport}
			/>

			{#if library.items.length > 0}
				<div class="divider"></div>
				<p class="label saved-label">Saved</p>
				<ul class="saved">
					{#each library.items as item (item.id)}
						<li class="saved__row" class:saved__row--current={item.id === progression.current.id}>
							<button class="saved__load" type="button" onclick={() => onLoad(item.id)}>
								<span class="saved__name">{item.name || 'Untitled'}</span>
								<span class="saved__meta label">{dateFmt.format(item.updatedAt)}</span>
							</button>
							<button
								class="saved__del"
								type="button"
								aria-label={`Delete ${item.name}`}
								onclick={() => library.remove(item.id)}>×</button
							>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}
</div>

<style lang="scss">
	.host {
		position: relative;
		display: inline-block;
	}

	.file {
		display: none;
	}

	.divider {
		height: 1px;
		background: var(--color-border);
		margin: var(--space-1) 0;
	}

	.saved-label {
		padding: var(--space-1) var(--space-3);
		color: var(--color-text-faint);
	}

	.saved {
		list-style: none;
		margin: 0;
		padding: 0;
		max-height: 260px;
		overflow-y: auto;
	}

	.saved__row {
		display: flex;
		align-items: center;

		&--current .saved__name {
			color: var(--color-accent);
		}
	}

	.saved__load {
		flex: 1 1 auto;
		display: flex;
		flex-direction: column;
		gap: 1px;
		border: 0;
		background: transparent;
		padding: var(--space-2) var(--space-3);
		text-align: left;
		color: var(--color-text);

		&:hover {
			background: var(--color-grey-100);
		}
	}

	.saved__name {
		font-size: 0.95rem;
	}

	.saved__meta {
		color: var(--color-text-faint);
	}

	.saved__del {
		border: 0;
		background: transparent;
		padding: var(--space-2);
		color: var(--color-grey-400);
		font-size: 1.1rem;
		line-height: 1;

		&:hover {
			color: var(--color-black);
		}
	}
</style>
