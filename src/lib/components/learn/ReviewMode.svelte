<script lang="ts">
	// Review: a few minutes of mixed practice on what is due. The overview says
	// what is due now (or when the next one is back), a session asks up to ten
	// questions interleaved across the due exercises (srs.ts buildSession), and
	// the end says what you reviewed and when each comes back. Information only:
	// no points, streaks or scores.
	//
	// Questions are the Ear's own QuizCard, one card per question (keyed by its
	// place in the session), so tap and MIDI answers both work and every answer
	// is recorded in learnProgress the same way. A card forgets its runs when it
	// goes (learn.forget in its onDestroy), so the next question can never sound
	// the last one. The card registers Space while it is on screen; everywhere
	// else in this mode Space has nothing to play and registers a no-op, or it
	// would start the Sketch song.
	import { base } from '$app/paths';
	import { unlockAudio } from '$lib/audio/context';
	import { KIND_TITLES, QUIZ_ITEMS, quizItemById, type QuizItem } from '$lib/learn/items';
	import { buildSession, DAY_MS, effectiveDue, scheduled, SESSION_SIZE } from '$lib/learn/srs';
	import { learn } from '$lib/stores/learn.svelte';
	import { learnProgress } from '$lib/stores/learnProgress.svelte';
	import { workspace } from '$lib/stores/workspace.svelte';
	import QuizCard from './QuizCard.svelte';

	type Phase = 'start' | 'session' | 'end';

	let phase = $state<Phase>('start');
	/** Frozen when the session starts; answers don't reshuffle it. */
	let session = $state.raw<QuizItem[]>([]);
	let index = $state(0);
	let answers = $state.raw<{ id: string; correct: boolean }[]>([]);
	/** Practising ahead of schedule: said on the card, not counted any differently. */
	let early = $state(false);
	/** The clock the overview reads, refreshed whenever it is shown. */
	let now = $state(Date.now());

	const list = $derived(scheduled(learnProgress.items, QUIZ_ITEMS, now));
	const due = $derived(list.filter((s) => s.due <= now));
	const upcoming = $derived(list.filter((s) => s.due > now));
	/** The session Start would begin: built ahead so the button can say its length. */
	const planned = $derived(buildSession(learnProgress.items, QUIZ_ITEMS, now, Math.random));

	/** How far off a time is, in words: 'tomorrow', 'in 4 days'. */
	function inDays(at: number, from: number): string {
		const days = Math.ceil((at - from) / DAY_MS);
		return days <= 1 ? 'tomorrow' : `in ${days} days`;
	}

	/** When something is back, in words. */
	const when = (at: number, from: number) => (at <= from ? 'due now' : `back ${inDays(at, from)}`);

	function begin(items: QuizItem[], ahead: boolean) {
		if (items.length === 0) return;
		void unlockAudio(); // inside the tap: the first card plays as it mounts
		session = items;
		index = 0;
		answers = [];
		early = ahead;
		phase = 'session';
	}

	function start() {
		begin(planned, false);
	}

	/** Nothing due: practise what is scheduled anyway, the soonest first. */
	function startEarly() {
		now = Date.now();
		const last = upcoming[upcoming.length - 1]?.due ?? now;
		begin(buildSession(learnProgress.items, QUIZ_ITEMS, last, Math.random), true);
	}

	function answered(correct: boolean) {
		const item = session[index];
		if (item) answers = [...answers, { id: item.id, correct }];
	}

	function advance() {
		if (index + 1 < session.length) {
			void unlockAudio();
			index += 1;
		} else finish();
	}

	function finish() {
		learn.stop();
		now = Date.now();
		phase = answers.length > 0 ? 'end' : 'start';
	}

	function done() {
		now = Date.now();
		phase = 'start';
	}

	/** What you reviewed, each exercise once, in the order it first came up. */
	const reviewed = $derived.by(() => {
		const seen = new Map<string, number>();
		for (const a of answers) seen.set(a.id, (seen.get(a.id) ?? 0) + 1);
		return [...seen].flatMap(([id, count]) => {
			const item = quizItemById(id);
			const p = learnProgress.get(id);
			return item ? [{ item, count, back: p ? effectiveDue(p, now) : now }] : [];
		});
	});

	// Space: in a session the QuizCard on screen registers its own question;
	// anywhere else in this mode there is nothing to play.
	$effect(() => {
		if (phase !== 'session') return workspace.register(() => {});
	});
</script>

{#snippet itemRow(item: QuizItem, note: string)}
	<li class="row">
		<span class="row__name">{item.title}</span>
		<span class="label row__kind">{KIND_TITLES[item.spec.kind]}</span>
		<span class="hint row__when">{note}</span>
	</li>
{/snippet}

{#if phase === 'session'}
	{@const item = session[index]}
	<div class="session">
		<div class="session__head">
			<p class="label session__count" aria-live="polite">
				Question {index + 1} of {session.length}{early ? ' · Practising early' : ''}
			</p>
			<button class="bar-btn bar-btn--quiet" onclick={finish}>End review</button>
		</div>
		<!-- One card per question: a new card is a new owner, a new Space action,
		     and the last question's runs forgotten. -->
		{#key index}
			<QuizCard
				{item}
				autoplay
				onanswer={answered}
				onnext={advance}
				nextLabel={index + 1 < session.length ? 'Next question' : 'Finish review'}
			/>
		{/key}
	</div>
{:else if phase === 'end'}
	<section class="card" aria-labelledby="review-end-title">
		<h2 id="review-end-title" class="display card__title">Reviewed</h2>
		<p class="card__lede">
			{answers.length === 1 ? 'One question' : `${answers.length} questions`} across {reviewed.length === 1
				? 'one exercise'
				: `${reviewed.length} exercises`}. Here is when each comes back.
		</p>
		<ul class="rows">
			{#each reviewed as r (r.item.id)}
				{@render itemRow(r.item, `${r.count === 1 ? '1 question' : `${r.count} questions`} · ${when(r.back, now)}`)}
			{/each}
		</ul>
		<p class="hint card__note">
			A miss brings an exercise back tomorrow; each answer given on time sends it further out.
		</p>
		<div class="actions">
			{#if due.length > 0}
				<button class="bar-btn bar-btn--primary actions__go" onclick={() => ((now = Date.now()), start())}
					>Review again</button
				>
			{/if}
			<button class="bar-btn" onclick={done}>Done</button>
		</div>
	</section>
{:else}
	<section class="card" aria-labelledby="review-title">
		{#if due.length > 0}
			<h2 id="review-title" class="display card__title">Due now</h2>
			<p class="card__lede">
				{#if due.length === 1}
					One exercise is due: a session asks it once.
				{:else}
					{due.length} exercises are due. A session mixes them, up to {SESSION_SIZE} questions, never the same one twice
					in a row.
				{/if}
			</p>
			<ul class="rows">
				{#each due as s (s.item.id)}
					{@render itemRow(s.item, 'due now')}
				{/each}
			</ul>
			<div class="actions">
				<button class="bar-btn bar-btn--primary actions__go" onclick={start}>
					Start review · {planned.length === 1 ? '1 question' : `${planned.length} questions`}
				</button>
			</div>
		{:else if upcoming.length > 0}
			{@const soonest = upcoming[0]}
			<h2 id="review-title" class="display card__title">Nothing due</h2>
			<p class="card__lede">
				Next back: <span class="card__name">{soonest.item.title}</span>, {inDays(soonest.due, now)}.
			</p>
			<div class="actions">
				<button class="bar-btn actions__go" onclick={startEarly}>Practise early</button>
				<p class="hint actions__note">
					An early right answer doesn't move anything later; a miss still brings it back sooner.
				</p>
			</div>
		{:else}
			<h2 id="review-title" class="display card__title">Nothing to review yet</h2>
			<p class="card__lede">
				Answer a few questions in Ear, or finish a lesson. What you practise comes back here when it's due.
			</p>
			<div class="actions">
				<a class="bar-btn bar-btn--primary actions__go" href="{base}/learn?mode=ear">Ear</a>
				<a class="bar-btn" href="{base}/learn">The map</a>
			</div>
		{/if}
	</section>

	{#if upcoming.length > 0 && (due.length > 0 || upcoming.length > 1)}
		<section class="later" aria-labelledby="later-title">
			<h2 id="later-title" class="display later__title">Coming back</h2>
			<ul class="rows">
				{#each upcoming as s (s.item.id)}
					{@render itemRow(s.item, when(s.due, now))}
				{/each}
			</ul>
		</section>
	{/if}
{/if}

<style lang="scss">
	.card {
		border: var(--rule-heavy) solid var(--ink);
		padding: var(--space-4) var(--space-6) var(--space-6);
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-3);
	}

	.card__title {
		margin: 0;
		font-size: 2rem;
	}

	.card__lede {
		margin: 0;
		max-width: 62ch;
		font-size: 1.0625rem;
		line-height: 1.5;
	}

	.card__note {
		margin: 0;
		max-width: 62ch;
	}

	/* An exercise's name in running text: its own case, set like a drill's. */
	.card__name {
		font-family: var(--font-display);
		font-stretch: var(--display-stretch);
		font-weight: 900;
		font-size: 1.25rem;
	}

	/* The exercises as a tracklist under hairlines: name, kind, when. */
	.rows {
		list-style: none;
		margin: 0;
		padding: 0;
		align-self: stretch;
		border-top: 1px solid var(--rule);
	}

	.row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: baseline;
		gap: 2px var(--space-4);
		padding: var(--space-2) 0;
		border-bottom: 1px solid var(--rule);
	}

	/* A name: condensed, its own case, never capitals. */
	.row__name {
		font-family: var(--font-display);
		font-stretch: var(--display-stretch);
		font-weight: 900;
		font-size: 1.375rem;
		line-height: 1;
	}

	.row__kind {
		grid-column: 1;
	}

	.row__when {
		grid-column: 2;
		grid-row: 1 / span 2;
		align-self: center;
		text-align: right;
		color: var(--ink-2);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-4);
		margin-top: var(--space-1);
	}

	.actions__go {
		min-height: var(--tap);
		padding: 0 var(--space-6);
	}

	.actions__note {
		flex: 1 1 16rem;
		margin: 0;
	}

	.session {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.session__head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
	}

	.session__count {
		margin: 0;
		color: var(--ink);
	}

	/* What's scheduled, on the board under a heavy rule. */
	.later {
		border-top: var(--rule-heavy) solid var(--ink);
		padding-top: var(--space-3);
	}

	.later__title {
		margin: 0 0 var(--space-2);
		font-size: 1.75rem;
	}

	@media (max-width: 640px) {
		.card {
			padding: var(--space-3) var(--space-4) var(--space-4);
		}

		.actions {
			align-self: stretch;
		}

		.actions__go {
			flex: 1 1 100%;
		}
	}
</style>
