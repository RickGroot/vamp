<script lang="ts">
	import { view, TRADE_OPTIONS } from '$lib/stores/view.svelte';
	import { progression } from '$lib/stores/progression.svelte';
	import { MIX_LANES, MIX_LANE_LABELS } from '$lib/audio/mix';

	const mix = $derived(view.mix);
	const anySolo = $derived(MIX_LANES.some((lane) => mix[lane].solo));

	function tradeLabel(bars: number): string {
		return bars === 0 ? 'Off' : `${bars} bars`;
	}
</script>

<div class="mixer">
	<div class="mixer__head">
		<span class="label">Rhythm section</span>
		<button class="reset" type="button" onclick={() => view.resetMix()}>Reset</button>
	</div>

	<div class="lanes">
		{#each MIX_LANES as lane (lane)}
			{@const state = mix[lane]}
			{@const dimmed = (anySolo && !state.solo) || state.mute}
			<div class="lane lane--{lane}" class:lane--dim={dimmed}>
				<span class="lane__name">{MIX_LANE_LABELS[lane]}</span>
				<div class="lane__btns">
					<button
						class="msbtn"
						class:msbtn--mute={state.mute}
						type="button"
						aria-pressed={state.mute}
						title={`Mute ${MIX_LANE_LABELS[lane]}`}
						onclick={() => view.toggleLaneMute(lane)}>M</button
					>
					<button
						class="msbtn"
						class:msbtn--solo={state.solo}
						type="button"
						aria-pressed={state.solo}
						title={`Solo ${MIX_LANE_LABELS[lane]}`}
						onclick={() => view.toggleLaneSolo(lane)}>S</button
					>
				</div>
				<input
					class="fader"
					type="range"
					min="0"
					max="1"
					step="0.05"
					value={state.volume}
					aria-label={`${MIX_LANE_LABELS[lane]} volume`}
					oninput={(e) => view.setLaneVolume(lane, Number((e.target as HTMLInputElement).value))}
				/>
				<span class="lane__pct label">{Math.round(state.volume * 100)}</span>
			</div>
		{/each}
	</div>

	<div class="trade">
		<label class="label" for="trade">Trade solos</label>
		<select
			id="trade"
			class="field__select trade__select"
			value={view.tradeBars}
			onchange={(e) => view.setTradeBars(Number((e.target as HTMLSelectElement).value))}
		>
			{#each TRADE_OPTIONS as bars (bars)}
				<option value={bars}>{tradeLabel(bars)}</option>
			{/each}
		</select>
		{#if view.tradeBars > 0}
			<span class="trade__hint label"
				>Backing drops out every other {view.tradeBars} bars{progression.isPlaying
					? ''
					: ' (press play)'} — drums keep time</span
			>
		{/if}
	</div>
</div>

<style lang="scss">
	.mixer {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.mixer__head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
	}

	.reset {
		border: 0;
		background: transparent;
		padding: 0;
		font-family: inherit;
		font-size: 0.6875rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-text-faint);

		&:hover {
			color: var(--color-black);
		}
	}

	.lanes {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.lane {
		display: grid;
		grid-template-columns: 4.5rem auto 1fr 2.5ch;
		align-items: center;
		gap: var(--space-3);
		transition: opacity var(--motion-fast) var(--motion-ease-out);
	}

	.lane--dim {
		opacity: 0.45;
	}

	.lane__name {
		font-size: 0.85rem;
		font-weight: 400;
		/* A small coloured tick keeps the lanes glanceable. */
		border-left: 3px solid var(--c-other);
		padding-left: var(--space-2);
	}

	.lane--chords .lane__name {
		border-left-color: var(--c-major);
	}
	.lane--bass .lane__name {
		border-left-color: var(--c-minor);
	}
	.lane--drums .lane__name {
		border-left-color: var(--c-dominant);
	}

	.lane__btns {
		display: flex;
		gap: var(--space-1);
	}

	.msbtn {
		width: 24px;
		height: 24px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 1px solid var(--color-border);
		background: transparent;
		font-family: inherit;
		font-size: 0.6875rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		color: var(--color-text-muted);
		transition:
			background-color var(--motion-fast) var(--motion-ease-out),
			border-color var(--motion-fast) var(--motion-ease-out),
			color var(--motion-fast) var(--motion-ease-out);

		&:hover {
			border-color: var(--color-black);
			color: var(--color-black);
		}

		&--mute {
			background: var(--c-diminished);
			border-color: var(--c-diminished);
			color: var(--color-white);
		}

		&--solo {
			background: var(--c-major);
			border-color: var(--c-major);
			color: var(--color-white);
		}
	}

	.fader {
		width: 100%;
		accent-color: var(--c-major);
		cursor: pointer;
	}

	.lane__pct {
		text-align: right;
		font-variant-numeric: tabular-nums;
		color: var(--color-text-faint);
	}

	.trade {
		display: flex;
		align-items: baseline;
		gap: var(--space-3);
		flex-wrap: wrap;
		padding-top: var(--space-2);
		border-top: 1px solid var(--color-border);
	}

	.trade__select {
		font-size: 1rem;
		min-width: 7ch;
	}

	.trade__hint {
		flex: 1 1 12rem;
		text-transform: none;
		letter-spacing: 0;
		color: var(--color-text-faint);
	}
</style>
