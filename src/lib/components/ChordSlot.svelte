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
		/** Concert-pitch chord symbol (the stored value). */
		chord: string;
		keyInfo: KeyInfo;
		active?: boolean;
		canRemove?: boolean;
	}

	let { barIndex, slotIndex, chord, keyInfo, active = false, canRemove = false }: Props = $props();

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
	style={family ? `--q: var(--c-${family})` : undefined}
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
		placeholder="–"
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
	.slot {
		position: relative;
		flex: 1 1 0;
		min-width: 0;
		border: 1px solid var(--color-border);
		background: var(--color-white);
		transition:
			border-color var(--motion-fast) var(--motion-ease-out),
			box-shadow var(--motion-fast) var(--motion-ease-out),
			background-color var(--motion-fast) var(--motion-ease-out);

		&--filled {
			border-left: 3px solid var(--q, var(--color-border));
		}

		&--active {
			border-color: var(--q, var(--color-orange));
			background: color-mix(in srgb, var(--q, var(--color-orange)) 12%, white);
			box-shadow: 0 0 0 2px color-mix(in srgb, var(--q, var(--color-orange)) 38%, transparent);
		}

		&--invalid .slot__input {
			color: var(--c-diminished);
		}
	}

	.slot__input {
		width: 100%;
		border: 0;
		background: transparent;
		padding: var(--space-4) var(--space-3);
		font-family: inherit;
		font-size: 1.25rem;
		font-weight: 300;
		letter-spacing: -0.02em;
		color: var(--color-text);
		text-align: center;

		&::placeholder {
			color: var(--color-grey-400);
		}

		&:focus {
			outline: 2px solid var(--q, var(--color-accent));
			outline-offset: -2px;
		}
	}

	.slot__roman {
		display: block;
		text-align: center;
		font-size: 0.75rem;
		letter-spacing: 0.04em;
		color: var(--color-text-faint);
		padding: 0 0 var(--space-2);
		margin-top: -6px;
	}

	.slot__scale {
		position: absolute;
		top: 2px;
		left: 2px;
		width: 22px;
		height: 20px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 0;
		background: transparent;
		color: var(--q, var(--color-grey-400));
		opacity: 0.6;
		cursor: pointer;
		transition: opacity var(--motion-fast) var(--motion-ease-out);

		&:hover {
			opacity: 1;
		}
	}

	.slot__remove {
		position: absolute;
		top: 2px;
		right: 2px;
		width: 20px;
		height: 20px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 0;
		background: transparent;
		color: var(--color-grey-400);
		font-size: 1rem;
		line-height: 1;

		&:hover {
			color: var(--color-black);
		}
	}

	.menu {
		position: absolute;
		top: 100%;
		left: 0;
		right: 0;
		margin: 2px 0 0;
		padding: var(--space-1);
		max-height: 240px;
		overflow-y: auto;
		list-style: none;
		background: var(--color-white);
		border: 1px solid var(--color-black);
		box-shadow: 0 8px 24px rgba(28, 26, 31, 0.14);
		z-index: 50;
	}

	.opt {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		width: 100%;
		border: 0;
		background: transparent;
		padding: var(--space-2) var(--space-3);
		font-family: inherit;
		font-size: 1rem;
		text-align: left;
		color: var(--color-text);

		&:hover,
		&--hl {
			background: color-mix(in srgb, var(--q) 12%, var(--color-grey-100));
			box-shadow: inset 3px 0 0 var(--q);
		}
	}

	.dot {
		width: 9px;
		height: 9px;
		border-radius: var(--radius-pill);
		background: var(--q);
		flex: 0 0 auto;
	}

	.opt__name {
		font-weight: 300;
		letter-spacing: -0.01em;
	}
</style>
