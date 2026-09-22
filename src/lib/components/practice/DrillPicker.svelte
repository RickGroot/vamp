<script lang="ts">
	// Everything you set before you start playing. Deliberately separate from the
	// runner so nothing here competes for space on a music stand.
	import {
		practice,
		REP_OPTIONS,
		REST_OPTIONS,
		REGISTERS,
		DIRECTIONS,
		BACKINGS
	} from '$lib/stores/practice.svelte';
	import { BUILT_IN_DRILLS } from '$lib/practice/patterns';
	import { INSTRUMENT_RANGES } from '$lib/practice/range';
	import { SCALE_ROOTS } from '$lib/model/scales';
	import { KEY_MODES, CLICK_FEELS, TEMPO_STEPS } from '$lib/stores/drills.svelte';
	import { INSTRUMENT_LABELS, INSTRUMENT_ORDER } from '$lib/audio/instruments';
	import { TEMPO_MAX, TEMPO_MIN } from '$lib/model/factory';
	import { displayChord, concertFromDisplay } from '$lib/audio/transpose';

	// The root select shows WRITTEN pitch and stores CONCERT — the same contract
	// as the chord slots and the Scales section.
	const displayRoot = $derived(displayChord(practice.root, practice.offset));
	// A written root outside the flat-spelled list (F#, …) gets a synthetic option
	// so the select reflects it instead of going blank.
	const customRoot = $derived(SCALE_ROOTS.includes(displayRoot) ? null : displayRoot);

	const select = (e: Event) => (e.target as HTMLSelectElement).value;
</script>

<section class="picker" aria-label="Drill settings">
	<div class="picker__drills" role="group" aria-label="Drill">
		{#each BUILT_IN_DRILLS as drill (drill.id)}
			<button
				class="drill"
				class:drill--on={practice.drillId === drill.id}
				type="button"
				aria-pressed={practice.drillId === drill.id}
				onclick={() => practice.setDrill(drill.id)}
			>
				<span class="drill__name">{drill.name}</span>
				<span class="drill__desc">{drill.description}</span>
			</button>
		{/each}
	</div>

	<div class="picker__rows">
		<div class="row">
			<label class="label" for="p-root">Start key</label>
			<select
				id="p-root"
				value={displayRoot}
				onchange={(e) => practice.setRoot(concertFromDisplay(select(e), practice.offset))}
			>
				{#if customRoot}<option value={customRoot}>{customRoot}</option>{/if}
				{#each SCALE_ROOTS as root (root)}<option value={root}>{root}</option>{/each}
			</select>

			<label class="label" for="p-keymode">Then</label>
			<select
				id="p-keymode"
				value={practice.keyMode}
				onchange={(e) => practice.setKeyMode(select(e) as never)}
			>
				{#each KEY_MODES as mode (mode.id)}<option value={mode.id}>{mode.label}</option>{/each}
			</select>

			<label class="label" for="p-reps">Keys</label>
			<select id="p-reps" value={practice.reps} onchange={(e) => practice.setReps(Number(select(e)))}>
				{#each REP_OPTIONS as n (n)}<option value={n}>{n}</option>{/each}
			</select>
		</div>

		<div class="row">
			<label class="label" for="p-range">Range</label>
			<select
				id="p-range"
				value={practice.rangeId}
				onchange={(e) => practice.setRangeId(select(e))}
			>
				{#each INSTRUMENT_RANGES as r (r.id)}<option value={r.id}>{r.label}</option>{/each}
			</select>

			<label class="label" for="p-register">Register</label>
			<select
				id="p-register"
				value={practice.register}
				onchange={(e) => practice.setRegister(select(e) as never)}
			>
				{#each REGISTERS as r (r.id)}<option value={r.id}>{r.label}</option>{/each}
			</select>

			<label class="label" for="p-direction">Direction</label>
			<select
				id="p-direction"
				value={practice.direction}
				onchange={(e) => practice.setDirection(select(e) as never)}
			>
				<option value="">As written</option>
				{#each DIRECTIONS as d (d.id)}<option value={d.id}>{d.label}</option>{/each}
			</select>
		</div>

		<div class="row">
			<label class="label" for="p-tempo">Tempo</label>
			<input
				id="p-tempo"
				type="number"
				min={TEMPO_MIN}
				max={TEMPO_MAX}
				step="1"
				value={practice.tempo}
				onchange={(e) => practice.setTempo(Number((e.target as HTMLInputElement).value))}
			/>

			<label class="label" for="p-step">Step up</label>
			<select
				id="p-step"
				value={practice.tempoStep}
				onchange={(e) => practice.setTempoStep(Number(select(e)))}
			>
				{#each TEMPO_STEPS as step (step)}
					<option value={step}>{step === 0 ? 'Off' : `+${step} bpm`}</option>
				{/each}
			</select>

			{#if practice.tempoStep > 0}
				<label class="label" for="p-tmax">up to</label>
				<input
					id="p-tmax"
					type="number"
					min={TEMPO_MIN}
					max={TEMPO_MAX}
					step="5"
					value={practice.tempoMax}
					onchange={(e) => practice.setTempoMax(Number((e.target as HTMLInputElement).value))}
				/>
			{/if}

			<label class="label" for="p-rest">Rest</label>
			<select
				id="p-rest"
				value={practice.restBars}
				onchange={(e) => practice.setRestBars(Number(select(e)))}
			>
				{#each REST_OPTIONS as bars (bars)}
					<option value={bars}>{bars === 0 ? 'None' : `${bars} bar${bars > 1 ? 's' : ''}`}</option>
				{/each}
			</select>
		</div>

		<div class="row">
			<label class="label" for="p-backing">Backing</label>
			<select
				id="p-backing"
				value={practice.backing}
				onchange={(e) => practice.setBacking(select(e) as never)}
			>
				{#each BACKINGS as b (b.id)}<option value={b.id}>{b.label}</option>{/each}
			</select>

			{#if practice.backing === 'click'}
				<label class="label" for="p-feel">Feel</label>
				<select
					id="p-feel"
					value={practice.clickFeel}
					onchange={(e) => practice.setClickFeel(select(e) as never)}
				>
					{#each CLICK_FEELS as f (f.id)}<option value={f.id}>{f.label}</option>{/each}
				</select>
			{/if}

			<label class="label" for="p-inst">Line sound</label>
			<select
				id="p-inst"
				value={practice.instrument}
				onchange={(e) => practice.setInstrument(select(e) as never)}
			>
				{#each INSTRUMENT_ORDER as id (id)}<option value={id}>{INSTRUMENT_LABELS[id]}</option>{/each}
			</select>

			<button
				class="bar-btn"
				class:bar-btn--on={practice.countIn}
				type="button"
				aria-pressed={practice.countIn}
				onclick={() => practice.setCountIn(!practice.countIn)}>Count-in</button
			>
		</div>
	</div>
</section>

<style lang="scss">
	.picker {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.picker__drills {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
		gap: var(--space-2);
	}

	.drill {
		display: flex;
		flex-direction: column;
		gap: 2px;
		text-align: left;
		padding: var(--space-3);
		border: 1px solid var(--color-border);
		background: var(--color-white);
		font-family: inherit;
		cursor: pointer;
		transition: border-color var(--motion-fast) var(--motion-ease-out);

		&:hover {
			border-color: var(--color-black);
		}

		&:focus-visible {
			outline: 2px solid var(--color-accent);
			outline-offset: 2px;
		}
	}

	/* The selected drill is marked by a bar and a border, never colour alone. */
	.drill--on {
		border-color: var(--color-black);
		box-shadow: inset 3px 0 0 0 var(--c-dominant);
	}

	.drill__name {
		font-size: 0.9rem;
		color: var(--color-text);
	}

	.drill__desc {
		font-size: 0.75rem;
		color: var(--color-text-faint);
		line-height: 1.35;
	}

	.picker__rows {
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

	.row select,
	.row input {
		font-family: inherit;
		font-size: 0.8rem;
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

	.row input[type='number'] {
		width: 4.5rem;
	}
</style>
