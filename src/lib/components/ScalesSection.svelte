<script lang="ts">
	import { scales, type ScaleView } from '$lib/stores/scales.svelte';
	import { progression } from '$lib/stores/progression.svelte';
	import { view } from '$lib/stores/view.svelte';
	import { SCALE_TYPES, SCALE_ROOTS, getScaleInfo } from '$lib/model/scales';
	import { displayChord, concertFromDisplay } from '$lib/audio/transpose';
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
	// scales.root is CONCERT pitch (the chord shortcut passes the stored concert
	// symbol, and playback must sound concert like the chords). Everything SHOWN,
	// though, is transposed to the selected instrument's WRITTEN pitch — exactly
	// like the chord slots — so pressing a chord you read as "C6" opens the scale
	// on C, not its concert Bb. Playback below still uses the concert `info`.
	const displayRoot = $derived(displayChord(scales.root, view.offset));
	const displayInfo = $derived(view.offset === 0 ? info : getScaleInfo(displayRoot, scales.type));
	// A written root outside the flat-spelled SCALE_ROOTS list (e.g. F#) gets a
	// synthetic option so the select reflects it instead of going blank.
	const customRoot = $derived(SCALE_ROOTS.includes(displayRoot) ? null : displayRoot);

	// ---- keyboard layout (two octaves from C) ----
	const WHITE_PCS = [0, 2, 4, 5, 7, 9, 11];
	const BLACK_AFTER = [0, 1, 3, 4, 5]; // white degrees with a black key to their right
	const N_WHITE = WHITE_PCS.length * 2;
	const W = 26;
	const H = 96;
	const BW = 16;
	const BH = 60;

	const whiteKeys = $derived.by(() => {
		const set = new Set(displayInfo.pcs);
		return Array.from({ length: N_WHITE }, (_, i) => {
			const pc = WHITE_PCS[i % 7];
			return { x: i * W, pc, inScale: set.has(pc), isRoot: pc === displayInfo.rootPc };
		});
	});
	const blackKeys = $derived.by(() => {
		const set = new Set(displayInfo.pcs);
		const keys: { x: number; pc: number; inScale: boolean; isRoot: boolean }[] = [];
		for (let i = 0; i < N_WHITE - 1; i++) {
			const deg = i % 7;
			if (!BLACK_AFTER.includes(deg)) continue;
			const pc = (WHITE_PCS[deg] + 1) % 12;
			keys.push({ x: (i + 1) * W - BW / 2, pc, inScale: set.has(pc), isRoot: pc === displayInfo.rootPc });
		}
		return keys;
	});

	// Sounds CONCERT pitch (like the chords) even though the display is written.
	function play() {
		void playScale(scaleMidis(scales.root, info.pcs, info.rootPc), progression.current.instrument);
	}

	let sectionEl = $state<HTMLElement>();
	// Scroll into view when a chord shortcut requests it.
	$effect(() => {
		if (scales.pulse > 0)
			sectionEl?.scrollIntoView({
				behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
				block: 'start'
			});
	});
</script>

<section class="scales" aria-label="Scales" bind:this={sectionEl}>
	<h2 class="sec-head">
		<button
			class="sec-toggle"
			type="button"
			aria-expanded={scales.open}
			onclick={() => scales.setOpen(!scales.open)}
		>
			<svg class="chev" class:chev--open={scales.open} viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
			<span class="sec-title">Scales</span>
			<span class="sec-hint">{displayInfo.name}</span>
		</button>
	</h2>

	{#if scales.open}
		<div class="scales__body">
			<div class="controls">
				<div class="field">
					<label class="label" for="scale-root">Root</label>
					<select
						id="scale-root"
						class="sel"
						value={displayRoot}
						onchange={(e) =>
							scales.setRoot(concertFromDisplay((e.target as HTMLSelectElement).value, view.offset))}
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
					<span class="label">Fits {displayChord(scales.suggestedFor, view.offset)}</span>
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
				{#each displayInfo.notes as note, i (i)}
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
				<ScaleStaff notes={displayInfo.notes} />
			{:else if scales.display === 'fretboard'}
				<ScaleFretboard pcs={displayInfo.pcs} rootPc={displayInfo.rootPc} />
			{:else}
				<svg class="kbd" viewBox="0 0 {N_WHITE * W} {H}" role="img" aria-label="{displayInfo.name} on a keyboard">
					{#each whiteKeys as k (k.x)}
						<rect class="wkey" x={k.x + 0.5} y="0" width={W - 1} height={H} rx="3" />
						{#if k.inScale}
							<circle class="dot" class:dot--root={k.isRoot} cx={k.x + W / 2} cy={H - 13} r="5.5" />
						{/if}
					{/each}
					{#each blackKeys as k (k.x)}
						<rect class="bkey" x={k.x} y="0" width={BW} height={BH} rx="2.5" />
						{#if k.inScale}
							<circle class="dot dot--on-dark" class:dot--root={k.isRoot} cx={k.x + BW / 2} cy={BH - 9} r="4" />
						{/if}
					{/each}
				</svg>
			{/if}

			<p class="legend hint">
				<span class="legend__dot legend__dot--root"></span> root
				<span class="legend__dot legend__dot--scale"></span> scale tone
			</p>
		</div>
	{/if}
</section>

<style lang="scss">
	.scales {
		margin-top: var(--space-8);
		border-top: var(--rule-heavy) solid var(--ink);
		padding-top: var(--space-4);
	}

	.scales__body {
		margin-top: var(--space-4);
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
			border-bottom-color: var(--ink);
			box-shadow: inset 0 -2px 0 var(--ink);
		}
	}
	.sel--wide {
		min-width: 13ch;
	}

	.play-scale {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		min-height: 36px;
		border: 1px solid var(--edge);
		border-radius: var(--radius);
		background: var(--paper);
		padding: 0 var(--space-4);
		font-family: inherit;
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--ink);

		&:hover {
			border-color: var(--ink);
			background: var(--wash);
		}
	}

	/* Segmented control: one pressed tab, inked in. */
	.viewtoggle {
		display: inline-flex;
		align-self: flex-start;
		border: 1px solid var(--edge);
		border-radius: var(--radius);
		overflow: hidden;
	}
	.vt {
		min-height: 36px;
		border: 0;
		border-right: 1px solid var(--edge);
		background: var(--paper);
		padding: 0 var(--space-3);
		font-family: inherit;
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--ink-2);

		&:last-child {
			border-right: 0;
		}
		&:hover {
			color: var(--ink);
			background: var(--wash);
		}
		&--on,
		&--on:hover {
			background: var(--spot);
			color: var(--on-spot);
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
			background: var(--spot);
			border-color: var(--spot);
			color: var(--on-spot);
		}
	}

	.notes {
		display: flex;
		gap: var(--space-2);
		flex-wrap: wrap;
	}
	/* The scale spelled out, set like the chords above it. */
	.note {
		min-width: 2.6rem;
		text-align: center;
		padding: var(--space-1) var(--space-2);
		border: var(--rule-heavy) solid var(--ink);
		border-radius: 0;
		background: var(--ground);
		font-family: var(--font-display);
		font-stretch: 72%;
		font-weight: 800;
		font-size: 1.375rem;
		line-height: 1.2;
		color: var(--ink);
	}
	.note--root {
		background: var(--ink);
		color: var(--ground);
	}

	.kbd {
		display: block;
		width: 100%;
		max-width: 480px;
		height: auto;
	}
	.wkey {
		fill: var(--key-light);
		stroke: var(--edge);
		stroke-width: 1;
	}
	.bkey {
		fill: var(--key-dark);
	}

	/* Scale tones are ink dots; the root is a ring — shape, not colour. */
	.dot {
		fill: var(--key-dark);
	}
	.dot--root {
		fill: var(--key-light);
		stroke: var(--key-dark);
		stroke-width: 2;
	}
	.dot--on-dark {
		fill: var(--key-light);
	}
	.dot--on-dark.dot--root {
		fill: var(--key-dark);
		stroke: var(--key-light);
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
		border-radius: 50%;
		display: inline-block;
		margin-left: var(--space-3);
	}
	.legend__dot--root {
		border: 2px solid var(--ink);
		margin-left: 0;
	}
	.legend__dot--scale {
		background: var(--ink);
	}
</style>
