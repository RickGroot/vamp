<script lang="ts">
	import type { Bar } from '$lib/model/types';
	import type { KeyInfo } from '$lib/model/key';
	import { progression, MAX_SLOTS_PER_BAR } from '$lib/stores/progression.svelte';
	import ChordSlot from './ChordSlot.svelte';

	interface Props {
		barIndex: number;
		bar: Bar;
		/** Global index of this bar's first slot (for active-slot matching). */
		baseGlobalIndex: number;
		activeSlot: number | null;
		canRemoveBar: boolean;
		/** Whether a sub-range loop is active (some bars excluded). */
		loopActive: boolean;
		/** Whether this bar is inside the current loop. */
		inLoop: boolean;
		/** Inferred key, for the Roman-numeral overlay. */
		keyInfo: KeyInfo;
		/** Whether playback is currently on this bar (the playhead). */
		playing: boolean;
	}

	let {
		barIndex,
		bar,
		baseGlobalIndex,
		activeSlot,
		canRemoveBar,
		loopActive,
		inLoop,
		keyInfo,
		playing
	}: Props = $props();

	const canAddSlot = $derived(bar.slots.length < MAX_SLOTS_PER_BAR);

	// Stable per-bar animation phase (art mode) — seeded from the bar id so each
	// bar's colour wash drifts a little differently (generative feel).
	const artDelay = $derived.by(() => {
		let h = 0;
		for (let i = 0; i < bar.id.length; i++) h = (h * 31 + bar.id.charCodeAt(i)) >>> 0;
		return (((h % 1000) / 1000) * 9).toFixed(2);
	});

	let dragOver = $state(false);

	// Custom MIME type so only bar drags are accepted — a file/text/link dropped
	// from outside used to parse '' as bar 0 and silently move a bar.
	const BAR_DRAG_TYPE = 'application/x-vamp-bar';
	const isBarDrag = (event: DragEvent) => event.dataTransfer?.types.includes(BAR_DRAG_TYPE) ?? false;

	function onDragStart(event: DragEvent) {
		event.dataTransfer?.setData(BAR_DRAG_TYPE, String(barIndex));
		if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
	}
	function onDragOver(event: DragEvent) {
		if (!isBarDrag(event)) return; // don't advertise foreign drags as droppable
		event.preventDefault();
		dragOver = true;
	}
	function onDrop(event: DragEvent) {
		if (!isBarDrag(event)) return;
		event.preventDefault();
		dragOver = false;
		const from = Number(event.dataTransfer?.getData(BAR_DRAG_TYPE));
		if (Number.isInteger(from)) progression.moveBar(from, barIndex);
	}
</script>

<div
	class="bar"
	class:bar--in-loop={loopActive && inLoop}
	class:bar--out-loop={loopActive && !inLoop}
	class:bar--playing={playing}
	class:bar--dragover={dragOver}
	style="--art-delay: {artDelay}s"
	ondragover={onDragOver}
	ondragleave={() => (dragOver = false)}
	ondrop={onDrop}
	role="group"
>
	<header class="bar__head">
		<!-- The grip is mouse/touch-only; keyboard & AT users get the real move
		     buttons below instead, so it's hidden from the accessibility tree. -->
		<span
			class="bar__grip"
			draggable="true"
			ondragstart={onDragStart}
			aria-hidden="true"
			title="Drag to reorder">⠿</span
		>
		<span class="visually-hidden-buttons">
			<button
				class="visually-hidden"
				type="button"
				disabled={barIndex === 0}
				onclick={() => progression.moveBar(barIndex, barIndex - 1)}
				>Move bar {barIndex + 1} left</button
			>
			<button
				class="visually-hidden"
				type="button"
				onclick={() => progression.moveBar(barIndex, barIndex + 1)}
				>Move bar {barIndex + 1} right</button
			>
		</span>
		<span class="label bar__num">{barIndex + 1}</span>
		<div class="bar__actions">
			<button
				class="bar__action"
				type="button"
				title="Add a chord (split the bar)"
				disabled={!canAddSlot}
				onclick={() => progression.addSlot(barIndex)}>+ chord</button
			>
			{#if canRemoveBar}
				<button
					class="bar__action bar__action--remove"
					type="button"
					title="Remove bar"
					aria-label={`Remove bar ${barIndex + 1}`}
					onclick={() => progression.removeBar(barIndex)}>×</button
				>
			{/if}
		</div>
	</header>

	<div class="bar__slots">
		{#each bar.slots as slot, slotIndex (slot.id)}
			<ChordSlot
				{barIndex}
				{slotIndex}
				chord={slot.chord}
				{keyInfo}
				active={activeSlot === baseGlobalIndex + slotIndex}
				canRemove={bar.slots.length > 1}
			/>
		{/each}
	</div>
</div>

<style lang="scss">
	.bar {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		border: var(--border-hairline);
		background: var(--color-white);
		padding: var(--space-3);
		transition:
			opacity var(--motion-standard) var(--motion-ease-out),
			box-shadow var(--motion-fast) var(--motion-ease-out);
	}

	/* In a sub-range loop: highlight the looped bars, fade the rest. */
	.bar--in-loop {
		box-shadow: inset 0 3px 0 var(--c-major);
	}

	.bar--out-loop {
		opacity: 0.45;
	}

	/* Playhead: the bar currently sounding. */
	.bar--playing {
		box-shadow: 0 0 0 2px var(--c-major);
	}

	.bar--dragover {
		border-color: var(--color-accent);
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-accent) 40%, transparent);
	}

	.bar__head {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-height: 20px;
	}

	.visually-hidden-buttons {
		display: contents;
	}

	/* Off-screen for sighted mouse users; pops in when keyboard-focused. */
	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		padding: 0;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
		border: 0;

		&:focus-visible {
			position: static;
			width: auto;
			height: auto;
			margin: 0;
			padding: 0 var(--space-1);
			overflow: visible;
			clip-path: none;
			white-space: nowrap;
			font-size: 0.65rem;
			background: var(--color-white);
			border: 1px solid var(--color-accent);
		}
	}

	.bar__grip {
		cursor: grab;
		color: var(--color-grey-400);
		font-size: 0.85rem;
		line-height: 1;
		user-select: none;

		&:hover {
			color: var(--color-black);
		}

		&:active {
			cursor: grabbing;
		}
	}

	.bar__num {
		color: var(--color-text-faint);
	}

	.bar__actions {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-left: auto;
	}

	.bar__action {
		border: 0;
		background: transparent;
		padding: var(--space-1) var(--space-2);
		font-family: inherit;
		font-size: 0.6875rem;
		font-weight: 400;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-text-muted);

		&:hover:not(:disabled) {
			color: var(--color-black);
		}

		&:disabled {
			color: var(--color-grey-400);
			cursor: not-allowed;
		}

		&--remove {
			font-size: 1rem;
			letter-spacing: 0;
		}
	}

	.bar__slots {
		display: flex;
		gap: var(--space-2);
	}
</style>
