<script lang="ts">
	import type { Bar } from '$lib/model/types';
	import type { KeyInfo } from '$lib/model/key';
	import { barBeats } from '$lib/model/time';
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
		/** First / last bar of an active sub-range loop — drawn as repeat signs. */
		loopStart?: boolean;
		loopEnd?: boolean;
		/** Last bar of the song — closed with a final barline. */
		final?: boolean;
		/** Inferred key, for the Roman-numeral overlay. */
		keyInfo: KeyInfo;
		/** Whether playback is currently on this bar (the playhead). */
		playing: boolean;
		/** Hovered pattern-insight chip covers this bar (transient highlight). */
		hinted?: boolean;
		/** Bar 1 of a blank song: its first slot invites a chord. */
		invite?: boolean;
	}

	let {
		barIndex,
		bar,
		baseGlobalIndex,
		activeSlot,
		canRemoveBar,
		loopActive,
		inLoop,
		loopStart = false,
		loopEnd = false,
		final = false,
		keyInfo,
		playing,
		hinted = false,
		invite = false
	}: Props = $props();

	const canAddSlot = $derived(bar.slots.length < MAX_SLOTS_PER_BAR);
	// One rhythm slash per beat of the meter, under the chords — how a chord
	// chart shows time. Independent of how the bar is split into chords.
	const beats = $derived(Math.max(1, Math.min(16, barBeats(progression.current.timeSignature))));

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
	class:bar--loop-start={loopStart}
	class:bar--loop-end={loopEnd}
	class:bar--final={final && !loopEnd}
	class:bar--playing={playing}
	class:bar--hinted={hinted}
	class:bar--dragover={dragOver}
	ondragover={onDragOver}
	ondragleave={() => (dragOver = false)}
	ondrop={onDrop}
	role="group"
	aria-label={`Bar ${barIndex + 1}${loopStart ? ', loop starts' : ''}${loopEnd ? ', loop ends' : ''}`}
>
	<header class="bar__head">
		<span class="bar__num">{barIndex + 1}</span>
		<!-- The grip is mouse/touch-only; keyboard & AT users get the real move
		     buttons below instead, so it's hidden from the accessibility tree. -->
		<span
			class="bar__grip"
			draggable="true"
			ondragstart={onDragStart}
			aria-hidden="true"
			title="Drag to reorder"
		>
			<svg viewBox="0 0 10 16" width="8" height="13" fill="currentColor">
				<circle cx="2.5" cy="3" r="1.3" /><circle cx="7.5" cy="3" r="1.3" />
				<circle cx="2.5" cy="8" r="1.3" /><circle cx="7.5" cy="8" r="1.3" />
				<circle cx="2.5" cy="13" r="1.3" /><circle cx="7.5" cy="13" r="1.3" />
			</svg>
		</span>
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
				disabled={barIndex === progression.current.bars.length - 1}
				onclick={() => progression.moveBar(barIndex, barIndex + 1)}
				>Move bar {barIndex + 1} right</button
			>
		</span>
		<div class="bar__actions">
			<button
				class="bar__action"
				type="button"
				title="Add a chord (split the bar)"
				aria-label={`Add a chord to bar ${barIndex + 1}`}
				disabled={!canAddSlot}
				onclick={() => progression.addSlot(barIndex)}
			>
				<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"
					><path d="M8 2v12M2 8h12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg
				>
				<span class="bar__action-text">Chord</span>
			</button>
			{#if canRemoveBar}
				<button
					class="bar__action bar__action--remove"
					type="button"
					title="Remove bar"
					aria-label={`Remove bar ${barIndex + 1}`}
					onclick={() => progression.removeBar(barIndex)}
				>
					<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"
						><path
							d="M4 4l8 8M12 4l-8 8"
							stroke="currentColor"
							stroke-width="1.6"
							stroke-linecap="round"
						/></svg
					>
				</button>
			{/if}
		</div>
	</header>

	<div class="bar__slots">
		{#each bar.slots as slot, slotIndex (slot.id)}
			<ChordSlot
				{barIndex}
				{slotIndex}
				chord={slot.chord}
				beats={slot.beats}
				placeholder={invite && slotIndex === 0 ? 'try Dm7' : '–'}
				{keyInfo}
				active={activeSlot === baseGlobalIndex + slotIndex}
				canRemove={bar.slots.length > 1}
			/>
		{/each}
	</div>

	<div class="bar__staff" aria-hidden="true">
		{#each { length: beats } as _, i (i)}
			<span class="slash"></span>
		{/each}
	</div>
</div>

<style lang="scss">
	/* A measure on the chart: heavy ink barlines left and right (neighbours
	   overlap so a shared barline stays one line), chords above a row of rhythm
	   slashes. No box, no card — a printed lead sheet. */
	.bar {
		--barline: var(--ink);
		--bw: var(--rule-heavy);
		position: relative;
		display: flex;
		flex-direction: column;
		min-width: 0;
		margin-right: calc(-1 * var(--bw));
		border-left: var(--bw) solid var(--barline);
		border-right: var(--bw) solid var(--barline);
		padding: 0 var(--space-2) var(--space-2);
		transition:
			opacity var(--motion-standard) var(--motion-ease-out),
			background-color var(--motion-fast) var(--motion-ease-out);
	}

	/* In a sub-range loop, the bars outside it recede. */
	.bar--out-loop {
		opacity: 0.4;
		filter: saturate(0);
	}

	/* Pattern-insight hover: the bars it names get a wash. */
	.bar--hinted {
		background: var(--wash);
	}

	.bar--dragover {
		outline: var(--rule-heavy) dashed var(--ink);
		outline-offset: -2px;
	}

	/* Repeat signs mark the loop: thick + thin barline and two dots, facing in. */
	.bar--loop-start {
		border-left: 7px solid var(--barline);
		padding-left: calc(var(--space-2) + 8px);

		&::before {
			content: "";
			position: absolute;
			left: 3px;
			top: 0;
			bottom: 0;
			width: var(--bw);
			background: var(--barline);
		}

		.bar__staff::before {
			left: calc(-1 * var(--space-2) + 1px);
		}
	}

	.bar--loop-end {
		border-right: 7px solid var(--barline);
		padding-right: calc(var(--space-2) + 8px);

		&::after {
			content: "";
			position: absolute;
			right: 3px;
			top: 0;
			bottom: 0;
			width: var(--bw);
			background: var(--barline);
		}

		.bar__staff::after {
			right: calc(-1 * var(--space-2) + 1px);
		}
	}

	/* Repeat dots, either side of the slashes. */
	.bar--loop-start .bar__staff::before,
	.bar--loop-end .bar__staff::after {
		content: "";
		position: absolute;
		top: 4px;
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: var(--barline);
		box-shadow: 0 8px 0 var(--barline);
	}

	/* Final barline at the end of the tune: thin + thick. */
	.bar--final {
		border-right: 7px solid var(--barline);
		padding-right: calc(var(--space-2) + 8px);

		&::after {
			content: "";
			position: absolute;
			right: 3px;
			top: 0;
			bottom: 0;
			width: var(--bw);
			background: var(--barline);
		}
	}

	.bar__head {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		min-height: 28px;
	}

	.bar__num {
		font-size: 0.6875rem;
		font-weight: 800;
		font-variant-numeric: tabular-nums;
		color: var(--ink-3);
		min-width: 1.5ch;
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
			padding: 0 var(--space-2);
			overflow: visible;
			clip-path: none;
			white-space: nowrap;
			font-size: 0.6875rem;
			font-weight: 800;
			text-transform: uppercase;
			color: var(--ink);
			background: var(--paper);
			border: var(--rule-heavy) solid var(--ink);
		}
	}

	.bar__grip {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 24px;
		cursor: grab;
		color: var(--ink-3);
		user-select: none;

		&:hover {
			color: var(--ink);
		}

		&:active {
			cursor: grabbing;
		}
	}

	.bar__actions {
		display: flex;
		align-items: center;
		gap: 2px;
		margin-left: auto;
	}

	.bar__action {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-1);
		min-width: 28px;
		height: 26px;
		border: 0;
		border-radius: 0;
		background: transparent;
		padding: 0 var(--space-2);
		font-family: inherit;
		font-size: 0.6875rem;
		font-weight: 800;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--ink-2);

		&:hover:not(:disabled) {
			background: var(--ink);
			color: var(--ground);
		}

		&:disabled {
			color: var(--ink-4);
			cursor: not-allowed;
		}

		&--remove {
			padding: 0;
		}
	}

	/* The bar tools stay out of the chart until you reach for the bar — on
	   devices that can hover. Touch always shows them, at a reachable size. */
	@media (hover: hover) and (pointer: fine) {
		.bar__grip,
		.bar__actions {
			opacity: 0;
			transition: opacity var(--motion-fast) var(--motion-ease-out);
		}

		.bar:hover .bar__grip,
		.bar:hover .bar__actions,
		.bar:focus-within .bar__actions {
			opacity: 1;
		}
	}

	@media (pointer: coarse) {
		.bar__head {
			min-height: 40px;
		}

		.bar__action {
			min-width: 40px;
			height: 40px;
		}

		.bar__action-text {
			display: none;
		}
	}

	.bar__slots {
		display: flex;
		gap: var(--space-1);
	}

	/* One heavy slash per beat, the way a chart shows time. */
	.bar__staff {
		position: relative;
		display: flex;
		justify-content: space-around;
		align-items: center;
		height: 18px;
		margin-top: var(--space-2);
	}

	.slash {
		width: 3px;
		height: 15px;
		background: var(--ink-2);
		transform: skewX(-22deg);
	}
</style>
