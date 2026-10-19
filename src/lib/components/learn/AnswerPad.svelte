<script lang="ts" module>
	/** One answer button: a numeral, or a name with an optional formula under it. */
	export interface PadOption {
		value: string;
		/** Drawn with Numeral: case is the chord's quality, so never uppercased. */
		numeral?: string;
		/** A name, set in its own case. */
		label?: string;
		/** A formula under the name, each drawn with Numeral. */
		numerals?: string[];
	}
</script>

<script lang="ts">
	// The answer pad: printed buttons you tap to answer. Numerals are drawn with
	// Numeral inside a button of our own — never a .bar-btn, whose uppercase
	// would turn ii into II, a right answer that looks wrong.
	//
	// After a single-choice question is marked, the pad itself shows the result in
	// ink and words: the right answer says so, a wrong pick is struck through and
	// says it was yours. Never colour: chord inks mean quality, nothing else.
	import Numeral from '../Numeral.svelte';

	let {
		options,
		label,
		disabled = false,
		layout = 'numerals',
		answer = null,
		chosen = null,
		onpick
	}: {
		options: PadOption[];
		/** What the group of buttons answers, for assistive tech. */
		label: string;
		disabled?: boolean;
		/** 'numerals': a row of square keys; 'names': wider buttons, two to a row. */
		layout?: 'numerals' | 'names';
		/** Once marked: the right value… */
		answer?: string | null;
		/** …and the one that was picked. */
		chosen?: string | null;
		onpick: (value: string) => void;
	} = $props();

	const marked = $derived(answer !== null);
</script>

<div class="pad pad--{layout}" style:--n={options.length} role="group" aria-label={label}>
	{#each options as option (option.value)}
		{@const right = marked && option.value === answer}
		{@const wrong = marked && option.value === chosen && option.value !== answer}
		<button
			class="pad__btn"
			class:pad__btn--right={right}
			class:pad__btn--wrong={wrong}
			class:pad__btn--rest={marked && !right && !wrong}
			disabled={disabled || marked}
			onclick={() => onpick(option.value)}
		>
			{#if option.numeral}
				<span class="pad__numeral" style:--chars={Math.max(2, option.numeral.length)}
					><Numeral numeral={option.numeral} /></span
				>
			{/if}
			{#if option.label}
				<span class="pad__name">{option.label}</span>
			{/if}
			{#if option.numerals}
				<span class="pad__formula"
					>{#each option.numerals as n, i (i)}{#if i > 0}<span aria-hidden="true">–</span>{/if}<Numeral
							numeral={n}
						/>{/each}</span
				>
			{/if}
			{#if right}
				<span class="label pad__mark">{option.value === chosen ? 'Your answer · right' : 'Right answer'}</span>
			{:else if wrong}
				<span class="label pad__mark">Your answer</span>
			{/if}
		</button>
	{/each}
</div>

<style lang="scss">
	.pad {
		display: grid;
		gap: var(--space-2);
	}

	/* Square-ish keys, as many to a row as fit; never wider than they need. */
	.pad--numerals {
		grid-template-columns: repeat(auto-fit, minmax(3.5rem, 1fr));
		max-width: calc(var(--n) * 7.5rem);
	}

	.pad--names {
		grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
		max-width: calc(var(--n) * 18rem);
	}

	.pad__btn {
		position: relative;
		container-type: inline-size;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		justify-content: center;
		gap: var(--space-1);
		min-height: 56px;
		padding: var(--space-2) var(--space-3);
		border: var(--rule-heavy) solid var(--ink);
		border-radius: 0;
		background: transparent;
		font-family: inherit;
		color: var(--ink);
		text-align: left;
		cursor: pointer;
		transition: background-color var(--motion-fast) var(--motion-ease-out);

		&:hover:not(:disabled) {
			background: var(--wash);
		}

		&:active:not(:disabled) {
			background: var(--rule);
		}

		&:disabled {
			cursor: default;
		}

		/* Not played yet: the keys are there to read, not to press. */
		&:disabled:not(.pad__btn--right, .pad__btn--wrong, .pad__btn--rest) {
			color: var(--ink-4);
			border-color: var(--ink-4);
		}
	}

	.pad--numerals .pad__btn {
		align-items: center;
		padding: var(--space-2) var(--space-1);
	}

	.pad__numeral {
		font-family: var(--font-display);
		font-stretch: var(--display-stretch);
		font-weight: 900;
		/* Sized to the key by its length: V is big, and bVImaj7 still fits a
		   phone's 56px key. */
		font-size: min(1.75rem, calc(210cqi / var(--chars)));
		line-height: 1;
	}

	.pad__name {
		font-family: var(--font-display);
		font-stretch: var(--display-stretch);
		font-weight: 900;
		font-size: 1.375rem;
		line-height: 1;
	}

	.pad__formula {
		display: inline-flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0 0.15em;
		font-size: 0.9375rem;
		font-weight: 700;
		color: var(--ink-2);
	}

	/* Marked: the right answer keeps full ink and says so; a wrong pick is struck
	   through; the rest step back. Words carry it, never colour. */
	.pad__btn--right {
		box-shadow: inset 0 0 0 var(--rule-heavy) var(--ink);
	}

	/* The name only: text-decoration can't reach into a Numeral (inline-flex). */
	.pad__btn--wrong .pad__name {
		text-decoration: line-through;
		text-decoration-thickness: 2px;
	}

	.pad__btn--rest {
		color: var(--ink-3);
		border-color: var(--rule);

		.pad__formula {
			color: var(--ink-3);
		}
	}

	.pad__mark {
		color: var(--ink);
	}

	@media (pointer: coarse) {
		.pad__btn {
			min-height: max(56px, var(--tap));
		}
	}
</style>
