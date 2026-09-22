<script lang="ts">
	import { progression } from '$lib/stores/progression.svelte';
	import { view } from '$lib/stores/view.svelte';
	import { resolveLoopRange } from '$lib/model/time';
	import { flattenSlots } from '$lib/model/slots';
	import { inferKey } from '$lib/model/key';
	import BarCard from '$lib/components/BarCard.svelte';
	import TransportBar from '$lib/components/TransportBar.svelte';
	import PresetMenu from '$lib/components/PresetMenu.svelte';
	import ExampleMenu from '$lib/components/ExampleMenu.svelte';
	import NotationView from '$lib/components/NotationView.svelte';
	import SuggestMenu from '$lib/components/SuggestMenu.svelte';
	import FileMenu from '$lib/components/FileMenu.svelte';
	import ShareMenu from '$lib/components/ShareMenu.svelte';
	import BandPanel from '$lib/components/BandPanel.svelte';
	import PracticePanel from '$lib/components/PracticePanel.svelte';
	import ScalesSection from '$lib/components/ScalesSection.svelte';
	import PatternInsights from '$lib/components/PatternInsights.svelte';
	import { detectProgressions } from '$lib/model/analysis';

	// Global index of each bar's first slot, for active-slot matching.
	const baseIndices = $derived.by(() => {
		let acc = 0;
		return progression.current.bars.map((bar) => {
			const start = acc;
			acc += bar.slots.length;
			return start;
		});
	});

	const loopActive = $derived(progression.current.loopRange !== null);
	const loopRange = $derived(resolveLoopRange(progression.current));
	const keyInfo = $derived(
		inferKey(flattenSlots(progression.current.bars).map((f) => f.slot.chord))
	);
	// Recognised named progressions — pure derived state, recomputed per edit
	// (a few thousand ops for a 32-bar song; no debounce needed).
	const detections = $derived(detectProgressions(progression.current.bars, keyInfo));
	// Bar range covered by a hovered/focused insight chip (transient UI state —
	// deliberately NOT in a store or undo history).
	let hint = $state<{ start: number; end: number } | null>(null);

	// Tab title reflects the progression name once it's been named.
	const pageTitle = $derived.by(() => {
		const n = progression.current.name?.trim();
		return n && n !== 'Untitled progression' ? `${n} · Vamp` : 'Vamp — Chord Sketchpad & Improv Trainer';
	});

	// Which bar the playhead is on (contains the active slot).
	const playingBar = $derived.by(() => {
		const active = progression.activeSlot;
		if (active === null) return -1;
		return progression.current.bars.findIndex((bar, i) => {
			const start = baseIndices[i];
			return active >= start && active < start + bar.slots.length;
		});
	});
</script>

<svelte:head>
	<title>{pageTitle}</title>
</svelte:head>

<main class="editor">
	<div class="toolbar">
		<input
			class="title"
			type="text"
			value={progression.current.name}
			aria-label="Progression name"
			oninput={(e) => progression.setName((e.target as HTMLInputElement).value)}
		/>
		<div class="toolbar__actions">
			<button
				class="bar-btn"
				type="button"
				disabled={!progression.canUndo}
				onclick={() => progression.undo()}>Undo</button
			>
			<button
				class="bar-btn"
				type="button"
				disabled={!progression.canRedo}
				onclick={() => progression.redo()}>Redo</button
			>
			<FileMenu />
			<ShareMenu />
		</div>
	</div>

	<TransportBar />

	<div class="compose-bar">
		<PresetMenu />
		<ExampleMenu />
		<SuggestMenu {keyInfo} />
		<button class="inspire" type="button" onclick={() => progression.inspire()}>Inspire me</button>
		<span class="compose-bar__spacer"></span>
		<button
			class="bar-btn"
			class:bar-btn--on={view.showRoman}
			type="button"
			aria-pressed={view.showRoman}
			onclick={() => view.setShowRoman(!view.showRoman)}
		>
			Roman numerals
		</button>
	</div>

	<PatternInsights {detections} {keyInfo} onhint={(r) => (hint = r)} />

	<section class="bars" aria-label="Bars">
		{#each progression.current.bars as bar, barIndex (bar.id)}
			<BarCard
				{barIndex}
				{bar}
				baseGlobalIndex={baseIndices[barIndex]}
				activeSlot={progression.activeSlot}
				canRemoveBar={progression.current.bars.length > 1}
				hinted={hint !== null && barIndex >= hint.start && barIndex <= hint.end}
				{loopActive}
				inLoop={barIndex >= loopRange.start && barIndex <= loopRange.end}
				{keyInfo}
				playing={barIndex === playingBar}
			/>
		{/each}

		<button class="add-bar" type="button" onclick={() => progression.addBar()}> + bar </button>
	</section>

	<NotationView />

	<ScalesSection />

	<BandPanel />

	<PracticePanel defaultRoot={keyInfo.tonic} />
</main>

<style lang="scss">
	.editor {
		max-width: 1100px;
		margin: 0 auto;
		padding: var(--space-12) var(--space-6) var(--space-24);
	}

	.toolbar {
		display: flex;
		align-items: center;
		gap: var(--space-4);
		flex-wrap: wrap;
	}

	.toolbar__actions {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex: 0 0 auto;
	}

	.title {
		flex: 1 1 280px;
		min-width: 0;
		border: 0;
		background: transparent;
		font-family: inherit;
		font-weight: 300;
		font-size: 2rem;
		letter-spacing: -0.02em;
		color: var(--color-text);
		padding: 0 0 var(--space-2);

		&::placeholder {
			color: var(--color-grey-400);
		}

		&:focus {
			outline: none;
			border-bottom: 1px solid var(--color-accent);
		}
	}

	.compose-bar {
		display: flex;
		align-items: center;
		gap: var(--space-4);
		margin-top: var(--space-4);
		flex-wrap: wrap;
	}

	.compose-bar__spacer {
		flex: 1 1 auto;
	}

	.inspire {
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
			background: var(--grad-play);
			border-color: transparent;
			color: var(--color-white);
		}
	}

	.bars {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
		gap: var(--space-4);
		margin-top: var(--space-6);
	}

	.add-bar {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 96px;
		border: 1px dashed var(--color-grey-400);
		background: transparent;
		font-family: inherit;
		font-size: 0.6875rem;
		font-weight: 400;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-text-muted);
		transition:
			border-color var(--motion-fast) var(--motion-ease-out),
			color var(--motion-fast) var(--motion-ease-out);

		&:hover {
			border-color: var(--color-black);
			color: var(--color-black);
		}
	}
</style>
