<script lang="ts">
	// One step of a lesson: listen (the band plays a passage once, in the
	// lesson's key; tap a chip to hear a chord alone), read (a paragraph or two),
	// quiz (an Ear exercise, the same QuizCard) or try (the passage, ready to
	// open in Sketch).
	//
	// LessonView keys this component by step, so `lesson`, `step` and `index`
	// never change under it; only the key can. Its runs belong to its own
	// owners in the learn store (`lesson:<id>:<step>`, `…:chord`), forgotten
	// when the key changes and when the step goes away, so Play again and Space
	// can never sound another step or the old key.
	//
	// Space plays what is on screen: a listen step registers its toggle, a quiz
	// step leaves it to its QuizCard (which registers its own), and a step with
	// nothing to play registers a no-op, so Space never starts the Sketch song
	// from a page of reading.
	import { onDestroy, onMount, untrack } from 'svelte';
	import { Note } from 'tonal';
	import { displayChord } from '$lib/audio/transpose';
	import type { Part } from '$lib/model/harmony';
	import { numeralOf } from '$lib/model/numerals';
	import { chordFace } from '$lib/model/symbol';
	import {
		chipFor,
		chordRun,
		listenPassage,
		stepKey,
		textParts,
		trySongChords,
		type Lesson,
		type LessonStep,
		type TrySong
	} from '$lib/learn/curriculum';
	import { quizItemById } from '$lib/learn/items';
	import { KEY_ROOTS } from '$lib/learn/keys';
	import { learn } from '$lib/stores/learn.svelte';
	import { learnProgress } from '$lib/stores/learnProgress.svelte';
	import { progression } from '$lib/stores/progression.svelte';
	import { view } from '$lib/stores/view.svelte';
	import { workspace } from '$lib/stores/workspace.svelte';
	import Numeral from '../Numeral.svelte';
	import ChordChip from './ChordChip.svelte';
	import QuizCard from './QuizCard.svelte';

	let {
		lesson,
		step,
		index,
		tonic,
		onkey,
		ontry
	}: {
		lesson: Lesson;
		step: LessonStep;
		index: number;
		/** The lesson's tonic (concert); each step spells it for its mode. */
		tonic: string;
		onkey: (tonic: string) => void;
		ontry: (song: TrySong) => void;
	} = $props();

	const owner = $derived(`lesson:${lesson.id}:${index}`);
	/** A chip tapped on its own. */
	const chordOwner = $derived(`${owner}:chord`);

	// ---- the music on this step (listen and try) ----

	const passage = $derived(step.kind === 'listen' ? listenPassage(step, tonic) : null);
	const tryKey = $derived(step.kind === 'try' ? stepKey(step.song.mode, tonic) : null);
	const tryChords = $derived(step.kind === 'try' ? trySongChords(step.song, tonic).flat() : []);
	const key = $derived(passage?.key ?? tryKey);
	const chips = $derived(passage ? passage.chords : tryChords);
	const chipNumerals = $derived(passage ? passage.numerals : tryChords.map((s) => numeralOf(s, tryKey!)));
	const home = $derived(step.kind === 'listen' && !!step.home);

	const active = $derived(learn.activeFor(owner));
	const finished = $derived(learn.owner === owner && learn.phase === 'done');
	const loading = $derived(active && learn.phase === 'loading');
	const error = $derived(learn.owner === owner || learn.owner === chordOwner ? learn.error : null);

	let tapped = $state<number | null>(null);
	const tappedSounding = $derived(learn.activeFor(chordOwner) ? tapped : null);

	/** Which part of the run is sounding: the cadence, the gap or the passage. */
	const role = $derived.by(() => {
		const cue = active ? learn.cueInfo : null;
		return cue ? (learn.run?.sections[cue.section]?.role ?? null) : null;
	});
	const sounding = $derived(
		tappedSounding ?? (active && passage ? chipFor(passage, learn.cueInfo) : null)
	);

	const homeNumeral = $derived(key?.mode === 'minor' ? 'i' : 'I');

	const status = $derived.by((): Part[] => {
		if (error) return [error];
		if (loading) return ['Loading the band…'];
		if (active && role === 'prefix') return ['First the key: hear where home is.'];
		if (active && role === 'gap') return ['Now listen…'];
		if (active) return [home ? 'Listen to where it lands.' : 'Listen…'];
		if (tappedSounding !== null) {
			const n = chipNumerals[tappedSounding];
			return n ? ['Chord ', { numeral: n }, ' on its own.'] : ['That chord on its own.'];
		}
		if (finished && home) return ['It came back to where it started. That chord is home: ', { numeral: homeNumeral }, '.'];
		if (finished) return ['Play it again, or tap a chord to hear it on its own.'];
		if (step.kind === 'try') return ['Tap a chord to hear it on its own.'];
		return ['Play it, then tap any chord to hear it on its own.'];
	});

	/** A root as an <option> can print it: real ♭ / ♯ (no SVG inside an option). */
	const rootLabel = (root: string) => {
		const shown = displayChord(root, view.offset);
		return chordFace(shown)?.root ?? shown;
	};

	function play() {
		if (passage) void learn.play(passage.run, owner);
	}

	function toggle() {
		if (active) learn.stop();
		else play();
	}

	function hear(i: number) {
		tapped = i;
		void learn.play(chordRun(chips[i]), chordOwner);
	}

	/**
	 * A new key is new music: forget this step's runs first, so neither Play
	 * again nor Space can sound the old key under the new chords.
	 */
	function setKey(next: string) {
		learn.forget(owner);
		learn.forget(chordOwner);
		tapped = null;
		onkey(next);
	}

	/** After a run: the same tap moves to another key and plays it. */
	function anotherKey() {
		if (!key) return;
		const roots = KEY_ROOTS[key.mode].filter((r) => Note.chroma(r) !== Note.chroma(key.tonic));
		setKey(roots[Math.floor(Math.random() * roots.length)]);
		play(); // reads the new key: the passage is derived from the prop
	}

	// ---- quiz ----

	const item = $derived(step.kind === 'quiz' ? quizItemById(step.item) : null);
	/** Questions answered on this visit: the item's counter, from when the step opened. */
	const seenAtStart = untrack(() => (step.kind === 'quiz' ? (learnProgress.get(step.item)?.seen ?? 0) : 0));
	const answered = $derived(step.kind === 'quiz' ? (learnProgress.items[step.item]?.seen ?? 0) - seenAtStart : 0);

	onMount(() => {
		if (step.kind === 'quiz') return; // the QuizCard registers its own question
		return workspace.register(step.kind === 'listen' ? toggle : () => {});
	});

	onDestroy(() => {
		learn.forget(owner);
		learn.forget(chordOwner);
	});
</script>

<!-- Running text with drawn numerals, set heavier so "home is i" reads as a
     numeral, not a word. -->
{#snippet sentence(parts: Part[])}{#each parts as p, i (i)}{#if typeof p === 'string'}{p}{:else if 'numeral' in p}<span
				class="n"><Numeral numeral={p.numeral} /></span
			>{/if}{/each}{/snippet}

{#snippet keyPick()}
	{#if key}
		<label class="field pick">
			<span class="label">Key</span>
			<span class="pick__row">
				<select class="field__select" value={key.tonic} onchange={(e) => setKey((e.target as HTMLSelectElement).value)}>
					{#each KEY_ROOTS[key.mode] as root (root)}
						<option value={root}>{rootLabel(root)}</option>
					{/each}
				</select>
				<span class="pick__mode">{key.mode}</span>
			</span>
		</label>
	{/if}
{/snippet}

{#snippet chipRow(label: string)}
	<ol class="chips" style:--n={Math.min(4, chips.length)} aria-label={label}>
		{#each chips as symbol, i (i)}
			{@const isHome = home && finished && (chipNumerals[i] === 'I' || chipNumerals[i] === 'i')}
			<li>
				<ChordChip {symbol} numeral={chipNumerals[i]} on={sounding === i} mark={isHome ? 'Home' : undefined} onclick={() => hear(i)} />
			</li>
		{/each}
	</ol>
{/snippet}

{#if step.kind === 'listen' && key}
	<!-- The card takes the key's colour locally, as every Learn card does: Play
	     is the page's one block of colour, and the key is printed beside it. -->
	<section class="card" aria-label="Listen" style:--field="var(--c-{key.mode})" style:--on-field="var(--on-pigment)">
		<p class="lead">{@render sentence(textParts(step.text))}</p>
		<div class="deck">
			{@render keyPick()}
			<button class="play" class:play--on={active} onclick={toggle}>
				{active ? 'Stop' : finished ? 'Play again' : 'Play'}
			</button>
			<p class="deck__status" class:deck__status--error={!!error} class:deck__status--done={finished} role="status" aria-live="polite">
				{@render sentence(status)}
			</p>
		</div>
		{@render chipRow('The chords: tap one to hear it on its own')}
		{#if finished}
			<div class="after" role="group" aria-label="Again">
				<button class="bar-btn" onclick={anotherKey}>Another key</button>
			</div>
		{/if}
	</section>
{:else if step.kind === 'read'}
	<div class="read">
		{#each step.text as paragraph, i (i)}
			<p class="read__p">{@render sentence(textParts(paragraph))}</p>
		{/each}
	</div>
{:else if step.kind === 'quiz' && item}
	<div class="quiz">
		<p class="lead">{@render sentence(textParts(step.text))}</p>
		{#key item.id}
			<QuizCard {item} />
		{/key}
		<p class="hint quiz__count" aria-live="polite">
			{#if answered === 0}
				Try {step.questions} questions, then go on whenever you like.
			{:else if answered < step.questions}
				{answered} of {step.questions} answered.
			{:else}
				{answered} answered. Go on whenever you like; this exercise comes back for review.
			{/if}
		</p>
	</div>
{:else if step.kind === 'try' && key}
	<section class="card card--try" aria-label="Try it">
		<p class="lead">{@render sentence(textParts(step.text))}</p>
		<div class="deck">
			{@render keyPick()}
			<p class="deck__status" class:deck__status--error={!!error} role="status" aria-live="polite">
				{@render sentence(status)}
			</p>
		</div>
		{@render chipRow('The song: tap a chord to hear it on its own')}
		<div class="go">
			<button class="bar-btn bar-btn--primary go__btn" onclick={() => ontry(step.song)}>Try it in Sketch</button>
			<p class="hint go__note">
				{progression.isBlank
					? 'It opens on your empty canvas.'
					: 'It replaces the sketch on your canvas. Undo in Sketch brings yours back.'}
			</p>
		</div>
	</section>
{/if}

<style lang="scss">
	.card {
		border: var(--rule-heavy) solid var(--ink);
		padding: var(--space-4) var(--space-6) var(--space-6);
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.n {
		font-weight: 800;
	}

	/* What to listen for, or what to do: the step's one sentence, in full ink. */
	.lead {
		margin: 0;
		max-width: 62ch;
		font-size: 1.0625rem;
		line-height: 1.5;
		color: var(--ink);
	}

	/* The card's transport, read left to right: the key, Play, then what is
	   happening — status sits against the button it reports on. */
	.deck {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: var(--space-3) var(--space-4);
	}

	.pick__row {
		display: inline-flex;
		align-items: baseline;
		gap: var(--space-2);
	}

	.pick .field__select {
		min-width: 5.5rem;
	}

	.pick__mode {
		font-size: 1.0625rem;
		font-weight: 700;
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

	/* The chords as a printed row (ChordChip), four to a row like a chart: each
	   under a tab of its ink; the one sounding a solid block of that ink. */
	.chips {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(var(--n), minmax(0, 1fr));
		gap: var(--space-2);
		max-width: calc(var(--n) * 11rem);
	}

	.after {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	/* Reading: set on the board, not in a box, at a size you read rather than scan. */
	.read {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		max-width: 62ch;
	}

	.read__p {
		margin: 0;
		font-size: 1.1875rem;
		line-height: 1.55;
		color: var(--ink);
	}

	.quiz {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.quiz__count {
		margin: 0;
	}

	.go {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-4);
		border-top: 1px solid var(--rule);
		padding-top: var(--space-4);
	}

	.go__btn {
		min-height: var(--tap);
		padding: 0 var(--space-6);
	}

	.go__note {
		flex: 1 1 16rem;
		margin: 0;
	}

	@media (max-width: 640px) {
		.card {
			padding: var(--space-3) var(--space-4) var(--space-4);
		}

		/* Key beside Play; the status under both. */
		.play {
			flex: 1 1 auto;
		}

		.deck__status {
			flex-basis: 100%;
		}

		.read__p {
			font-size: 1.0625rem;
		}
	}

	/* 320 wide: Play takes its own row under the key. */
	@media (max-width: 360px) {
		.play {
			flex-basis: 100%;
		}
	}
</style>
