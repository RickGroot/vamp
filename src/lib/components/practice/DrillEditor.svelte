<script lang="ts">
	// Build your own drill: a cell of scale degrees, a rhythm, and how it moves.
	//
	// This is also the lick trainer — a short pattern entered as degrees is
	// exactly a custom cell, and gets transposition through keys and registers for
	// free from the same resolver.
	import { practice } from '$lib/stores/practice.svelte';
	import { drillLibrary } from '$lib/stores/drillLibrary.svelte';
	import { SCALE_TYPES } from '$lib/model/scales';
	import { newId } from '$lib/model/factory';
	import { migrateDrill } from '$lib/storage/drillDb';
	import { CURRENT_DRILL_SCHEMA_VERSION, type DrillDefinition } from '$lib/practice/types';

	interface Props {
		/** Close the editor. */
		onclose: () => void;
	}
	let { onclose }: Props = $props();

	// Seed from the current drill, so "customise this" is the common path.
	const seed = practice.definition;
	let name = $state(seed.builtIn ? `${seed.name} (mine)` : seed.name);
	let scaleType = $state(seed.source.kind === 'scale' ? seed.source.scaleType : 'major');
	let quality = $state(seed.source.kind === 'chord' ? seed.source.quality : 'maj7');
	let kind = $state<'scale' | 'chord'>(seed.source.kind === 'chord' ? 'chord' : 'scale');
	// Degrees are 1-based in the UI (musicians count from 1) and 0-based in the
	// model, so the conversion happens only here, at the boundary.
	let degrees = $state(seed.pattern.cell.map((c) => c + 1).join(' '));
	let rhythm = $state(seed.pattern.rhythm.join(' '));
	let step = $state(seed.pattern.step);
	let cells = $state(seed.cellsPerKey);
	let saving = $state(false);
	let error = $state<string | null>(null);

	const parseList = (text: string): number[] =>
		text
			.split(/[\s,]+/)
			.map((part) => Number(part))
			.filter((n) => Number.isFinite(n));

	const parsedDegrees = $derived(parseList(degrees));
	const parsedRhythm = $derived(parseList(rhythm).filter((n) => n > 0));

	/** Preview of what will be saved — coerced exactly as a stored record would be. */
	const draft = $derived<DrillDefinition>(
		migrateDrill({
			schemaVersion: CURRENT_DRILL_SCHEMA_VERSION,
			// Editing an existing custom drill updates it; customising a built-in
			// makes a new one, so the shipped library is never overwritten.
			id: seed.builtIn ? newId() : seed.id,
			name,
			description: 'Your own pattern.',
			createdAt: seed.builtIn ? Date.now() : seed.createdAt,
			updatedAt: Date.now(),
			source:
				kind === 'chord'
					? { kind: 'chord', quality }
					: { kind: 'scale', scaleType },
			pattern: {
				id: 'custom',
				label: name,
				cell: parsedDegrees.map((d) => d - 1),
				rhythm: parsedRhythm,
				step
			},
			direction: seed.direction,
			cellsPerKey: cells,
			timeSignature: seed.timeSignature
		})
	);

	/** What the cell will actually sound like, degree by degree. */
	const preview = $derived(draft.pattern.cell.map((c) => c + 1).join(' – '));

	async function save() {
		saving = true;
		error = null;
		const stored = await drillLibrary.save(draft);
		saving = false;
		if (!stored) {
			error = drillLibrary.error ?? 'Could not save.';
			return;
		}
		practice.setDrill(stored.id);
		onclose();
	}
</script>

<div class="editor">
	<div class="editor__row">
		<label class="label" for="d-name">Name</label>
		<input id="d-name" class="editor__name" type="text" bind:value={name} />
	</div>

	<div class="editor__row">
		<label class="label" for="d-kind">Over a</label>
		<select id="d-kind" bind:value={kind}>
			<option value="scale">Scale</option>
			<option value="chord">Chord</option>
		</select>

		{#if kind === 'scale'}
			<select aria-label="Scale type" bind:value={scaleType}>
				{#each SCALE_TYPES as type (type.id)}<option value={type.id}>{type.label}</option>{/each}
			</select>
		{:else}
			<label class="label" for="d-quality">Quality</label>
			<input id="d-quality" class="editor__quality" type="text" bind:value={quality} placeholder="maj7" />
			<span class="label editor__hint">as in C{quality}</span>
		{/if}
	</div>

	<div class="editor__row">
		<label class="label" for="d-degrees">Degrees</label>
		<input
			id="d-degrees"
			class="editor__degrees"
			type="text"
			bind:value={degrees}
			placeholder="1 2 3 5"
			aria-describedby="d-degrees-help"
		/>
		<span class="label editor__hint" id="d-degrees-help">
			Steps of the {kind === 'chord' ? 'chord' : 'scale'}, counting from 1. Go past the top and it
			carries into the next octave; use 0 or negatives to go below.
		</span>
	</div>

	<div class="editor__row">
		<label class="label" for="d-rhythm">Beats each</label>
		<input id="d-rhythm" class="editor__rhythm" type="text" bind:value={rhythm} placeholder="0.5" />
		<span class="label editor__hint">Repeats across the cell. 1 = a beat, 0.5 = an eighth.</span>
	</div>

	<div class="editor__row">
		<label class="label" for="d-step">Move by</label>
		<input id="d-step" type="number" min="-12" max="12" step="1" bind:value={step} />
		<label class="label" for="d-cells">Repeats</label>
		<input id="d-cells" type="number" min="1" max="32" step="1" bind:value={cells} />
	</div>

	<p class="editor__preview label">
		Plays: {preview} · {draft.pattern.cell.length * cells} notes per key
	</p>

	{#if error}<p class="editor__error label" role="alert">{error}</p>{/if}

	<div class="editor__actions">
		<button class="bar-btn" type="button" onclick={onclose}>Cancel</button>
		<button class="bar-btn bar-btn--on" type="button" disabled={saving} onclick={() => void save()}>
			{saving ? 'Saving…' : 'Save drill'}
		</button>
	</div>
</div>

<style lang="scss">
	.editor {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding: var(--space-4);
		border: 1px solid var(--color-black);
		background: var(--color-white);
	}

	.editor__row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: wrap;
	}

	.editor input,
	.editor select {
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

	.editor input[type='number'] {
		width: 4rem;
	}

	.editor__name {
		flex: 1 1 14rem;
	}

	.editor__degrees {
		width: 9rem;
	}

	.editor__rhythm,
	.editor__quality {
		width: 6rem;
	}

	.editor__hint {
		color: var(--color-text-faint);
		flex: 1 1 16rem;
	}

	.editor__preview {
		margin: 0;
		color: var(--color-text);
	}

	.editor__error {
		margin: 0;
		color: var(--c-diminished);
	}

	.editor__actions {
		display: flex;
		gap: var(--space-2);
		justify-content: flex-end;
	}
</style>
