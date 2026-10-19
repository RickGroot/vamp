<script lang="ts" module>
	// The key you were using, for the rest of the session: the next lesson opens
	// in it too. Concert pitch; each step spells it for its own mode.
	let lastTonic = 'C';
</script>

<script lang="ts">
	// A lesson: its steps one at a time, in order, with a rail to jump to any of
	// them (an order, never a lock). Where you are is remembered (`vamp:learn`),
	// so the map can say so and the lesson reopens there; finishing it puts the
	// exercises it taught into review.
	//
	// "Try it in Sketch" builds the step's song in the lesson's key and loads it
	// through progression.load(), so the sketch it replaces is one Undo away
	// (with the "Replaced … · Undo" notice when it had chords), then goes to
	// Sketch. On the last step that also finishes the lesson.
	//
	// The route keys this component by lesson id.
	import { onMount, tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import {
		buildTrySong,
		lessonAfter,
		lessonNumber,
		lessonState,
		SKILL_NAMES,
		STEP_NAMES,
		trackById,
		type Lesson,
		type TrySong
	} from '$lib/learn/curriculum';
	import { quizItemById } from '$lib/learn/items';
	import { DAY_MS, isDue } from '$lib/learn/srs';
	import { learnProgress } from '$lib/stores/learnProgress.svelte';
	import { progression } from '$lib/stores/progression.svelte';
	import LessonStep from './LessonStep.svelte';

	let { lesson }: { lesson: Lesson } = $props();

	// Keyed by lesson id (the route), so the lesson never changes under it.
	// svelte-ignore state_referenced_locally
	const track = trackById(lesson.track);
	// svelte-ignore state_referenced_locally
	const saved = learnProgress.lesson(lesson.id);
	// A lesson you were part-way through reopens where you were; a new or a
	// finished one from the top.
	// svelte-ignore state_referenced_locally
	let index = $state(lessonState(saved) === 'started' ? Math.min(saved!.step, lesson.steps.length - 1) : 0);
	let tonic = $state(lastTonic);
	/** Finished on this visit: the closing panel replaces the step buttons. */
	let finished = $state(false);

	const step = $derived(lesson.steps[index]);
	const isLast = $derived(index === lesson.steps.length - 1);
	const done = $derived(lessonState(learnProgress.lesson(lesson.id)) === 'done');
	const next = $derived(lessonAfter(lesson));
	const items = $derived(lesson.items.flatMap((id) => quizItemById(id) ?? []));

	/** When an exercise comes back: information, never a score. */
	function dueText(itemId: string): string {
		const p = learnProgress.get(itemId);
		const now = Date.now();
		if (!p || isDue(p, now)) return 'due now';
		const days = Math.ceil((p.due - now) / DAY_MS);
		return days <= 1 ? 'back tomorrow' : `back in ${days} days`;
	}

	let heading: HTMLHeadingElement | undefined = $state();
	let closing: HTMLHeadingElement | undefined = $state();

	function go(i: number) {
		if (i < 0 || i >= lesson.steps.length) return;
		finished = false;
		index = i;
		learnProgress.visitLesson(lesson.id, i);
		// Land on the new step: keyboard and screen-reader focus, and the top of
		// it in view when Next was pressed at the bottom of a long one.
		void tick().then(() => heading?.focus());
	}

	function finish() {
		learnProgress.completeLesson(lesson.id, lesson.items);
		finished = true;
		void tick().then(() => closing?.focus());
	}

	function setKey(next: string) {
		tonic = next;
		lastTonic = next;
	}

	function tryInSketch(song: TrySong) {
		// The last step's Sketch button is the lesson's end too.
		if (isLast) learnProgress.completeLesson(lesson.id, lesson.items);
		progression.load(buildTrySong(song, tonic));
		void goto(`${base}/`);
	}

	onMount(() => learnProgress.visitLesson(lesson.id, index));
</script>

<article class="lesson" aria-labelledby="lesson-title">
	<header class="head">
		<a class="back" href="{base}/learn">
			<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square" /></svg>
			The map
		</a>
		<p class="label head__where">
			{#if track}{`Track ${track.number} · `}<span class="name">{track.name}</span>{' · '}{/if}{`Lesson ${lessonNumber(
					lesson
				)}`}{#if done}<span class="head__done">{' · Done'}</span>{/if}
		</p>
		<h2 id="lesson-title" class="head__title">{lesson.title}</h2>
		<p class="hint head__skills">
			{lesson.skills.map((s) => SKILL_NAMES[s]).join(' · ')} · {lesson.steps.length} steps
		</p>
	</header>

	<!-- Every step is a place in the lesson: printed numbers, the one you're on
	     underlined, the ones behind you in full ink. Any step is a tap away. -->
	<nav class="rail" aria-label="Steps" style:--n={lesson.steps.length}>
		<ol class="rail__list">
			{#each lesson.steps as s, i (i)}
				<li>
					<button
						class="rail__step"
						class:rail__step--on={i === index}
						class:rail__step--behind={i < index}
						aria-current={i === index ? 'step' : undefined}
						onclick={() => go(i)}
					>
						<span class="rail__n">{i + 1}</span>
						<span class="rail__kind">{STEP_NAMES[s.kind]}</span>
					</button>
				</li>
			{/each}
		</ol>
	</nav>

	<section class="step" aria-labelledby="step-title">
		<h3 id="step-title" class="step__title" tabindex="-1" bind:this={heading}>
			<span class="label step__count">Step {index + 1} of {lesson.steps.length}</span>
			<span class="step__kind">{step.kind === 'try' ? 'Try it' : STEP_NAMES[step.kind]}</span>
		</h3>
		{#key index}
			<LessonStep {lesson} {step} {index} {tonic} onkey={setKey} ontry={tryInSketch} />
		{/key}
	</section>

	{#if finished}
		<section class="closing" aria-labelledby="closing-title">
			<h3 id="closing-title" class="closing__title" tabindex="-1" bind:this={closing}>Lesson done</h3>
			{#if items.length}
				<p class="closing__text">What it taught is in your review now, in Ear:</p>
				<ul class="closing__items">
					{#each items as item (item.id)}
						<li><span class="closing__name">{item.title}</span> <span class="hint">{dueText(item.id)}</span></li>
					{/each}
				</ul>
			{/if}
			<div class="nav">
				{#if next}
					<a class="bar-btn bar-btn--primary nav__go" href="{base}/learn?lesson={next.id}"
						>Next <span class="nav__name">{next.title}</span></a
					>
				{/if}
				<a class="bar-btn" href="{base}/learn">The map</a>
				{#if items.length}<a class="bar-btn" href="{base}/learn?mode=ear">Ear</a>{/if}
			</div>
		</section>
	{:else}
		<div class="nav" role="group" aria-label="Lesson steps">
			<button class="bar-btn" disabled={index === 0} onclick={() => go(index - 1)}>Back</button>
			{#if isLast}
				<button class="bar-btn bar-btn--primary nav__go" onclick={finish}>Finish lesson</button>
			{:else}
				<button class="bar-btn bar-btn--primary nav__go" onclick={() => go(index + 1)}
					>Next: {STEP_NAMES[lesson.steps[index + 1].kind]}</button
				>
			{/if}
		</div>
	{/if}
</article>

<style lang="scss">
	.lesson {
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
	}

	.head {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	/* Back to the map: a printed word with an arrow, not a box. */
	.back {
		align-self: flex-start;
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		min-height: 32px;
		font-size: 0.75rem;
		font-weight: 800;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink);
		text-decoration: none;
		box-shadow: inset 0 -2px 0 transparent;

		&:hover {
			box-shadow: inset 0 -2px 0 var(--ink);
		}

		@media (pointer: coarse) {
			min-height: var(--tap);
		}
	}

	.head__where,
	.head__skills {
		margin: 0;
	}

	.head__done {
		color: var(--ink);
	}

	/* A track's name inside a label: its own case, never the label's capitals. */
	.name {
		font-size: 0.75rem;
		letter-spacing: 0.02em;
		text-transform: none;
	}

	/* The lesson's name, set like a tune or drill name: condensed, its own case. */
	.head__title {
		margin: 0;
		font-family: var(--font-display);
		font-stretch: var(--display-stretch);
		font-weight: 900;
		font-size: 3rem;
		line-height: 0.95;
	}

	/* The rail: one printed cell per step under a heavy rule, the current step
	   underlined in ink (a place, like the workspace nav). */
	.rail__list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(var(--n), minmax(0, 1fr));
		border-bottom: var(--rule-heavy) solid var(--ink);
		max-width: calc(var(--n) * 8rem);
	}

	.rail__step {
		width: 100%;
		min-height: var(--tap);
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-2) var(--space-2) 0;
		border: 0;
		border-radius: 0;
		background: transparent;
		font-family: inherit;
		color: var(--ink-3);
		text-align: left;
		cursor: pointer;
		box-shadow: inset 0 -4px 0 transparent;

		&:hover {
			color: var(--ink);
			box-shadow: inset 0 -4px 0 var(--rule);
		}
	}

	.rail__step--behind {
		color: var(--ink-2);
	}

	.rail__step--on,
	.rail__step--on:hover {
		color: var(--ink);
		box-shadow: inset 0 -4px 0 var(--ink);
	}

	.rail__n {
		font-family: var(--font-display);
		font-stretch: var(--display-stretch);
		font-weight: 900;
		font-size: 1.5rem;
		line-height: 1;
	}

	.rail__kind {
		font-size: 0.6875rem;
		font-weight: 800;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.step {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.step__title {
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		scroll-margin-top: var(--space-6);

		&:focus {
			outline: none;
		}

		&:focus-visible {
			outline: 2px solid var(--ink);
			outline-offset: 4px;
		}
	}

	.step__kind {
		font-family: var(--font-display);
		font-stretch: var(--display-stretch);
		font-weight: 900;
		font-size: 1.75rem;
		line-height: 1;
		text-transform: uppercase;
	}

	.nav {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.nav__go {
		min-width: 10rem;
	}

	/* The end: what the lesson left you with, in words, then where next. */
	.closing {
		border-top: var(--rule-heavy) solid var(--ink);
		padding-top: var(--space-4);
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.closing__title {
		margin: 0;
		font-family: var(--font-display);
		font-stretch: var(--display-stretch);
		font-weight: 900;
		font-size: 2rem;
		line-height: 1;
		text-transform: uppercase;

		&:focus {
			outline: none;
		}
	}

	.closing__text {
		margin: 0;
		max-width: 62ch;
		font-size: 1rem;
		line-height: 1.5;
	}

	.closing__items {
		list-style: none;
		margin: 0;
		padding: 0;
		border-top: 1px solid var(--rule);
		max-width: 32rem;

		li {
			display: flex;
			align-items: baseline;
			justify-content: space-between;
			gap: var(--space-4);
			padding: var(--space-2) 0;
			border-bottom: 1px solid var(--rule);
		}
	}

	/* An exercise's name, in its own case like a drill's. */
	.closing__name {
		font-family: var(--font-display);
		font-stretch: var(--display-stretch);
		font-weight: 900;
		font-size: 1.25rem;
		line-height: 1;
	}

	/* A lesson's name inside a button: its own case, never the button's capitals. */
	.nav__name {
		font-family: var(--font-display);
		font-stretch: var(--display-stretch);
		font-weight: 900;
		font-size: 1rem;
		letter-spacing: 0;
		text-transform: none;
	}

	@media (max-width: 640px) {
		.lesson {
			gap: var(--space-4);
		}

		.head__title {
			font-size: 2.25rem;
		}

		/* Phones: the number over its word, so six steps share 343px. */
		.rail__step {
			flex-direction: column;
			gap: 2px;
			padding-right: var(--space-1);
		}

		.nav__go {
			flex: 1 1 auto;
		}
	}

	/* 320 wide: six cells of ~48px — the number carries it, the word steps aside
	   (still read out). */
	@media (max-width: 360px) {
		.rail__kind {
			position: absolute;
			width: 1px;
			height: 1px;
			overflow: hidden;
			clip-path: inset(50%);
			white-space: nowrap;
		}
	}
</style>
