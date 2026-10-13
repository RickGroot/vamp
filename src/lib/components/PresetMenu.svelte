<script lang="ts">
	import { progression } from '$lib/stores/progression.svelte';
	import { PRESETS, PRESET_ROOTS, type Preset } from '$lib/model/presets';
	import { dismissable } from '$lib/actions/dismissable';

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

<div class="presets" onfocusout={onFocusOut} use:dismissable={{ open, close: () => (open = false) }}>
	<button
		class="bar-btn"
		type="button"
		aria-expanded={open}
		onclick={() => (open = !open)}
	>
		+ Preset
	</button>

	{#if open}
		<!-- Disclosure popover, not an ARIA menu (contains a select + list). -->
		<div class="menu">
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
						<button class="item" type="button" onclick={() => apply(preset)}>
							<span class="item__name">{preset.name}</span>
							<span class="item__pattern hint">{preset.pattern}</span>
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

	

	.menu {
		position: absolute;
		top: 100%;
		left: 0;
		margin-top: var(--space-1);
		min-width: 240px;
		background: var(--color-white);
		border: var(--rule-heavy) solid var(--ink);
		border-radius: 0;
		box-shadow: 0 14px 32px var(--shadow);
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
		border-bottom: var(--rule-heavy) solid var(--ink);
		background: transparent;
		font-weight: 700;
		padding: var(--space-1) 0;

		&:focus {
			outline: none;
			border-bottom-color: var(--ink);
			box-shadow: inset 0 -2px 0 var(--ink);
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
		border-radius: 0;
		padding: var(--space-2) var(--space-3);
		text-align: left;
		color: var(--ink);

		&:hover,
		&:focus-visible {
			background: var(--wash);
		}
	}

	/* Tune names set like titles on a sleeve — a set list. */
	.item__name {
		font-family: var(--font-display);
		font-stretch: var(--display-stretch);
		font-weight: 900;
		font-size: 1.375rem;
		line-height: 1;
	}

	.item__pattern {
		color: var(--color-text-faint);
	}
</style>
