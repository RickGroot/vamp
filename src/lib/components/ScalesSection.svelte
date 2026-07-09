<script lang="ts">
	import { scales, type ScaleView } from '$lib/stores/scales.svelte';
	import { progression } from '$lib/stores/progression.svelte';
	import { SCALE_TYPES, SCALE_ROOTS } from '$lib/model/scales';
	import { scaleMidis, playScale } from '$lib/audio/scalePlayer';
	import ScaleStaff from './ScaleStaff.svelte';
	import ScaleFretboard from './ScaleFretboard.svelte';

	const VIEWS: { id: ScaleView; label: string }[] = [
		{ id: 'keyboard', label: 'Keyboard' },
		{ id: 'staff', label: 'Staff' },
		{ id: 'fretboard', label: 'Guitar' }
	];

	const info = $derived(scales.info);
	const typeLabel = $derived(SCALE_TYPES.find((t) => t.id === scales.type)?.label ?? scales.type);
	// The per-chord shortcut can set a sharp root (e.g. F#m7 → "F#") that isn't in
	// the flat-spelled SCALE_ROOTS list; surface it as an extra option so the
	// select reflects it instead of going blank (and the scale keeps its clean
	// sharp spelling rather than an ugly Gb double-flat respelling).
	const customRoot = $derived(SCALE_ROOTS.includes(scales.root) ? null : scales.root);

	// ---- keyboard layout (two octaves from C) ----
	const WHITE_PCS = [0, 2, 4, 5, 7, 9, 11];
	const BLACK_AFTER = [0, 1, 3, 4, 5]; // white degrees with a black key to their right
	const N_WHITE = WHITE_PCS.length * 2;
	const W = 26;
	const H = 96;
	const BW = 16;
	const BH = 60;

	const whiteKeys = $derived.by(() => {
		const set = new Set(info.pcs);
		return Array.from({ length: N_WHITE }, (_, i) => {
			const pc = WHITE_PCS[i % 7];
			return { x: i * W, pc, inScale: set.has(pc), isRoot: pc === info.rootPc };
		});
	});
	const blackKeys = $derived.by(() => {
		const set = new Set(info.pcs);
		const keys: { x: number; pc: number; inScale: boolean; isRoot: boolean }[] = [];
		for (let i = 0; i < N_WHITE - 1; i++) {
			const deg = i % 7;
			if (!BLACK_AFTER.includes(deg)) continue;
			const pc = (WHITE_PCS[deg] + 1) % 12;
			keys.push({ x: (i + 1) * W - BW / 2, pc, inScale: set.has(pc), isRoot: pc === info.rootPc });
		}
		return keys;
	});

	function play() {
		void playScale(scaleMidis(scales.root, info.pcs, info.rootPc), progression.current.instrument);
	}

	let sectionEl = $state<HTMLElement>();
	// Scroll into view when a chord shortcut requests it.
	$effect(() => {
		if (scales.pulse > 0) sectionEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	});
</script>

<section class="scales" aria-label="Scales" bind:this={sectionEl}>
	<button
		class="scales__toggle"
		type="button"
		aria-expanded={scales.open}
		onclick={() => scales.setOpen(!scales.open)}
	>
		<span class="chev" class:chev--open={scales.open} aria-hidden="true">▸</span>
		<span class="sec-icon" class:sec-icon--open={scales.open} aria-hidden="true">
			<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="M3 20h4v-5h4V9h4V4h5" />
			</svg>
		</span>
		<span class="wordmark scales__title">Scales</span>
		<span class="label scales__hint">{info.name}</span>
	</button>

	{#if scales.open}
		<div class="scales__body">
			<div class="controls">
				<div class="field">
					<label class="label" for="scale-root">Root</label>
					<select
						id="scale-root"
						class="sel"
						value={scales.root}
						onchange={(e) => scales.setRoot((e.target as HTMLSelectElement).value)}
					>
						{#if customRoot}<option value={customRoot}>{customRoot}</option>{/if}
						{#each SCALE_ROOTS as r (r)}<option value={r}>{r}</option>{/each}
					</select>
				</div>
				<div class="field">
					<label class="label" for="scale-type">Scale</label>
					<select
						id="scale-type"
						class="sel sel--wide"
						value={scales.type}
						onchange={(e) => scales.setType((e.target as HTMLSelectElement).value)}
					>
						{#each SCALE_TYPES as t (t.id)}<option value={t.id}>{t.label}</option>{/each}
					</select>
				</div>
				<button class="play-scale" type="button" onclick={play} title="Hear the scale">
					<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M8 5l11 7-11 7z" fill="currentColor" /></svg>
					Play
				</button>
			</div>

			{#if scales.suggestedFor}
				<div class="suggest">
					<span class="label">Fits {scales.suggestedFor}</span>
					<div class="suggest__chips">
						{#each scales.suggestedTypes as t (t)}
							<button
								class="chip"
								class:chip--on={scales.type === t}
								type="button"
								onclick={() => scales.setType(t)}
							>
								{SCALE_TYPES.find((s) => s.id === t)?.label ?? t}
							</button>
						{/each}
					</div>
				</div>
			{/if}

			<div class="notes" aria-label="Scale notes">
				{#each info.notes as note, i (i)}
					<span class="note" class:note--root={i === 0}>{note}</span>
				{/each}
			</div>

			<div class="viewtoggle" role="group" aria-label="Scale view">
				{#each VIEWS as v (v.id)}
					<button
						class="vt"
						class:vt--on={scales.display === v.id}
						type="button"
						aria-pressed={scales.display === v.id}
						onclick={() => scales.setDisplay(v.id)}>{v.label}</button
					>
				{/each}
			</div>

			{#if scales.display === 'staff'}
				<ScaleStaff notes={info.notes} />
			{:else if scales.display === 'fretboard'}
				<ScaleFretboard pcs={info.pcs} rootPc={info.rootPc} />
			{:else}
				<svg class="kbd" viewBox="0 0 {N_WHITE * W} {H}" role="img" aria-label="{info.name} on a keyboard">
					{#each whiteKeys as k (k.x)}
						<rect class="wkey" x={k.x + 0.5} y="0" width={W - 1} height={H} rx="3" />
						{#if k.inScale}
							<circle cx={k.x + W / 2} cy={H - 13} r="5.5" fill="var(--c-{k.isRoot ? 'dominant' : 'major'})" />
						{/if}
					{/each}
					{#each blackKeys as k (k.x)}
						<rect class="bkey" x={k.x} y="0" width={BW} height={BH} rx="2.5" />
						{#if k.inScale}
							<circle cx={k.x + BW / 2} cy={BH - 9} r="4" fill="var(--c-{k.isRoot ? 'dominant' : 'major'})" />
						{/if}
					{/each}
				</svg>
			{/if}

			<p class="legend label">
				<span class="legend__dot legend__dot--root"></span> root
				<span class="legend__dot legend__dot--scale"></span> scale tone
			</p>
		</div>
	{/if}
</section>

<style lang="scss">
	.scales {
		margin-top: var(--space-8);
		border-top: 1px solid var(--color-border);
		padding-top: var(--space-6);
	}

	.scales__toggle {
		display: flex;
		align-items: baseline;
		gap: var(--space-3);
		width: 100%;
		border: 0;
		background: transparent;
		padding: 0;
		text-align: left;
		color: var(--color-text);
	}

	.chev {
		font-size: 0.8rem;
		color: var(--color-text-faint);
		transition: transform var(--motion-fast) var(--motion-ease-out);
	}
	.chev--open {
		transform: rotate(90deg);
	}

	.scales__title {
		font-size: 1.1rem;
	}
	.scales__hint {
		color: var(--color-text-faint);
		text-transform: none;
		letter-spacing: 0;
	}

	.scales__body {
		margin-top: var(--space-6);
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.controls {
		display: flex;
		align-items: flex-end;
		gap: var(--space-4);
		flex-wrap: wrap;
	}

	.sel {
		font-family: inherit;
		font-size: 1rem;
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
	.sel--wide {
		min-width: 13ch;
	}

	.play-scale {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		border: 1px solid var(--color-black);
		background: transparent;
		padding: var(--space-2) var(--space-4);
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

	.viewtoggle {
		display: inline-flex;
		align-self: flex-start;
		border: 1px solid var(--color-border);
	}
	.vt {
		border: 0;
		border-right: 1px solid var(--color-border);
		background: transparent;
		padding: var(--space-1) var(--space-3);
		font-family: inherit;
		font-size: 0.6875rem;
		font-weight: 400;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-text-muted);

		&:last-child {
			border-right: 0;
		}
		&:hover {
			color: var(--color-black);
		}
		&--on {
			background: var(--c-major);
			color: var(--color-white);
		}
	}

	.suggest {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		flex-wrap: wrap;
	}
	.suggest__chips {
		display: flex;
		gap: var(--space-2);
		flex-wrap: wrap;
	}
	.chip {
		border: 1px solid var(--color-border);
		background: transparent;
		padding: var(--space-1) var(--space-2);
		font-family: inherit;
		font-size: 0.8rem;
		color: var(--color-text-muted);

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

	.notes {
		display: flex;
		gap: var(--space-2);
		flex-wrap: wrap;
	}
	.note {
		min-width: 2.2rem;
		text-align: center;
		padding: var(--space-1) var(--space-2);
		border: 1px solid var(--color-border);
		font-size: 0.95rem;
		color: var(--color-text);
	}
	.note--root {
		background: var(--c-dominant);
		border-color: var(--c-dominant);
		color: var(--color-white);
	}

	.kbd {
		display: block;
		width: 100%;
		max-width: 480px;
		height: auto;
	}
	.wkey {
		fill: var(--color-white);
		stroke: var(--color-grey-200);
		stroke-width: 1;
	}
	.bkey {
		fill: var(--color-black);
	}

	.legend {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		color: var(--color-text-faint);
	}
	.legend__dot {
		width: 10px;
		height: 10px;
		border-radius: var(--radius-pill);
		display: inline-block;
		margin-left: var(--space-3);
	}
	.legend__dot--root {
		background: var(--c-dominant);
		margin-left: 0;
	}
	.legend__dot--scale {
		background: var(--c-major);
	}
</style>
