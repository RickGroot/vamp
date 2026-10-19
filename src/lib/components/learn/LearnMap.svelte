<script lang="ts">
	// The Learn map: the ten tracks as a route, from the shared start through a
	// fork into a pop/rock side and a jazz side, joining again at the end. The
	// order is a suggestion, never a lock: every lesson is a link. Each lesson
	// says where you are in it (information, never a score), and the card on
	// top suggests what to open next (curriculum.ts `nextLesson`).
	//
	// Hear home, the old first card, is now the first lesson of track 0.
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import {
		lessonsOf,
		lessonState,
		lessonNumber,
		nextLesson,
		SKILL_NAMES,
		SIDE_NAMES,
		trackById,
		trackDone,
		TRACKS,
		type Lesson,
		type Side,
		type Track
	} from '$lib/learn/curriculum';
	import { learnProgress } from '$lib/stores/learnProgress.svelte';
	import { workspace } from '$lib/stores/workspace.svelte';

	const progress = $derived(learnProgress.lessons);
	const next = $derived(nextLesson(progress));
	const nextProgress = $derived(next ? learnProgress.lesson(next.id) : undefined);
	const nextState = $derived(lessonState(nextProgress));
	const nextTrack = $derived(next ? trackById(next.track) : null);
	/** Nothing started or finished yet: the card says where to begin. */
	const fresh = $derived(Object.values(progress).every((p) => lessonState(p) === 'new'));

	const bySide = (side: Side) => TRACKS.filter((t) => t.side === side).sort((a, b) => a.number - b.number);
	const shared = bySide('shared');
	const pop = bySide('pop');
	const jazz = bySide('jazz');
	const joined = bySide('joined');

	function stateLabel(lesson: Lesson): string {
		const p = learnProgress.lesson(lesson.id);
		const state = lessonState(p);
		if (state === 'done') return 'Done';
		if (state === 'started') return `Step ${(p?.step ?? 0) + 1} of ${lesson.steps.length}`;
		return next?.id === lesson.id ? 'Next up' : `${lesson.steps.length} steps`;
	}

	// The map plays nothing; Space must not start the Sketch song from here.
	onMount(() => workspace.register(() => {}));
</script>

{#snippet trackEntry(track: Track)}
	{@const lessons = lessonsOf(track)}
	{@const doneCount = trackDone(track, progress)}
	{@const later = lessons.length === 0}
	<li
		class="track"
		class:track--later={later}
		class:track--done={!later && doneCount === lessons.length}
		class:track--started={!later && doneCount > 0 && doneCount < lessons.length}
	>
		<span class="track__stop" aria-hidden="true"></span>
		<div class="track__head">
			<h4 class="track__name"><span class="track__num">{track.number}</span> {track.name}</h4>
			<p class="label track__state">{later ? 'Coming later' : `${doneCount} of ${lessons.length} done`}</p>
			<p class="hint track__summary">{track.summary}</p>
		</div>
		{#if lessons.length}
			<ol class="lessons" aria-label="{track.name}: lessons">
				{#each lessons as lesson (lesson.id)}
					{@const state = lessonState(learnProgress.lesson(lesson.id))}
					<li>
						<a
							class="lesson lesson--{state}"
							class:lesson--next={next?.id === lesson.id}
							href="{base}/learn?lesson={lesson.id}"
						>
							<span class="lesson__mark" aria-hidden="true"></span>
							<span class="lesson__num">{lessonNumber(lesson)}</span>
							<span class="lesson__title">{lesson.title}</span>
							<span class="label lesson__state">{stateLabel(lesson)}</span>
						</a>
					</li>
				{/each}
			</ol>
		{/if}
	</li>
{/snippet}

{#if next}
	<section class="up" aria-labelledby="up-title">
		<p class="label up__eyebrow">
			{fresh ? 'Start here' : nextState === 'started' ? 'Carry on' : 'Next up'}
			{#if nextTrack}{' · '}Track {nextTrack.number}{' · '}<span class="name">{nextTrack.name}</span>{/if}
		</p>
		<h2 id="up-title" class="up__title">{next.title}</h2>
		<p class="hint up__meta">
			Lesson {lessonNumber(next)} · {next.skills.map((s) => SKILL_NAMES[s]).join(' · ')} · {next.steps.length} steps
		</p>
		<a class="bar-btn bar-btn--primary up__go" href="{base}/learn?lesson={next.id}">
			{nextState === 'started' ? `Continue at step ${(nextProgress?.step ?? 0) + 1}` : 'Start lesson'}
		</a>
	</section>
{:else}
	<section class="up" aria-labelledby="up-title">
		<h2 id="up-title" class="up__title">Every lesson so far is done</h2>
		<p class="hint up__meta">More tracks are on the way. Until then, Ear keeps what you've learned fresh.</p>
		<a class="bar-btn up__go" href="{base}/learn?mode=ear">Ear</a>
	</section>
{/if}

<section class="map" aria-labelledby="map-title">
	<div class="map__head">
		<h2 id="map-title" class="display map__title">Tracks</h2>
		<p class="hint map__hint">A suggested order, not a locked one: open any lesson.</p>
	</div>

	<!-- The route: a heavy ink line through every track, a stop at each. It
	     forks after the loops and joins again; tracks still to come are dashed. -->
	<div class="route">
		<ol class="line line--shared">
			{#each shared as track (track.id)}{@render trackEntry(track)}{/each}
		</ol>

		<div class="fork">
			<section class="side" aria-labelledby="side-pop">
				<h3 id="side-pop" class="label side__title">{SIDE_NAMES.pop}</h3>
				<ol class="line">
					{#each pop as track (track.id)}{@render trackEntry(track)}{/each}
				</ol>
			</section>
			<section class="side" aria-labelledby="side-jazz">
				<h3 id="side-jazz" class="label side__title">{SIDE_NAMES.jazz}</h3>
				<ol class="line">
					{#each jazz as track (track.id)}{@render trackEntry(track)}{/each}
				</ol>
			</section>
		</div>

		<section class="side side--joined" aria-labelledby="side-joined">
			<h3 id="side-joined" class="label side__title">Both sides</h3>
			<ol class="line">
				{#each joined as track (track.id)}{@render trackEntry(track)}{/each}
			</ol>
		</section>
	</div>
</section>

<style lang="scss">
	/* ---- Next up: a printed card, the lesson's name in the display face ---- */
	.up {
		border: var(--rule-heavy) solid var(--ink);
		padding: var(--space-4) var(--space-6) var(--space-6);
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-2);
	}

	.up__eyebrow,
	.up__meta {
		margin: 0;
	}

	/* A track's name inside a label: its own case, never the label's capitals. */
	.name {
		font-size: 0.75rem;
		letter-spacing: 0.02em;
		text-transform: none;
	}

	/* A lesson's name: condensed, in its own case, like a tune's. */
	.up__title {
		margin: 0;
		font-family: var(--font-display);
		font-stretch: var(--display-stretch);
		font-weight: 900;
		font-size: 2.75rem;
		line-height: 0.95;
	}

	.up__go {
		margin-top: var(--space-2);
		min-height: var(--tap);
		min-width: 11rem;
		padding: 0 var(--space-6);
	}

	/* ---- The map ---- */
	.map {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		/* The route's geometry, shared by the line, the stops and the fork. */
		--line: var(--rule-heavy);
		--stop: 14px;
		--indent: var(--space-6);
		--fork-gap: var(--space-6);
		--bend: var(--space-6);
		--later: var(--ink-4);
	}

	.map__head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-1) var(--space-4);
		border-top: var(--rule-heavy) solid var(--ink);
		padding-top: var(--space-3);
	}

	.map__title {
		margin: 0;
		font-size: 1.75rem;
	}

	.map__hint {
		margin: 0;
	}

	/* One line of the route. Its own border is the dashed "still to come" line;
	   each built track inks its stretch of it solid. */
	.line {
		list-style: none;
		margin: 0;
		padding: 0;
		border-left: var(--line) dashed var(--later);
		/* Tracks lay themselves out by the line's width (the trunk vs a side);
		   a container can't query itself, so the line is the container. */
		container-type: inline-size;
	}

	.line--shared {
		border-left-style: solid;
		border-left-color: var(--ink);
	}

	.track {
		position: relative;
		margin-left: calc(-1 * var(--line));
		border-left: var(--line) solid var(--ink);
		padding: 0 0 var(--space-6) var(--indent);
		display: grid;
		gap: var(--space-2) var(--space-6);
	}

	.track--later {
		border-left-color: transparent;
	}

	/* The stop on the line: open while there's work in it, inked once done,
	   grey for a track still to come. Square, like everything printed here. */
	.track__stop {
		position: absolute;
		top: 0.3rem;
		left: calc(-1 * (var(--stop) + var(--line)) / 2);
		width: var(--stop);
		height: var(--stop);
		background: var(--ground);
		border: var(--line) solid var(--ink);
	}

	.track--started .track__stop {
		background: linear-gradient(to top, var(--ink) 50%, var(--ground) 50%);
	}

	.track--done .track__stop {
		background: var(--ink);
	}

	.track--later .track__stop {
		border-color: var(--later);
	}

	.track__head {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-width: 0;
	}

	/* A track's name: condensed, its own case; its number set big beside it. */
	.track__name {
		margin: 0;
		font-family: var(--font-display);
		font-stretch: var(--display-stretch);
		font-weight: 900;
		font-size: 1.5rem;
		line-height: 1;
	}

	.track__num {
		margin-right: 0.15em;
	}

	.track__state,
	.track__summary {
		margin: 0;
	}

	.track--later .track__name {
		color: var(--ink-3);
	}

	/* Wide (the trunk on a desktop): what the track is about on the left, its
	   lessons as a tracklist on the right. */
	@container (min-width: 560px) {
		.track {
			grid-template-columns: minmax(0, 17rem) minmax(0, 1fr);
		}

		/* No lessons yet: what it will be about takes the whole width. */
		.track--later {
			grid-template-columns: minmax(0, 40rem);
		}
	}

	/* The lessons: a tracklist under hairlines, each one a link. */
	.lessons {
		list-style: none;
		margin: 0;
		padding: 0;
		border-top: 1px solid var(--rule);
		min-width: 0;
	}

	.lesson {
		display: grid;
		grid-template-columns: auto auto minmax(0, 1fr) auto;
		align-items: baseline;
		gap: var(--space-1) var(--space-2);
		min-height: var(--tap);
		padding: var(--space-2) var(--space-1) var(--space-2) 0;
		border-bottom: 1px solid var(--rule);
		color: var(--ink);
		text-decoration: none;

		&:hover {
			background: var(--wash);
		}

		&:focus-visible {
			outline-offset: -2px;
		}
	}

	.lesson__mark {
		align-self: center;
		width: 10px;
		height: 10px;
		border: var(--line) solid var(--ink);
	}

	.lesson--started .lesson__mark {
		background: linear-gradient(to top, var(--ink) 50%, transparent 50%);
	}

	.lesson--done .lesson__mark {
		background: var(--ink);
	}

	.lesson__num {
		font-size: 0.75rem;
		font-weight: 800;
		font-variant-numeric: tabular-nums;
		color: var(--ink-3);
	}

	.lesson__title {
		font-size: 1rem;
		font-weight: 700;
		line-height: 1.25;
	}

	.lesson__state {
		justify-self: end;
		white-space: nowrap;
		color: var(--ink-3);
	}

	.lesson--done .lesson__state,
	.lesson--started .lesson__state,
	.lesson--next .lesson__state {
		color: var(--ink);
	}

	/* The suggested lesson carries a heavy rule under it, like the slot to fill
	   next in a quiz. */
	.lesson--next {
		border-bottom: var(--rule-heavy) solid var(--ink);
	}

	/* ---- The fork: the line bends right into the jazz side, and both sides
	   bend back into one line before the joined tracks. ---- */
	.fork {
		position: relative;
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		column-gap: var(--fork-gap);
		padding: var(--bend) 0;

		/* The split: down from the trunk, across, and down into the jazz side.
		   Its right edge sits exactly on the jazz line (50% + half the gap). */
		&::before,
		&::after {
			content: '';
			position: absolute;
			left: 0;
			width: calc(50% + var(--fork-gap) / 2 + var(--line));
			height: var(--bend);
			border: var(--line) solid var(--ink);
		}

		&::before {
			top: 0;
			border-bottom: 0;
		}

		/* The join: up from both sides into one line. Both sides end on tracks
		   still to come, so it is dashed. */
		&::after {
			bottom: 0;
			border-top: 0;
			border-style: dashed;
			border-color: var(--later);
		}
	}

	.side {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	/* A side's name sits on its line, where the route enters it. */
	.side__title {
		margin: 0;
		padding: 0 0 var(--space-3) var(--indent);
		border-left: var(--line) solid var(--ink);
		color: var(--ink);
	}

	/* A side's line runs on to the join, so the shorter side still meets it. */
	.side .line {
		flex: 1 1 auto;
	}

	.side--joined .side__title {
		border-left: var(--line) dashed var(--later);
		color: var(--ink-3);
	}

	@media (max-width: 640px) {
		.up {
			padding: var(--space-3) var(--space-4) var(--space-4);
		}

		.up__title {
			font-size: 2.25rem;
		}

		.up__go {
			align-self: stretch;
		}

		.map {
			--indent: var(--space-4);
			--fork-gap: var(--space-3);
			--bend: var(--space-4);
		}

		/* Two sides of ~160px: the names and lessons carry them; what each track
		   is about waits for the lesson. */
		.fork .track__summary {
			display: none;
		}

		.fork .track__name {
			font-size: 1.25rem;
		}

		/* In a narrow side the state goes under the title. */
		.fork .lesson {
			grid-template-columns: auto minmax(0, 1fr);
		}

		.fork .lesson__num {
			display: none;
		}

		.fork .lesson__state {
			grid-column: 2;
			justify-self: start;
		}

		.fork .lesson__title {
			font-size: 0.9375rem;
		}
	}
</style>
