<script lang="ts" module>
	// The exercise you were on, for the rest of the session: coming back to Ear
	// from the map (or another workspace) opens where you left off.
	let lastItemId: string | null = null;
</script>

<script lang="ts">
	// Ear: hear a few bars with the band, then name what you heard. One exercise
	// at a time (a quiz item), one question at a time (QuizCard). Answers are
	// tapped, or played on a MIDI keyboard where the browser has Web MIDI.
	import { KIND_TITLES, QUIZ_ITEMS, quizItemById, type QuizKind } from '$lib/learn/items';
	import QuizCard from './QuizCard.svelte';

	const KINDS: QuizKind[] = ['function', 'loop', 'quality'];
	const groups = KINDS.map((kind) => ({
		kind,
		title: KIND_TITLES[kind],
		items: QUIZ_ITEMS.filter((item) => item.spec.kind === kind)
	}));

	let itemId = $state(lastItemId ?? QUIZ_ITEMS[0].id);
	const item = $derived(quizItemById(itemId) ?? QUIZ_ITEMS[0]);

	function choose(id: string) {
		itemId = id;
		lastItemId = id;
	}
</script>

<div class="ear">
	<label class="field ear__pick">
		<span class="label">Exercise</span>
		<select class="field__select" value={item.id} onchange={(e) => choose((e.target as HTMLSelectElement).value)}>
			{#each groups as group (group.kind)}
				<optgroup label={group.title}>
					{#each group.items as option (option.id)}
						<option value={option.id}>{option.title}</option>
					{/each}
				</optgroup>
			{/each}
		</select>
	</label>

	<!-- A new exercise is a new card: its own questions, its own Space action. -->
	{#key item.id}
		<QuizCard {item} />
	{/key}

	<p class="hint ear__note">
		Questions in a key open with its cadence, so every chord is heard against home. Your answers
		stay on this device; they decide when an exercise comes back for review.
	</p>
</div>

<style lang="scss">
	.ear {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.ear__pick {
		align-self: flex-start;
		max-width: 100%;

		.field__select {
			min-width: 14rem;
			max-width: 100%;
		}
	}

	.ear__note {
		margin: 0;
		max-width: 60ch;
	}
</style>
