<script lang="ts">
	// The Learn map. The tracks and lessons arrive in a later phase; for now it
	// holds the first listening card, "Hear home" — a cadence played once with the
	// band, in any key, so the ear learns what the tonic feels like before it has
	// a name — and what is coming next.
	import { onMount } from 'svelte';
	import { Note } from 'tonal';
	import { displayChord } from '$lib/audio/transpose';
	import { classifyChord } from '$lib/model/chords';
	import { PRESET_ROOTS } from '$lib/model/presets';
	import { chordFace } from '$lib/model/symbol';
	import { numeralOf } from '$lib/model/numerals';
	import type { KeyInfo } from '$lib/model/key';
	import { cadenceSections, learnPlan } from '$lib/learn/plan';
	import { learn } from '$lib/stores/learn.svelte';
	import { view } from '$lib/stores/view.svelte';
	import { workspace } from '$lib/stores/workspace.svelte';
	import ChordSymbol from '../ChordSymbol.svelte';
	import Numeral from '../Numeral.svelte';

	const OWNER = 'map:hear-home';
	/** One chord of the cadence on its own (a tapped chip). */
	const CHORD_OWNER = 'map:hear-home:chord';

	// Keys as they are usually written: flats for the major keys (PRESET_ROOTS),
	// sharps where a minor key is normally spelled with them — C♯ minor, not D♭.
	const ROOTS: Record<KeyInfo['mode'], string[]> = {
		major: PRESET_ROOTS,
		minor: ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B']
	};
	const respell = (root: string, mode: KeyInfo['mode']) =>
		ROOTS[mode].find((r) => Note.chroma(r) === Note.chroma(root)) ?? root;
	/** A root as an <option> can print it: real ♭ / ♯ (no SVG inside an option). */
	const rootLabel = (root: string) => {
		const shown = displayChord(root, view.offset);
		return chordFace(shown)?.root ?? shown;
	};

	let tonic = $state('C');
	let mode = $state<KeyInfo['mode']>('major');
	const key = $derived<KeyInfo>({ tonic, mode });

	// The cadence, then the home chord held for a bar so it rings out.
	const cadence = $derived(cadenceSections(key)[0]);
	const chords = $derived(cadence.chords.map((c) => c.symbol));
	const numerals = $derived(chords.map((c) => numeralOf(c, key)));

	const active = $derived(learn.activeFor(OWNER));
	const finished = $derived(learn.owner === OWNER && learn.phase === 'done');
	const loading = $derived(active && learn.phase === 'loading');

	/** The chip a tapped chord belongs to, while it sounds on its own. */
	let tapped = $state<number | null>(null);
	const tappedSounding = $derived(learn.activeFor(CHORD_OWNER) ? tapped : null);

	// Which chip is lit. The held home chord lights the last chip: it IS that
	// chord, still sounding.
	const sounding = $derived.by((): number | null => {
		if (tappedSounding !== null) return tappedSounding;
		const cue = active ? learn.cueInfo : null;
		if (!cue || cue.chord === null) return null;
		return cue.section === 0 ? cue.chord : chords.length - 1;
	});

	const error = $derived(
		learn.owner === OWNER || learn.owner === CHORD_OWNER ? learn.error : null
	);

	const status = $derived.by(() => {
		if (error) return error;
		if (loading) return 'Loading the band…';
		if (active) return 'Listen to where it lands.';
		if (tappedSounding !== null) return `Chord ${numerals[tappedSounding]} on its own.`;
		if (finished) return 'It started at home and came back to it. That chord is the tonic: I in Roman numerals.';
		return 'Four chords. Play them and listen to where they land.';
	});

	const otherMode = $derived<KeyInfo['mode']>(mode === 'major' ? 'minor' : 'major');

	function play() {
		void learn.play(learnPlan([cadence, { role: 'listen', chords: [{ symbol: chords[0], beats: 4 }] }]), OWNER);
	}

	function toggle() {
		if (active) learn.stop();
		else play();
	}

	/** Tap a chip: that chord alone, one bar. */
	function hear(i: number) {
		tapped = i;
		void learn.play(learnPlan([{ role: 'listen', chords: [{ symbol: chords[i], beats: 4 }] }]), CHORD_OWNER);
	}

	// A new key is a new card. Forget the old run entirely — stopping it is not
	// enough: a finished run would otherwise still offer "Play again" (and Space)
	// in the old key, under the new key's chords.
	function setKey(next: Partial<KeyInfo>) {
		learn.forget(OWNER);
		learn.forget(CHORD_OWNER);
		const nextMode = next.mode ?? mode;
		tonic = respell(next.tonic ?? tonic, nextMode);
		mode = nextMode;
	}

	/** The next step after a run: the same tap changes the key and plays it. */
	function playIn(next: Partial<KeyInfo>) {
		setKey(next);
		play();
	}

	function anotherKey() {
		const roots = ROOTS[mode].filter((r) => Note.chroma(r) !== Note.chroma(tonic));
		playIn({ tonic: roots[Math.floor(Math.random() * roots.length)] });
	}

	// Space plays this card: always what's on screen, never a run from another key.
	onMount(() => workspace.register(toggle));

	const SOON = [
		{ name: 'Ear', text: 'Hear a few bars with the band, then name the chords.' },
		{ name: 'Lessons', text: 'Short tracks from three chords to jazz forms, each tried out in Sketch.' },
		{ name: 'Review', text: "A few minutes of mixed practice on what you've learned, spaced over days." },
		{ name: 'Lab', text: 'Swap in a substitute chord and hear both versions back to back.' }
	];
</script>

<!-- The card takes the key's colour locally, like Practice's runner: Play is the
     page's one block of colour. The key is printed beside it, so the colour gives
     nothing away. -->
<section class="card" aria-labelledby="hear-home-title" style:--field="var(--c-{mode})" style:--on-field="var(--on-pigment)">
	<div class="card__head">
		<h2 id="hear-home-title" class="display card__title">Hear home</h2>
		<p class="hint card__lede">Every key has a chord that sounds like the end of the sentence.</p>
	</div>

	<div class="deck">
		<label class="field deck__key">
			<span class="label">Key</span>
			<select
				class="field__select"
				value={tonic}
				onchange={(e) => setKey({ tonic: (e.target as HTMLSelectElement).value })}
			>
				{#each ROOTS[mode] as root (root)}
					<option value={root}>{rootLabel(root)}</option>
				{/each}
			</select>
		</label>
		<div class="seg deck__mode" role="group" aria-label="Mode">
			<button class="bar-btn" class:bar-btn--on={mode === 'major'} aria-pressed={mode === 'major'} onclick={() => setKey({ mode: 'major' })}
				>Major</button
			>
			<button class="bar-btn" class:bar-btn--on={mode === 'minor'} aria-pressed={mode === 'minor'} onclick={() => setKey({ mode: 'minor' })}
				>Minor</button
			>
		</div>
		<button class="play deck__play" class:play--on={active} onclick={toggle}>
			{active ? 'Stop' : finished ? 'Play again' : 'Play'}
		</button>
		<p class="deck__status" class:deck__status--error={!!error} class:deck__status--done={finished} role="status" aria-live="polite">
			{status}
		</p>
	</div>

	<ol class="chips" aria-label="The cadence: tap a chord to hear it on its own">
		{#each chords as symbol, i (i)}
			{@const isHome = finished && (numerals[i] === 'I' || numerals[i] === 'i')}
			<li>
				<button
					class="chip"
					class:chip--on={sounding === i}
					style:--q="var(--c-{classifyChord(symbol)})"
					aria-current={sounding === i ? 'true' : undefined}
					onclick={() => hear(i)}
				>
					<span class="chip__chord"><ChordSymbol symbol={displayChord(symbol, view.offset)} /></span>
					<span class="chip__num"><Numeral numeral={numerals[i]} /></span>
					{#if isHome}<span class="label chip__home">Home</span>{/if}
				</button>
			</li>
		{/each}
	</ol>

	<p class="hint card__explain">
		Roman numerals count up the scale from home. Capitals are major chords, small letters minor.
	</p>

	{#if finished}
		<div class="next" role="group" aria-label="Next">
			<button class="bar-btn" onclick={() => playIn({ mode: otherMode })}>Now in {otherMode}</button>
			<button class="bar-btn" onclick={anotherKey}>Another key</button>
		</div>
	{/if}
</section>

<!-- What the map will hold. Greyed and inert: names of what's coming, not links. -->
<section class="soon" aria-labelledby="soon-title">
	<h2 id="soon-title" class="display soon__title">Coming up</h2>
	<ul class="soon__list">
		{#each SOON as item (item.name)}
			<li class="soon__item">
				<span class="display soon__name">{item.name}</span>
				<span class="hint soon__text">{item.text}</span>
			</li>
		{/each}
	</ul>
</section>

<style lang="scss">
	.card {
		border: var(--rule-heavy) solid var(--ink);
		padding: var(--space-4) var(--space-6) var(--space-6);
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.card__head {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.card__title {
		margin: 0;
		font-size: 2rem;
	}

	.card__lede,
	.card__explain {
		margin: 0;
	}

	/* The card's transport, read left to right: what to play (key, mode), play
	   it, then what is happening — status sits against the button it reports on. */
	.deck {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: var(--space-3) var(--space-4);
	}

	.deck__key .field__select {
		min-width: 5.5rem;
	}

	/* Two joined boxes: the chosen mode inked solid. */
	.seg {
		display: inline-flex;

		.bar-btn + .bar-btn {
			margin-left: calc(-1 * var(--rule-heavy));
		}
	}

	/* Play is the field: a block of the key's colour with its word on it, the
	   same button as Practice's Start. */
	.play {
		min-height: var(--tap);
		min-width: 9rem;
		border: var(--rule-heavy) solid var(--field);
		border-radius: 0;
		padding: 0 var(--space-6);
		font-family: inherit;
		font-size: 0.8125rem;
		font-weight: 800;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--on-field);
		background: var(--field);
		transition: transform var(--motion-fast) var(--motion-ease-out);

		&:active {
			transform: scale(0.97);
		}

		&:focus-visible {
			outline-offset: 3px;
		}
	}

	/* Running: the field turns over to the board, ink border kept. */
	.play--on {
		background: var(--ground);
		color: var(--ink);
		border-color: var(--ink);
	}

	.deck__status {
		flex: 1 1 16rem;
		align-self: center;
		margin: 0;
		font-size: 0.9375rem;
		line-height: 1.45;
		color: var(--ink-2);
	}

	/* The payoff is said in full ink, not as a hint. */
	.deck__status--done {
		color: var(--ink);
		font-weight: 600;
	}

	.deck__status--error {
		color: var(--danger);
		font-weight: 600;
	}

	/* The chords as a printed row: each under a tab of its ink; the one sounding
	   is a solid block of that ink, as on the Sketch chart, with an ink rule
	   round it so it reads without the colour (yellow on the wash is faint). */
	.chips {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: var(--space-2);
	}

	.chip {
		position: relative;
		container-type: inline-size;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-1);
		width: 100%;
		min-height: var(--tap);
		padding: var(--space-2) var(--space-3) var(--space-3);
		border: 0;
		border-top: 6px solid var(--q);
		border-radius: 0;
		background: var(--wash);
		font-family: inherit;
		color: var(--ink);
		text-align: left;
		cursor: pointer;

		&:hover {
			background: var(--rule);
		}
	}

	.chip--on,
	.chip--on:hover {
		background: var(--q);
		color: var(--on-pigment);
		box-shadow: inset 0 0 0 var(--rule-heavy) var(--ink);
	}

	/* Sized to the chip, never past it: a chord can't spill into its neighbour
	   at a large text size. */
	.chip__chord {
		font-size: min(2.25rem, 40cqi);
		line-height: 1;
	}

	.chip__num {
		font-size: 0.9375rem;
		font-weight: 800;
	}

	/* Bottom right, level with the numeral: the chord's name owns the top of
	   the chip, and on a phone a wide one (E♭m) reaches the right edge. */
	.chip__home {
		position: absolute;
		right: var(--space-2);
		bottom: var(--space-3);
		color: var(--ink);
	}

	.chip--on .chip__home {
		color: var(--on-pigment);
	}

	.next {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	/* The sleeve's back: a tracklist of what's coming, set under a heavy rule. */
	.soon {
		border-top: var(--rule-heavy) solid var(--ink);
		padding-top: var(--space-3);
	}

	.soon__title {
		margin: 0 0 var(--space-2);
		font-size: 1.75rem;
	}

	.soon__list {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.soon__item {
		display: grid;
		grid-template-columns: 9rem 1fr;
		align-items: baseline;
		gap: var(--space-4);
		padding: var(--space-2) 0;
		border-bottom: 1px solid var(--rule);
	}

	.soon__name {
		font-size: 1.25rem;
		color: var(--ink-3);
	}

	.soon__text {
		margin: 0;
	}

	@media (max-width: 640px) {
		.card {
			padding: var(--space-3) var(--space-4) var(--space-4);
		}

		/* Key and mode share a row; Play takes the full width under them. */
		.deck__play {
			flex: 1 1 100%;
		}

		.deck__status {
			flex-basis: 100%;
		}

		.soon__item {
			grid-template-columns: 1fr;
			gap: 0;
		}
	}

	/* 320 wide: key and mode still share their row (88 + 12 + 150 = 250 of 252). */
	@media (max-width: 400px) {
		.deck {
			column-gap: var(--space-3);
		}
	}
</style>
