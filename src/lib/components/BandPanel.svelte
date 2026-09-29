<script lang="ts">
	import { progression } from '$lib/stores/progression.svelte';
	import { view, TRADE_OPTIONS } from '$lib/stores/view.svelte';
	import {
		INSTRUMENT_LABELS,
		INSTRUMENT_ORDER,
		BASS_INSTRUMENT_LABELS,
		BASS_INSTRUMENT_ORDER
	} from '$lib/audio/instruments';
	import type {
		BassInstrumentId,
		BassMode,
		CompPattern,
		DrumStyle,
		InstrumentId
	} from '$lib/model/types';
	import type { MixLane } from '$lib/audio/mix';

	const PATTERNS: { id: CompPattern; label: string }[] = [
		{ id: 'block', label: 'Block' },
		{ id: 'strum', label: 'Strum' },
		{ id: 'arpeggio', label: 'Arp' }
	];
	const BASS_MODES: { id: BassMode; label: string }[] = [
		{ id: 'none', label: 'No bass' },
		{ id: 'root', label: 'Root' },
		{ id: 'alt', label: 'Alternating' },
		{ id: 'walking', label: 'Walking' },
		{ id: 'octaves', label: 'Octaves' }
	];
	const DRUMS: { id: DrumStyle; label: string }[] = [
		{ id: 'none', label: 'No drums' },
		{ id: 'rock', label: 'Rock' },
		{ id: 'pop', label: 'Pop' },
		{ id: 'swing', label: 'Swing' },
		{ id: 'bossa', label: 'Bossa' }
	];

	const groove = $derived(progression.current.groove);
	const mix = $derived(view.mix);
	const anySolo = $derived((['chords', 'bass', 'drums'] as MixLane[]).some((l) => mix[l].solo));

	const open = $derived(view.sections.band);

	// Plain-language summary of the backing, shown when collapsed.
	const summary = $derived.by(() => {
		const parts = [INSTRUMENT_LABELS[progression.current.instrument]];
		if (groove.bass !== 'none') parts.push(`${BASS_MODES.find((b) => b.id === groove.bass)?.label.toLowerCase()} bass`);
		if (groove.drums !== 'none') parts.push(`${groove.drums} drums`);
		if (groove.metronome) parts.push('click');
		return parts.join(' · ');
	});

	function tradeLabel(bars: number): string {
		return bars === 0 ? 'Off' : `${bars} bars`;
	}
</script>

<section class="band" aria-label="Backing band">
	<h2 class="sec-head">
		<button class="sec-toggle" type="button" aria-expanded={open} onclick={() => view.setSectionOpen('band', !open)}>
			<svg class="chev" class:chev--open={open} viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
			<span class="sec-title">Band</span>
			<span class="sec-hint band__hint">{open ? 'Your backing — sound & mix' : summary}</span>
		</button>
	</h2>

	{#if open}
		<div class="channels">
			<!-- Chords -->
			<div class="ch ch--chords">
				<span class="ch__name">Chords</span>
				<div class="ch__src">
					<select
						class="sel"
						aria-label="Chord instrument"
						value={progression.current.instrument}
						onchange={(e) => progression.setInstrument((e.target as HTMLSelectElement).value as InstrumentId)}
					>
						{#each INSTRUMENT_ORDER as id (id)}
							<option value={id}>{INSTRUMENT_LABELS[id]}</option>
						{/each}
					</select>
					<select
						class="sel"
						aria-label="Comping pattern"
						value={groove.pattern}
						onchange={(e) => progression.setPattern((e.target as HTMLSelectElement).value as CompPattern)}
					>
						{#each PATTERNS as p (p.id)}
							<option value={p.id}>{p.label}</option>
						{/each}
					</select>
				</div>
				{@render level('chords', true)}
			</div>

			<!-- Bass -->
			<div class="ch ch--bass" class:ch--off={groove.bass === 'none'}>
				<span class="ch__name">Bass</span>
				<div class="ch__src">
					<select
						class="sel"
						aria-label="Bass style"
						value={groove.bass}
						onchange={(e) => progression.setBassMode((e.target as HTMLSelectElement).value as BassMode)}
					>
						{#each BASS_MODES as b (b.id)}
							<option value={b.id}>{b.label}</option>
						{/each}
					</select>
					{#if groove.bass !== 'none'}
						<select
							class="sel"
							aria-label="Bass sound"
							value={groove.bassInstrument}
							onchange={(e) => progression.setBassInstrument((e.target as HTMLSelectElement).value as BassInstrumentId)}
						>
							{#each BASS_INSTRUMENT_ORDER as id (id)}
								<option value={id}>{BASS_INSTRUMENT_LABELS[id]}</option>
							{/each}
						</select>
					{/if}
				</div>
				{@render level('bass', groove.bass !== 'none')}
			</div>

			<!-- Drums -->
			<div class="ch ch--drums" class:ch--off={groove.drums === 'none'}>
				<span class="ch__name">Drums</span>
				<div class="ch__src">
					<select
						class="sel"
						aria-label="Drum style"
						value={groove.drums}
						onchange={(e) => progression.setDrums((e.target as HTMLSelectElement).value as DrumStyle)}
					>
						{#each DRUMS as d (d.id)}
							<option value={d.id}>{d.label}</option>
						{/each}
					</select>
				</div>
				{@render level('drums', groove.drums !== 'none')}
			</div>

			<!-- Metronome (no level fader — it's just a guide click) -->
			<div class="ch ch--click" class:ch--off={!groove.metronome}>
				<span class="ch__name">Metronome</span>
				<div class="ch__src">
					<button
						class="toggle"
						class:toggle--on={groove.metronome}
						type="button"
						aria-pressed={groove.metronome}
						onclick={() => progression.toggleMetronome()}>{groove.metronome ? 'On' : 'Off'}</button
					>
				</div>
				<div class="ch__level ch__level--na"><span class="label">click track</span></div>
			</div>
		</div>

		<div class="trade">
			<label class="label" for="trade">Trade solos</label>
			<select
				id="trade"
				class="sel"
				value={view.tradeBars}
				onchange={(e) => view.setTradeBars(Number((e.target as HTMLSelectElement).value))}
			>
				{#each TRADE_OPTIONS as bars (bars)}
					<option value={bars}>{tradeLabel(bars)}</option>
				{/each}
			</select>
			<span class="trade__hint hint">
				{#if view.tradeBars > 0}
					Backing drops out every other {view.tradeBars} bars so you solo — drums keep time
				{:else}
					Drop the backing out every other N bars to trade solos over time
				{/if}
			</span>
		</div>
	{/if}
</section>

<!-- Level controls (volume + mute + solo) for a mix lane. Disabled when the part is off. -->
{#snippet level(lane: MixLane, enabled: boolean)}
	{@const state = mix[lane]}
	{@const dim = !enabled || state.mute || (anySolo && !state.solo)}
	<div class="ch__level" class:ch__level--dim={dim}>
		<input
			class="fader"
			type="range"
			min="0"
			max="1"
			step="0.05"
			value={state.volume}
			disabled={!enabled}
			aria-label={`${lane} volume`}
			oninput={(e) => view.setLaneVolume(lane, Number((e.target as HTMLInputElement).value))}
		/>
		<!-- M/S stay enabled even when the lane's source is off: a persisted solo
		     on a disabled lane silences everything, so the way out must stay
		     clickable. Only the fader is gated on the source. -->
		<button
			class="msbtn"
			class:msbtn--mute={state.mute}
			type="button"
			aria-pressed={state.mute}
			title="Mute"
			onclick={() => view.toggleLaneMute(lane)}>M</button
		>
		<button
			class="msbtn"
			class:msbtn--solo={state.solo}
			type="button"
			aria-pressed={state.solo}
			title="Solo"
			onclick={() => view.toggleLaneSolo(lane)}>S</button
		>
	</div>
{/snippet}

<style lang="scss">
	.band {
		margin-top: var(--space-12);
		border-top: 1px solid var(--rule);
		padding-top: var(--space-4);
	}

	.band__hint {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.channels {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin-top: var(--space-4);
	}

	.ch {
		display: grid;
		grid-template-columns: 5.5rem minmax(7rem, 1fr) minmax(170px, 16rem);
		align-items: center;
		gap: var(--space-3) var(--space-4);
		padding: var(--space-2) 0;
		border-top: 1px solid var(--color-border);
		transition: opacity var(--motion-fast) var(--motion-ease-out);
	}
	.ch:first-child {
		border-top: 0;
	}
	.ch--off {
		opacity: 0.85;
	}

	.ch__name {
		font-size: 0.9375rem;
		font-weight: 500;
	}

	.ch__src {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		align-items: center;
	}

	.ch__level {
		display: grid;
		grid-template-columns: 1fr auto auto;
		align-items: center;
		gap: var(--space-2);
		transition: opacity var(--motion-fast) var(--motion-ease-out);
	}
	.ch__level--dim {
		opacity: 0.45;
	}
	.ch__level--na {
		display: flex;
		justify-content: flex-start;
		color: var(--color-text-faint);
	}

	.sel {
		font-family: inherit;
		font-size: 0.95rem;
		font-weight: 400;
		color: var(--color-text);
		background: var(--color-white);
		border: 0;
		border-bottom: 1px solid var(--color-border);
		padding: var(--space-1) 0;
		border-radius: 0;

		&:focus {
			outline: none;
			border-bottom-color: var(--ink);
			box-shadow: inset 0 -1px 0 var(--ink);
		}
	}

	.toggle {
		border: 1px solid var(--color-border);
		background: transparent;
		padding: var(--space-1) var(--space-4);
		font-family: inherit;
		font-size: 0.8125rem;
		font-weight: 400;
		color: var(--color-text-muted);

		&:hover {
			border-color: var(--color-black);
			color: var(--color-black);
		}
		&--on {
			background: var(--spot);
			border-color: var(--spot);
			color: var(--on-spot);
		}
	}

	.fader {
		width: 100%;
		accent-color: var(--ink);
		cursor: pointer;
	}

	.msbtn {
		width: 26px;
		height: 26px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 1px solid var(--color-border);
		background: transparent;
		font-family: inherit;
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--color-text-muted);

		&:hover:not(:disabled) {
			border-color: var(--color-black);
			color: var(--color-black);
		}
		&:disabled {
			cursor: not-allowed;
			opacity: 0.5;
		}
		&--mute {
			background: var(--ink);
			border-color: var(--ink);
			color: var(--paper);
		}
		&--solo {
			background: var(--spot);
			border-color: var(--spot);
			color: var(--on-spot);
		}
	}

	.trade {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		flex-wrap: wrap;
		margin-top: var(--space-4);
		padding-top: var(--space-4);
		border-top: 1px solid var(--color-border);
	}
	.trade .sel {
		font-size: 1rem;
		min-width: 7ch;
	}
	.trade__hint {
		flex: 1 1 12rem;
		text-transform: none;
		letter-spacing: 0;
		color: var(--color-text-faint);
	}

	/* Mobile: stack each channel — name + source on one line, level below. */
	@media (max-width: 640px) {
		.ch {
			grid-template-columns: 5rem 1fr;
			gap: var(--space-2) var(--space-3);
		}
		.ch__level {
			grid-column: 1 / -1;
		}
	}
</style>
