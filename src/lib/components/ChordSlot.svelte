<script lang="ts">
	import { isValidChordSymbol } from '$lib/audio/chord';
	import { classifyChord, filterChordsDisplay, type ChordSuggestion } from '$lib/model/chords';
	import { displayChord, concertFromDisplay } from '$lib/audio/transpose';
	import { romanNumeral, type KeyInfo } from '$lib/model/key';
	import Numeral from './Numeral.svelte';
	import { progression } from '$lib/stores/progression.svelte';
	import { view } from '$lib/stores/view.svelte';
	import { scales } from '$lib/stores/scales.svelte';
	import ChordSymbol from './ChordSymbol.svelte';

	interface Props {
		barIndex: number;
		slotIndex: number;
		/** Length in beats — the slot's share of the measure's width. */
		beats?: number;
		/** What an empty slot says (bar 1 of a blank song invites a first chord). */
		placeholder?: string;
		/** Concert-pitch chord symbol (the stored value). */
		chord: string;
		keyInfo: KeyInfo;
		active?: boolean;
		canRemove?: boolean;
	}

	let {
		barIndex,
		slotIndex,
		beats = 1,
		placeholder = '–',
		chord,
		keyInfo,
		active = false,
		canRemove = false
	}: Props = $props();

	const roman = $derived(
		view.showRoman && chord.trim() !== '' && isValidChordSymbol(chord)
			? romanNumeral(chord, keyInfo)
			: ''
	);

	let open = $state(false);
	let highlighted = $state(-1);
	let focused = $state(false);
	let draft = $state('');
	let menuEl: HTMLUListElement | undefined = $state();

	// What the user reads: written pitch for the selected instrument. While focused
	// we show the live draft so typing doesn't get re-spelled under the cursor.
	const displayValue = $derived(displayChord(chord, view.offset));
	const shown = $derived(focused ? draft : displayValue);

	const invalid = $derived(shown.trim() !== '' && !isValidChordSymbol(shown));
	// Colour by the (transposition-independent) chord quality.
	const family = $derived(
		chord.trim() !== '' && isValidChordSymbol(chord) ? classifyChord(chord) : null
	);
	const suggestions: ChordSuggestion[] = $derived(open ? filterChordsDisplay(shown, view.offset) : []);
	const listId = $derived(`chords-${barIndex}-${slotIndex}`);

	function storeFromDraft() {
		progression.setSlotChord(barIndex, slotIndex, concertFromDisplay(draft, view.offset));
	}

	function onInput(event: Event) {
		draft = (event.target as HTMLInputElement).value;
		storeFromDraft();
		open = true;
		highlighted = -1;
	}

	function selectChord(suggestion: ChordSuggestion) {
		draft = suggestion.display;
		progression.setSlotChord(barIndex, slotIndex, suggestion.concert);
		open = false;
		highlighted = -1;
	}

	function scrollHighlightedIntoView() {
		menuEl?.querySelector(`[data-i="${highlighted}"]`)?.scrollIntoView({ block: 'nearest' });
	}

	function onKeydown(event: KeyboardEvent) {
		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault();
				open = true;
				highlighted = Math.min(highlighted + 1, suggestions.length - 1);
				scrollHighlightedIntoView();
				break;
			case 'ArrowUp':
				event.preventDefault();
				highlighted = Math.max(highlighted - 1, 0);
				scrollHighlightedIntoView();
				break;
			case 'Enter':
				if (open && highlighted >= 0 && suggestions[highlighted]) {
					event.preventDefault();
					selectChord(suggestions[highlighted]);
				} else {
					open = false;
				}
				break;
			case 'Escape':
				if (open) {
					event.stopPropagation();
					open = false;
					highlighted = -1;
				}
				break;
			case 'Tab':
				open = false;
				break;
		}
	}

	function onFocus() {
		focused = true;
		draft = displayValue;
		open = true;
	}

	function onFocusOut(event: FocusEvent) {
		const next = event.relatedTarget as Node | null;
		if (!event.currentTarget || !(event.currentTarget as HTMLElement).contains(next)) {
			focused = false;
			open = false;
			highlighted = -1;
		}
	}
</script>

<div
	class="slot"
	class:slot--active={active}
	class:slot--invalid={invalid}
	class:slot--filled={!!family}
	class:slot--faced={!!family && !focused}
	style:--q={family ? `var(--c-${family})` : undefined}
	style:flex-grow={beats}
	onfocusout={onFocusOut}
>
	<input
		class="slot__input"
		type="text"
		role="combobox"
		aria-expanded={open}
		aria-controls={listId}
		aria-autocomplete="list"
		aria-activedescendant={open && highlighted >= 0 ? `${listId}-opt-${highlighted}` : undefined}
		autocomplete="off"
		autocapitalize="off"
		spellcheck="false"
		value={shown}
		{placeholder}
		aria-label={`Chord, bar ${barIndex + 1}, position ${slotIndex + 1}`}
		oninput={onInput}
		onfocus={onFocus}
		onkeydown={onKeydown}
	/>

	<!-- The chord as a Real Book prints it, laid over the field while you are not
	     typing in it (the input still holds the text, for editing and for AT). -->
	{#if family && !focused}
		<span class="slot__face" aria-hidden="true"><ChordSymbol symbol={displayValue} /></span>
	{/if}

	{#if family}
		<button
			class="slot__scale"
			type="button"
			title={`Scales for ${displayValue}`}
			aria-label={`Show scales for ${displayValue}`}
			onclick={() => scales.showForChord(chord)}
		>
			<svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true">
				<rect x="1" y="9" width="3" height="5" rx="1" />
				<rect x="6.5" y="6" width="3" height="8" rx="1" />
				<rect x="12" y="3" width="3" height="11" rx="1" />
			</svg>
		</button>
	{/if}

	{#if roman}<span class="slot__roman"><Numeral numeral={roman} /></span>{/if}

	{#if canRemove}
		<button
			class="slot__remove"
			type="button"
			title="Remove chord"
			aria-label="Remove chord"
			onclick={() => progression.removeSlot(barIndex, slotIndex)}>×</button
		>
	{/if}

	{#if open && suggestions.length > 0}
		<ul class="menu" id={listId} role="listbox" bind:this={menuEl}>
			{#each suggestions as suggestion, i (suggestion.display)}
				<li role="presentation">
					<button
						type="button"
						class="opt"
						class:opt--hl={i === highlighted}
						id={`${listId}-opt-${i}`}
						role="option"
						aria-selected={i === highlighted}
						data-i={i}
						style={`--q: var(--c-${classifyChord(suggestion.concert)})`}
						onmousedown={(e) => e.preventDefault()}
						onclick={() => selectChord(suggestion)}
					>
						<span class="dot"></span>
						<span class="opt__name"><ChordSymbol symbol={suggestion.display} /></span>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style lang="scss">
	/* A chord written into the measure under a tab of its ink. The chord sounding
	   now is a solid block of that ink with --on-pigment text — the block you
	   can read from the stand. */
	.slot {
		position: relative;
		flex: 1 1 0;
		min-width: 0;
		/* The face sizes itself to the slot (cqi), so a quarter-bar never clips. */
		container-type: inline-size;
		border-top: 6px solid var(--rule);
		transition: background-color var(--motion-fast) var(--motion-ease-out);

		&:hover {
			background-color: var(--wash);
		}

		&--filled {
			border-top-color: var(--q);
		}

		/* Sounding now. A rest sounding is a block of ink. */
		&--active,
		&--active:hover {
			background: var(--q, var(--ink));
			border-top-color: var(--q, var(--ink));

			.slot__input,
			.slot__roman,
			.slot__face {
				color: var(--on-pigment);
			}

			.slot__input::placeholder {
				color: var(--ground);
			}
		}
	}

	.slot__input {
		width: 100%;
		min-height: 56px;
		border: 0;
		border-radius: 0;
		background: transparent;
		padding: var(--space-3) var(--space-2) var(--space-2);
		font-family: var(--font-display);
		font-stretch: 72%;
		font-weight: 800;
		font-size: min(2rem, 26cqi);
		line-height: 1.1;
		color: var(--ink);
		text-align: left;
		text-overflow: ellipsis;

		&::placeholder {
			color: var(--ink-3);
		}

		&:focus {
			outline: var(--rule-heavy) solid var(--ink);
			outline-offset: -2px;
		}
	}

	/* The set face sits exactly over the input text; the input itself goes
	   transparent behind it until you click in. */
	.slot--faced .slot__input {
		color: transparent;
	}

	.slot__face {
		position: absolute;
		left: var(--space-2);
		right: var(--space-2);
		top: var(--space-3);
		font-size: min(2.25rem, 30cqi);
		line-height: 1;
		color: var(--ink);
		pointer-events: none;
		overflow: hidden;
	}

	/* The invitation in bar 1 of a blank song is readable text, not a mark. */
	.slot__input:placeholder-shown:not(:focus) {
		font-size: 1.5rem;
	}

	/* Not a chord we can read: danger ink and a wavy underline, like a typo. */
	.slot--invalid .slot__input {
		color: var(--danger);
		text-decoration: underline wavy var(--danger);
		text-decoration-thickness: 1px;
		text-underline-offset: 5px;
	}

	.slot__roman {
		display: block;
		padding: 0 var(--space-2) var(--space-2);
		font-size: 0.75rem;
		font-weight: 800;
		letter-spacing: 0.04em;
		color: var(--ink-2);
	}

	.slot__scale,
	.slot__remove {
		position: absolute;
		top: 2px;
		width: 24px;
		height: 24px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 0;
		border-radius: 0;
		background: transparent;
		color: var(--ink-2);
		cursor: pointer;
		z-index: 1;
		transition:
			opacity var(--motion-fast) var(--motion-ease-out),
			color var(--motion-fast) var(--motion-ease-out);

		&:hover {
			color: var(--ground);
			background: var(--ink);
		}
	}

	.slot__scale {
		right: 26px;
	}

	.slot--active .slot__scale,
	.slot--active .slot__remove {
		color: var(--on-pigment);
	}

	.slot__remove {
		right: 2px;
		font-size: 1rem;
		font-weight: 800;
		line-height: 1;
	}

	/* Touch shows the slot tools all the time, so they get their own strip
	   above the chord instead of sitting on it. */
	@media (pointer: coarse) {
		.slot__input {
			padding-top: 40px;
		}

		.slot__face {
			top: 40px;
		}

		.slot__scale,
		.slot__remove {
			width: 34px;
			height: 34px;
		}

		.slot__scale {
			right: 38px;
		}
	}

	/* Slot tools appear with the slot on hover-capable devices. */
	@media (hover: hover) and (pointer: fine) {
		.slot__scale,
		.slot__remove {
			opacity: 0;
		}

		.slot:hover .slot__scale,
		.slot:hover .slot__remove,
		.slot:focus-within .slot__scale,
		.slot:focus-within .slot__remove {
			opacity: 1;
		}
	}

	.menu {
		position: absolute;
		top: 100%;
		left: 0;
		min-width: max(100%, 180px);
		margin: 4px 0 0;
		padding: var(--space-1) 0;
		max-height: 260px;
		overflow-y: auto;
		list-style: none;
		background: var(--paper);
		border: var(--rule-heavy) solid var(--ink);
		border-radius: 0;
		box-shadow: 0 14px 32px var(--shadow);
		z-index: 50;
	}

	.opt {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		width: 100%;
		min-height: 38px;
		border: 0;
		border-radius: 0;
		background: transparent;
		padding: var(--space-1) var(--space-3);
		font-size: 1.375rem;
		text-align: left;
		color: var(--ink);

		&:hover,
		&--hl {
			background: var(--wash);
		}
	}

	/* A square of the chord's ink beside each suggestion. */
	.dot {
		width: 10px;
		height: 10px;
		background: var(--q);
		flex: 0 0 auto;
	}
</style>
