<script lang="ts">
	import { onMount } from 'svelte';
	import { progression } from '$lib/stores/progression.svelte';
	import { library } from '$lib/stores/library.svelte';
	import { readFileAsText } from '$lib/storage/backup';

	let open = $state(false);
	let fileInput = $state<HTMLInputElement>();
	let showPaste = $state(false);
	let pasteText = $state('');
	let status = $state<{ kind: 'ok' | 'err'; text: string } | null>(null);

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

	// Shared import path for both a picked file and pasted text. Surfaces a
	// human-readable result/error instead of failing silently, and loads the
	// first imported song so it's immediately on the canvas.
	async function runImport(text: string) {
		status = null;
		try {
			const imported = await library.import(text);
			if (imported.length === 0) {
				status = { kind: 'err', text: 'No songs found in that JSON.' };
				return;
			}
			progression.load($state.snapshot(imported[0]));
			const more = imported.length > 1 ? ` (+${imported.length - 1} more added)` : '';
			status = { kind: 'ok', text: `Imported “${imported[0].name}”${more}.` };
			pasteText = '';
			showPaste = false;
		} catch (error) {
			status = { kind: 'err', text: error instanceof Error ? error.message : 'Import failed.' };
		}
	}

	async function onImportFile(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		try {
			await runImport(await readFileAsText(file));
		} catch {
			status = { kind: 'err', text: 'Could not read that file.' };
		}
	}
</script>

<div class="host" onfocusout={onFocusOut}>
	<button class="bar-btn" type="button" aria-expanded={open} onclick={() => (open = !open)}>File</button>

	{#if open}
		<div class="vmenu" role="menu">
			<button class="vmenu__row" type="button" onclick={onNew}>New</button>
			<button class="vmenu__row" type="button" onclick={onSave}>Save</button>
			<button class="vmenu__row" type="button" onclick={() => fileInput?.click()}>Import file…</button>
			<input
				bind:this={fileInput}
				class="file"
				type="file"
				accept="application/json,.json"
				onchange={onImportFile}
			/>
			<button
				class="vmenu__row"
				type="button"
				aria-expanded={showPaste}
				onclick={() => {
					showPaste = !showPaste;
					status = null;
				}}>Paste JSON…</button
			>

			{#if showPaste}
				<div class="paste">
					<textarea
						class="paste__area"
						bind:value={pasteText}
						rows="6"
						placeholder={'Paste song JSON here — a Vamp backup, a single progression, or an array.'}
						aria-label="Song JSON to import"
					></textarea>
					<div class="paste__actions">
						<button
							class="bar-btn"
							type="button"
							disabled={!pasteText.trim()}
							onclick={() => runImport(pasteText)}>Import</button
						>
						<button
							class="paste__cancel"
							type="button"
							onclick={() => {
								pasteText = '';
								showPaste = false;
								status = null;
							}}>Cancel</button
						>
					</div>
				</div>
			{/if}

			{#if status}
				<p class="status" class:status--err={status.kind === 'err'} role="status">{status.text}</p>
			{/if}

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

	.paste {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3) var(--space-3);
	}

	.paste__area {
		width: 100%;
		min-width: 240px;
		box-sizing: border-box;
		resize: vertical;
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 0.8rem;
		line-height: 1.4;
		color: var(--color-text);
		background: var(--color-white);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm, 4px);
		padding: var(--space-2);

		&:focus {
			outline: none;
			border-color: var(--color-accent);
		}
	}

	.paste__actions {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.paste__cancel {
		border: 0;
		background: transparent;
		padding: var(--space-1) var(--space-2);
		font-family: inherit;
		font-size: 0.8rem;
		color: var(--color-text-muted);

		&:hover {
			color: var(--color-black);
		}
	}

	.status {
		margin: 0;
		padding: var(--space-1) var(--space-3) var(--space-2);
		font-size: 0.8rem;
		color: var(--color-accent);

		&--err {
			color: var(--c-dominant, #d33);
		}
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
