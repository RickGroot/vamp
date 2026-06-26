<script lang="ts">
	import { progression } from '$lib/stores/progression.svelte';
	import type { CompPattern, DrumStyle } from '$lib/model/types';

	const PATTERNS: { id: CompPattern; label: string }[] = [
		{ id: 'block', label: 'Block' },
		{ id: 'strum', label: 'Strum' },
		{ id: 'arpeggio', label: 'Arp' }
	];

	const DRUMS: { id: DrumStyle; label: string }[] = [
		{ id: 'none', label: 'No drums' },
		{ id: 'rock', label: 'Rock' },
		{ id: 'pop', label: 'Pop' },
		{ id: 'swing', label: 'Swing' },
		{ id: 'bossa', label: 'Bossa' }
	];

	const groove = $derived(progression.current.groove);
</script>

<div class="field">
	<label class="label" for="pattern">Groove</label>
	<div class="field__row groove">
		<select
			id="pattern"
			class="field__select"
			value={groove.pattern}
			onchange={(e) => progression.setPattern((e.target as HTMLSelectElement).value as CompPattern)}
		>
			{#each PATTERNS as p (p.id)}
				<option value={p.id}>{p.label}</option>
			{/each}
		</select>
		<button
			class="toggle"
			class:toggle--on={groove.bass}
			type="button"
			aria-pressed={groove.bass}
			onclick={() => progression.toggleBass()}>Bass</button
		>
		<button
			class="toggle"
			class:toggle--on={groove.metronome}
			type="button"
			aria-pressed={groove.metronome}
			onclick={() => progression.toggleMetronome()}>Click</button
		>
		<select
			class="field__select drums"
			aria-label="Drums"
			value={groove.drums}
			onchange={(e) => progression.setDrums((e.target as HTMLSelectElement).value as DrumStyle)}
		>
			{#each DRUMS as d (d.id)}
				<option value={d.id}>{d.label}</option>
			{/each}
		</select>
	</div>
</div>

<style lang="scss">
	.groove {
		align-items: center;
		gap: var(--space-2);
	}

	.toggle {
		border: 1px solid var(--color-border);
		background: transparent;
		padding: var(--space-1) var(--space-2);
		font-family: inherit;
		font-size: 0.6875rem;
		font-weight: 400;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-text-muted);
		transition:
			background-color var(--motion-fast) var(--motion-ease-out),
			color var(--motion-fast) var(--motion-ease-out),
			border-color var(--motion-fast) var(--motion-ease-out);

		&:hover {
			border-color: var(--color-black);
			color: var(--color-black);
		}

		&--on {
			background: var(--c-major);
			border-color: var(--c-major);
			color: var(--color-white);
		}
	}
</style>
