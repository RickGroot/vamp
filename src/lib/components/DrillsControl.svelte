<script lang="ts">
	import {
		drills,
		CLICK_FEELS,
		KEY_MODES,
		TEMPO_STEPS,
		EVERY_OPTIONS
	} from '$lib/stores/drills.svelte';
	import type { ClickFeel, KeyCycleMode } from '$lib/audio/drills';

	const stepLabel = (s: number) => (s === 0 ? 'Off' : `+${s} bpm`);
</script>

<div class="drills">
	<!-- Metronome feel -->
	<div class="row">
		<label class="label" for="feel">Click feel</label>
		<select
			id="feel"
			class="sel"
			value={drills.clickFeel}
			onchange={(e) => drills.setClickFeel((e.target as HTMLSelectElement).value as ClickFeel)}
		>
			{#each CLICK_FEELS as f (f.id)}
				<option value={f.id}>{f.label}</option>
			{/each}
		</select>
	</div>

	<!-- Tempo step-up -->
	<div class="row">
		<label class="label" for="step">Step-up</label>
		<select
			id="step"
			class="sel"
			value={drills.tempoStep}
			onchange={(e) => drills.setTempoStep(Number((e.target as HTMLSelectElement).value))}
		>
			{#each TEMPO_STEPS as s (s)}
				<option value={s}>{stepLabel(s)}</option>
			{/each}
		</select>
		{#if drills.steppingTempo}
			<span class="sub label">every</span>
			<select
				class="sel sel--sm"
				aria-label="Loops between tempo steps"
				value={drills.tempoEvery}
				onchange={(e) => drills.setTempoEvery(Number((e.target as HTMLSelectElement).value))}
			>
				{#each EVERY_OPTIONS as n (n)}
					<option value={n}>{n}</option>
				{/each}
			</select>
			<span class="sub label">loops · up to</span>
			<input
				class="num"
				type="number"
				min="40"
				max="300"
				step="5"
				aria-label="Max tempo"
				value={drills.tempoMax}
				onchange={(e) => drills.setTempoMax(Number((e.target as HTMLInputElement).value))}
			/>
			<span class="sub label">bpm</span>
		{/if}
	</div>

	<!-- Key cycle -->
	<div class="row">
		<label class="label" for="key">Key cycle</label>
		<select
			id="key"
			class="sel"
			value={drills.keyMode}
			onchange={(e) => drills.setKeyMode((e.target as HTMLSelectElement).value as KeyCycleMode)}
		>
			{#each KEY_MODES as m (m.id)}
				<option value={m.id}>{m.label}</option>
			{/each}
		</select>
		{#if drills.cyclingKey}
			<span class="sub label">every</span>
			<select
				class="sel sel--sm"
				aria-label="Loops between key changes"
				value={drills.keyEvery}
				onchange={(e) => drills.setKeyEvery(Number((e.target as HTMLSelectElement).value))}
			>
				{#each EVERY_OPTIONS as n (n)}
					<option value={n}>{n}</option>
				{/each}
			</select>
			<span class="sub label">loops</span>
		{/if}
	</div>

	<p class="hint">Drills run while the loop plays; your original key &amp; tempo return when you stop.</p>
</div>

<style lang="scss">
	.drills {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: wrap;
	}

	.row > .label:first-child {
		flex: 0 0 4.5rem;
		white-space: nowrap;
	}

	.sub {
		text-transform: none;
		letter-spacing: 0;
		color: var(--color-text-faint);
	}

	.sel {
		font-family: inherit;
		font-size: 0.95rem;
		color: var(--color-text);
		background: var(--color-white);
		border: 0;
		border-bottom: 1px solid var(--color-border);
		padding: var(--space-1) 0;
		border-radius: 0;

		&:focus {
			outline: none;
			border-bottom-color: var(--color-accent);
		}
	}

	.sel--sm {
		min-width: 3ch;
	}

	.num {
		width: 4.5ch;
		font-family: inherit;
		font-size: 0.95rem;
		color: var(--color-text);
		background: var(--color-white);
		border: 0;
		border-bottom: 1px solid var(--color-border);
		padding: var(--space-1) 0;

		&:focus {
			outline: none;
			border-bottom-color: var(--color-accent);
		}
	}

	.hint {
		margin: 0;
		font-size: 0.75rem;
		line-height: 1.4;
		color: var(--color-text-faint);
	}
</style>
