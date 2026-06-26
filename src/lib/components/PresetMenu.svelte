<script lang="ts">
	import { progression } from '$lib/stores/progression.svelte';
	import { PRESETS, PRESET_ROOTS, type Preset } from '$lib/model/presets';

	let open = $state(false);
	let root = $state('C');

	function apply(preset: Preset) {
		progression.applyPreset(preset, root);
		open = false;
	}

	function onFocusOut(event: FocusEvent) {
		const next = event.relatedTarget as Node | null;
		if (!(event.currentTarget as HTMLElement).contains(next)) open = false;
	}
</script>

<div class="presets" onfocusout={onFocusOut}>
	<button
		class="presets__btn"
		type="button"
		aria-expanded={open}
		onclick={() => (open = !open)}
	>
		+ Preset
	</button>

	{#if open}
		<div class="menu" role="menu">
			<div class="menu__root">
				<label class="label" for="preset-root">Root</label>
				<select id="preset-root" class="menu__select" bind:value={root}>
					{#each PRESET_ROOTS as r (r)}
						<option value={r}>{r}</option>
					{/each}
				</select>
			</div>
			<ul class="menu__list">
				{#each PRESETS as preset (preset.id)}
					<li>
						<button class="item" type="button" role="menuitem" onclick={() => apply(preset)}>
							<span class="item__name">{preset.name}</span>
							<span class="item__pattern label">{preset.pattern}</span>
						</button>
					</li>
				{/each}
			</ul>
		</div>
	{/if}
</div>

<style lang="scss">
	.presets {
		position: relative;
		display: inline-block;
	}

	.presets__btn {
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
		min-width: 240px;
		background: var(--color-white);
		border: 1px solid var(--color-black);
		box-shadow: 0 8px 24px rgba(28, 26, 31, 0.14);
		z-index: 50;
	}

	.menu__root {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-3);
		border-bottom: 1px solid var(--color-border);
	}

	.menu__select {
		font-family: inherit;
		font-size: 1rem;
		border: 0;
		border-bottom: 1px solid var(--color-border);
		background: transparent;
		padding: var(--space-1) 0;

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

	.item__name {
		font-size: 1rem;
		font-weight: 300;
		letter-spacing: -0.01em;
	}

	.item__pattern {
		color: var(--color-text-faint);
	}
</style>
