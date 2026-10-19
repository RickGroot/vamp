<script lang="ts">
	// One ear-quiz item, one question at a time: play it (the key's cadence, a
	// silent bar, then the question, once, with the band), tap the answer, read
	// what it was, go on to the next.
	//
	// Every question is its own owner in the learn store (`ear:<item>:<n>`), so a
	// run can only ever light and replay the question it was made for, and the
	// old one is forgotten the moment a new one is made.
	//
	// Nothing on the card gives the answer away before it is given: the pad and
	// slots are ink only, Play takes the KEY's colour (major yellow, minor blue,
	// printed beside it), and chord colours appear only in the chips that reveal
	// the answer.
	import { onDestroy, onMount, tick } from 'svelte';
	import { displayChord } from '$lib/audio/transpose';
	import { patternInfo } from '$lib/model/analysis';
	import { gradeAnswer, type Grade } from '$lib/learn/grade';
	import { QUALITIES, type QuizItem } from '$lib/learn/items';
	import { loopById, loopNumerals } from '$lib/learn/loops';
	import { learnPlan } from '$lib/learn/plan';
	import { makeQuestion, questionRun, type Question } from '$lib/learn/quiz';
	import { DAY_MS, isDue } from '$lib/learn/srs';
	import { learn } from '$lib/stores/learn.svelte';
	import { learnProgress } from '$lib/stores/learnProgress.svelte';
	import { view } from '$lib/stores/view.svelte';
	import { workspace } from '$lib/stores/workspace.svelte';
	import ChordSymbol from '../ChordSymbol.svelte';
	import Numeral from '../Numeral.svelte';
	import AnswerPad, { type PadOption } from './AnswerPad.svelte';
	import ChordChip from './ChordChip.svelte';

	let { item }: { item: QuizItem } = $props();

	// The card is keyed by item (EarMode), so the item never changes under it.
	// svelte-ignore state_referenced_locally
	let question = $state.raw<Question>(makeQuestion(item));
	let serial = $state(0);
	const owner = $derived(`ear:${item.id}:${serial}`);
	/** A revealed chord tapped on its own. */
	const chordOwner = $derived(`${owner}:chord`);

	/** Tapped answers so far (one per chord for a function question). */
	let given = $state<string[]>([]);
	let grade = $state<Grade | null>(null);
	/** Played at least once: the pad waits for the question to be heard. */
	let heard = $state(false);
	let tapped = $state<number | null>(null);

	let playButton: HTMLButtonElement | undefined = $state();
	let nextButton: HTMLButtonElement | undefined = $state();

	const run = $derived(questionRun(question));
	const active = $derived(learn.activeFor(owner));
	const loading = $derived(active && learn.phase === 'loading');
	const error = $derived(learn.owner === owner || learn.owner === chordOwner ? learn.error : null);

	/** Which part of the run is sounding: the cadence, the gap or the question. */
	const role = $derived.by(() => {
		const cue = active ? learn.cueInfo : null;
		return cue ? (learn.run?.sections[cue.section]?.role ?? null) : null;
	});
	/** The question chord sounding now (its slot is outlined), or null. */
	const soundingChord = $derived(role === 'question' ? (learn.cueInfo?.chord ?? null) : null);
	const tappedSounding = $derived(learn.activeFor(chordOwner) ? tapped : null);

	// ---- the pad ----

	const options = $derived.by((): PadOption[] => {
		const q = question;
		if (q.kind === 'function') return q.options.map((n) => ({ value: n, numeral: n }));
		if (q.kind === 'loop') {
			return q.options.map((id) => {
				const loop = loopById(id)!;
				return { value: id, label: loop.name, numerals: loopNumerals(loop) };
			});
		}
		return q.options.map((id) => ({ value: id, label: QUALITIES[id].name }));
	});

	/** The numeral under each revealed chip. */
	const revealNumerals = $derived.by((): string[] => {
		const q = question;
		if (q.kind === 'function') return q.answer;
		if (q.kind === 'loop') return loopNumerals(loopById(q.answer)!);
		return [''];
	});

	// ---- status ----

	const keyName = $derived(question.key ? displayChord(question.key.tonic, view.offset) : null);

	const status = $derived.by(() => {
		const q = question;
		if (error) return error;
		if (loading) return 'Loading the band…';
		// Answered (even mid-run): the verdict is what matters now.
		if (grade) return verdict(q, grade);
		if (active && role === 'prefix') return 'First the key: hear where home is.';
		if (active && role === 'gap') return 'Now the question…';
		if (active && role === 'question') {
			if (q.kind === 'function' && soundingChord !== null) return `Chord ${soundingChord + 1} of ${q.chords.length}.`;
			if (q.kind === 'loop') return 'Which loop is this?';
			return 'What kind of chord is this?';
		}
		if (active) return 'Listen…';
		if (!heard) {
			if (q.kind === 'function') return `Play: the key first, then ${q.chords.length} chords to name.`;
			if (q.kind === 'loop') return 'Play: the key first, then a loop, twice.';
			return 'Play: one chord, one bar.';
		}
		if (q.kind === 'function') {
			const left = q.answer.length - given.length;
			return given.length === 0 ? 'Tap a numeral for each chord, in order.' : `${left} more to go.`;
		}
		return q.kind === 'loop' ? 'Which loop was it?' : 'What kind of chord was it?';
	});

	function verdict(q: Question, g: Grade): string {
		if (q.kind === 'function') {
			const right = g.marks.filter(Boolean).length;
			if (g.correct) return `All ${q.answer.length} right.`;
			return right === 0 ? 'None of them this time. Listen to them again below.' : `${right} of ${q.answer.length} right.`;
		}
		if (q.kind === 'loop') {
			const name = loopById(q.answer)!.name;
			return g.correct ? `Right: the ${name}.` : `It was the ${name}.`;
		}
		const name = QUALITIES[q.answer].name.toLowerCase();
		return g.correct ? `Right: ${name}.` : `It was ${name}, not ${QUALITIES[given[0] as keyof typeof QUALITIES].name.toLowerCase()}.`;
	}

	/** Where this item stands in the review schedule: information, not a score. */
	const schedule = $derived.by(() => {
		const p = learnProgress.items[item.id];
		if (!p || p.seen === 0) return 'New';
		const now = Date.now();
		if (isDue(p, now)) return 'Due for review';
		const days = Math.ceil((p.due - now) / DAY_MS);
		return days <= 1 ? 'Review tomorrow' : `Review in ${days} days`;
	});

	// ---- actions (all called straight from a tap: nothing awaited before play) ----

	function play() {
		heard = true;
		void learn.play(run, owner);
	}

	function playQuestionOnly() {
		heard = true;
		void learn.play(questionRun(question, { cadence: false }), owner);
	}

	function toggle() {
		if (active) learn.stop();
		else play();
	}

	function pick(value: string) {
		if (grade || !heard) return;
		if (question.kind === 'function') {
			given = [...given, value];
			if (given.length < question.answer.length) return;
		} else {
			given = [value];
		}
		grade = gradeAnswer(question, given);
		learnProgress.record(item.id, grade.correct);
		// The pad is now marked and disabled: keep keyboard focus on the way on.
		void tick().then(() => nextButton?.focus());
	}

	function undo() {
		if (!grade) given = given.slice(0, -1);
	}

	/** A revealed chord, one bar on its own. */
	function hear(i: number) {
		tapped = i;
		void learn.play(learnPlan([{ role: 'listen', chords: [{ symbol: question.chords[i], beats: 4 }] }]), chordOwner);
	}

	/** The next question: forget this one (so nothing replays it), make, play. */
	function next() {
		learn.forget(owner);
		learn.forget(chordOwner);
		question = makeQuestion(item, Math.random, question);
		serial += 1;
		given = [];
		grade = null;
		tapped = null;
		play();
		void tick().then(() => playButton?.focus());
	}

	// Space plays this card's question: always the one on screen.
	onMount(() => workspace.register(toggle));

	// Leaving the item (another exercise, another mode): stop and forget it.
	onDestroy(() => {
		learn.forget(owner);
		learn.forget(chordOwner);
	});
</script>

<!-- The card takes the key's colour locally, as the map's card does: Play is the
     page's one block of colour, and the key is printed beside it. A quality
     question has no key, so its Play is the field at rest. -->
<section
	class="card"
	aria-labelledby="quiz-title"
	style:--field={question.key ? `var(--c-${question.key.mode})` : 'var(--field-rest)'}
	style:--on-field={question.key ? 'var(--on-pigment)' : 'var(--on-field-rest)'}
>
	<div class="card__head">
		<h2 id="quiz-title" class="card__title">{item.title}</h2>
		<span class="label card__schedule">{schedule}</span>
		<p class="hint card__lede">{item.lede}</p>
	</div>

	<div class="deck">
		<div class="deck__key">
			<span class="label">Key</span>
			{#if keyName}
				<span class="deck__keyname"
					><span class="deck__root"><ChordSymbol symbol={keyName} /></span>
					{question.key?.mode}</span
				>
			{:else}
				<span class="deck__keyname">Any root</span>
			{/if}
		</div>
		<button class="play" class:play--on={active} bind:this={playButton} onclick={toggle}>
			{active ? 'Stop' : heard ? 'Play again' : 'Play'}
		</button>
		<p class="deck__status" class:deck__status--error={!!error} class:deck__status--done={!!grade} role="status" aria-live="polite">
			{status}
		</p>
	</div>

	{#if question.kind === 'function'}
		{@const q = question}
		<ol class="slots" style:--n={q.answer.length} style:--n-narrow={q.answer.length >= 4 ? 2 : q.answer.length} aria-label="Your answer">
			{#each q.answer as want, i (i)}
				{@const mine = given[i]}
				{@const wrong = !!grade && !grade.marks[i]}
				<li
					class="slot"
					class:slot--next={!grade && heard && i === given.length}
					class:slot--sounding={soundingChord === i}
					aria-current={soundingChord === i ? 'true' : undefined}
				>
					<span class="label slot__n"><span class="slot__word">{'Chord '}</span>{i + 1}</span>
					<span class="slot__num" class:slot__num--wrong={wrong} style:--chars={Math.max(3, mine?.length ?? 1)}
						>{#if mine}<Numeral numeral={mine} />{:else}<span class="slot__empty" aria-hidden="true">?</span><span
								class="visually-hidden">not answered yet</span
							>{/if}</span
					>
					{#if grade}
						<span class="label slot__mark"
							>{#if grade.marks[i]}Right{:else}It was <Numeral numeral={want} />{/if}</span
						>
					{/if}
				</li>
			{/each}
		</ol>
	{/if}

	<div class="answer">
		<AnswerPad
			{options}
			label={question.kind === 'function' ? 'Numerals' : question.kind === 'loop' ? 'Loops' : 'Chord qualities'}
			layout={question.kind === 'function' ? 'numerals' : 'names'}
			disabled={!heard || (question.kind === 'function' && !!grade)}
			answer={grade && question.kind !== 'function' ? question.answer : null}
			chosen={grade && question.kind !== 'function' ? (given[0] ?? null) : null}
			onpick={pick}
		/>
		{#if question.kind === 'function' && !grade}
			<div class="answer__tools">
				<button class="bar-btn" disabled={given.length === 0} onclick={undo}>Undo</button>
			</div>
		{/if}
	</div>

	{#if grade}
		<div class="reveal">
			<h3 class="label reveal__title">What you heard · tap a chord to hear it</h3>
			<ol class="chips" style:--n={question.chords.length} style:--n-narrow={question.chords.length >= 4 ? 2 : question.chords.length}>
				{#each question.chords as symbol, i (i)}
					<li>
						<ChordChip {symbol} numeral={revealNumerals[i]} on={tappedSounding === i} onclick={() => hear(i)} />
					</li>
				{/each}
			</ol>
			{#if question.kind === 'loop'}
				{@const loop = loopById(question.answer)!}
				{@const info = patternInfo(loop.patternId)}
				<div class="about">
					<p class="about__name">{loop.name}</p>
					<p class="about__text">{loop.about}</p>
					{#if info}<p class="hint about__why">{info.why}</p>{/if}
				</div>
			{/if}
		</div>
	{/if}

	{#if grade || (heard && question.key)}
		<div class="next" role="group" aria-label="Next">
			{#if grade}
				<button class="bar-btn bar-btn--primary" bind:this={nextButton} onclick={next}>Next question</button>
			{/if}
			{#if heard && question.key}
				<button class="bar-btn" onclick={playQuestionOnly}>{question.kind === 'loop' ? 'Just the loop' : 'Just the chords'}</button>
			{/if}
		</div>
	{/if}
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
		display: grid;
		grid-template-columns: 1fr auto;
		align-items: baseline;
		gap: var(--space-1) var(--space-4);
	}

	/* The item's name, set like a drill or tune name: condensed, its own case. */
	.card__title {
		margin: 0;
		font-family: var(--font-display);
		font-stretch: var(--display-stretch);
		font-weight: 900;
		font-size: 2rem;
		line-height: 0.95;
	}

	.card__schedule {
		justify-self: end;
		white-space: nowrap;
	}

	.card__lede {
		grid-column: 1 / -1;
		margin: 0;
	}

	/* The card's transport, read left to right like the map's: what plays (the
	   key), Play, then what is happening. */
	.deck {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: var(--space-3) var(--space-4);
	}

	.deck__key {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-width: 7rem;
	}

	.deck__keyname {
		display: inline-flex;
		align-items: center;
		gap: 0.3em;
		min-height: 36px;
		font-size: 1.0625rem;
		font-weight: 700;
		border-bottom: var(--rule-heavy) solid var(--ink);
	}

	.deck__root {
		font-size: 1.5rem;
		line-height: 1;
	}

	/* Play is the field: a block of the key's colour with its word on it. */
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

	/* The verdict is said in full ink, not as a hint. */
	.deck__status--done {
		color: var(--ink);
		font-weight: 600;
	}

	.deck__status--error {
		color: var(--danger);
		font-weight: 600;
	}

	/* Your answer, one printed box per chord. The one to fill next is underlined
	   heavy; the one sounding gets a second ink rule. Ink only, never colour. */
	.slots {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(var(--n), minmax(0, 1fr));
		gap: var(--space-2);
		max-width: calc(var(--n) * 9rem);
	}

	.slot {
		container-type: inline-size;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		padding: var(--space-2) var(--space-3) var(--space-3);
		border: 1px solid var(--rule);
		border-bottom: var(--rule-heavy) solid var(--ink-3);
		min-height: 6rem;
	}

	.slot--next {
		border-bottom: 6px solid var(--ink);
	}

	.slot--sounding {
		border-color: var(--ink);
		box-shadow: inset 0 0 0 var(--rule-heavy) var(--ink);
	}

	.slot__num {
		position: relative;
		align-self: flex-start;
		font-family: var(--font-display);
		font-stretch: var(--display-stretch);
		font-weight: 900;
		/* Sized to the box by its length: Imaj7 fits a phone's narrow slot. */
		font-size: min(2.25rem, calc(200cqi / var(--chars)));
		line-height: 1;
	}

	/* Four slots on a phone: the number alone says which chord it is, and the
	   box gives its padding to the numeral. */
	@container (max-width: 96px) {
		.slot__word {
			position: absolute;
			width: 1px;
			height: 1px;
			overflow: hidden;
			clip-path: inset(50%);
			white-space: nowrap;
		}
	}

	/* Struck through with a drawn rule: text-decoration doesn't reach into the
	   Numeral (an inline-flex box). */
	.slot__num--wrong {
		color: var(--ink-3);

		&::after {
			content: '';
			position: absolute;
			left: -0.1em;
			right: -0.1em;
			top: 50%;
			height: 3px;
			background: var(--ink);
		}
	}

	.slot__empty {
		color: var(--ink-4);
	}

	.slot__mark {
		color: var(--ink);
	}

	.answer {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.answer__tools {
		display: flex;
		gap: var(--space-2);
	}

	.reveal {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		border-top: 1px solid var(--rule);
		padding-top: var(--space-3);
	}

	.reveal__title {
		margin: 0;
	}

	.chips {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(var(--n), minmax(0, 1fr));
		gap: var(--space-2);
		max-width: calc(var(--n) * 10rem);
	}

	.about {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.about__name {
		margin: 0;
		font-family: var(--font-display);
		font-stretch: var(--display-stretch);
		font-weight: 900;
		font-size: 1.5rem;
		line-height: 1;
	}

	.about__text,
	.about__why {
		margin: 0;
		max-width: 60ch;
	}

	.about__text {
		font-size: 0.9375rem;
		line-height: 1.45;
	}

	.next {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	@media (max-width: 640px) {
		.card {
			padding: var(--space-3) var(--space-4) var(--space-4);
		}

		.slot {
			padding: var(--space-2);
		}

		.card__title {
			font-size: 1.75rem;
		}

		/* Key beside Play; the status under both. */
		.play {
			flex: 1 1 auto;
		}

		.deck__status {
			flex-basis: 100%;
		}
	}

	/* A phone: four chords no longer fit side by side with their marks, so they
	   go two to a row — still read left to right, top to bottom. */
	@media (max-width: 400px) {
		.slots,
		.chips {
			grid-template-columns: repeat(var(--n-narrow), minmax(0, 1fr));
		}
	}
</style>
