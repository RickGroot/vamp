<script lang="ts">
	import { isValidChordSymbol } from '$lib/audio/chord';
	import { classifyChord, filterChordsDisplay, type ChordSuggestion } from '$lib/model/chords';
	import { displayChord, concertFromDisplay } from '$lib/audio/transpose';
	import { romanNumeral, type KeyInfo } from '$lib/model/key';
	import { progression } from '$lib/stores/progression.svelte';
	import { view } from '$lib/stores/view.svelte';
	import { scales } from '$lib/stores/scales.svelte';

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
	style:--q={family ? `var(--c-${family})` : undefined}
	style:--wq={family ? `var(--w-${family})` : undefined}
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

	{#if roman}<span class="slot__roman">{roman}</span>{/if}

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
						<span class="opt__name">{suggestion.display}</span>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style lang="scss">
	/* A chord written into the measure on a wash of its colour (at dusk a glowing
	   outline instead — a dark fill of any hue turns brown), the symbol
	   hand-lettered on top, a stroke of the colour beneath. */
	.slot {
		position: relative;
		flex: 1 1 0;
		min-width: 0;
		border-radius: var(--radius);
		transition:
			background-color var(--motion-fast) var(--motion-ease-out),
			transform var(--motion-fast) var(--motion-ease-out);

		&:hover {
			background-color: var(--wash);
		}

		&--filled {
			background: var(--wq);
			box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--q) var(--ring), transparent);

			&:hover {
				background: color-mix(in oklab, var(--wq) 80%, var(--q));
			}
		}

		/* The stroke of full ink under a recognised chord. */
		&--filled::after {
			content: '';
			position: absolute;
			left: 20%;
			right: 20%;
			bottom: 5px;
			height: 4px;
			border-radius: 2px;
			background: var(--q);
			pointer-events: none;
		}

		/* Sounding now: a solid block of its colour, glowing, with a small pop as
		   it lands — the lantern you can read from the stand. */
		&--active,
		&--active:hover {
			background: var(--q, var(--spot));
			box-shadow: 0 0 18px color-mix(in srgb, var(--q, var(--spot)) 55%, transparent);
			animation: slot-pop 240ms var(--motion-pop);

			.slot__input,
			.slot__roman {
				color: var(--on-pigment);
			}

			&::after {
				background: var(--on-pigment);
				opacity: 0.5;
			}
		}
	}

	@keyframes slot-pop {
		from {
			transform: scale(0.94);
		}
	}

	.slot__input {
		width: 100%;
		min-height: 52px;
		border: 0;
		border-radius: var(--radius);
		background: transparent;
		padding: var(--space-2) var(--space-2) var(--space-4);
		font-family: var(--font-hand);
		font-size: 1.75rem;
		line-height: 1.1;
		color: var(--ink);
		text-align: center;
		text-overflow: ellipsis;

		&::placeholder {
			color: var(--ink-4);
		}

		&:focus {
			outline: 2px solid var(--ink);
			outline-offset: -2px;
		}
	}

	/* The invitation in bar 1 of a blank song is readable text, not a mark. */
	.slot__input:placeholder-shown:not(:focus) {
		font-size: 1.375rem;
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
		text-align: center;
		font-size: 0.8125rem;
		font-weight: 700;
		letter-spacing: 0.02em;
		color: var(--ink-2);
		padding: 0 0 var(--space-4);
		margin-top: -10px;
	}

	.slot__scale,
	.slot__remove {
		position: absolute;
		top: 0;
		width: 24px;
		height: 24px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 0;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--ink-2);
		cursor: pointer;
		z-index: 1;
		transition:
			opacity var(--motion-fast) var(--motion-ease-out),
			color var(--motion-fast) var(--motion-ease-out);

		&:hover {
			color: var(--ink);
			background: var(--paper);
		}
	}

	.slot__scale {
		left: 0;
	}

	.slot--active .slot__scale,
	.slot--active .slot__remove {
		color: var(--on-pigment);
	}

	.slot__remove {
		right: 0;
		font-size: 1rem;
		line-height: 1;
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
		padding: var(--space-1);
		max-height: 260px;
		overflow-y: auto;
		list-style: none;
		background: var(--paper);
		border: 1px solid var(--ink);
		border-radius: var(--radius);
		box-shadow: 0 10px 28px var(--shadow);
		z-index: 50;
	}

	.opt {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		width: 100%;
		min-height: 36px;
		border: 0;
		border-radius: var(--radius-sm);
		background: transparent;
		padding: var(--space-1) var(--space-3);
		font-family: var(--font-hand);
		font-size: 1.25rem;
		text-align: left;
		color: var(--ink);

		&:hover,
		&--hl {
			background: color-mix(in srgb, var(--q) 20%, var(--paper));
		}
	}

	/* A dab of the chord's ink beside each suggestion. */
	.dot {
		width: 11px;
		height: 11px;
		border-radius: 50% 45% 55% 40%;
		background: var(--q);
		box-shadow: 0 0 6px color-mix(in srgb, var(--q) 50%, transparent);
		flex: 0 0 auto;
	}
</style>
