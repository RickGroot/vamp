<script lang="ts">
	// One lick, call and response: Play = a count-in, the lick over its band (the
	// CALL), then the same band with no line (YOUR TURN). The staff stays hidden
	// until the turn is over; you say Got it or Not yet (self-check only), and the
	// answer is recorded through the same store as an Ear question. Nothing starts
	// by itself: the key is shown, and a tap on Play begins.
	//
	// With the Keyboard on (Chromium Web MIDI) the turn is collected from the
	// keyboard instead: the notes played are graded by pitch class and in order (no
	// rhythm, any octave), the verdict is recorded at once, and the staff is marked
	// with X noteheads on what was missed. Got it / Not yet still works, and may
	// correct the keyboard once (rerecord from the pre-question snapshot). While the
	// card holds the keyboard nothing played reaches the song (midi.captureNotes).
	import { onDestroy, onMount, untrack } from 'svelte';
	import { unlockAudio } from '$lib/audio/context';
	import { learn } from '$lib/stores/learn.svelte';
	import { learnProgress } from '$lib/stores/learnProgress.svelte';
	import { midi } from '$lib/stores/midi.svelte';
	import { view } from '$lib/stores/view.svelte';
	import { workspace } from '$lib/stores/workspace.svelte';
	import { lickFor, type LickItem } from '$lib/learn/lickItems';
	import { spokenNote } from '$lib/model/symbol';
	import {
		CALL_TEMPO,
		CALL_TEMPOS,
		callPhase,
		callStatus,
		keyboardLine,
		lickCallRun,
		pickLickKey,
		turnDelayMs,
		type CallPhase,
		type LickCallRun,
		type Verdict
	} from '$lib/learn/lickCall';
	import {
		CLOSED_WINDOW,
		OPEN_ANSWER,
		answerStep,
		gradeDue,
		marksByNote,
		missedWords,
		windowStep,
		type AnswerState,
		type TurnWindow
	} from '$lib/learn/lickTurn';
	import { gradeLine, type LineGrade } from '$lib/learn/grade';
	import type { ItemProgress } from '$lib/learn/srs';
	import { DAY_MS, backWhen, isDue } from '$lib/learn/srs';
	import { LICK_STYLE_NAMES } from '$lib/licks/library';
	import DrillStaff from '$lib/components/practice/DrillStaff.svelte';
	import ChordSymbol from '../ChordSymbol.svelte';

	interface Props {
		item: LickItem;
		/** A key picked for the session; null/undefined = any key that fits. */
		fixedKey?: string | null;
		onanswer?: (correct: boolean) => void;
		/** Review's own "next": the primary button moves on instead of asking this lick again. */
		onnext?: () => void;
		/** Review only: move on without recording (a lick you can't play right now). */
		onskip?: () => void;
		nextLabel?: string;
	}
	let { item, fixedKey = null, onanswer, onnext, onskip, nextLabel = 'Next lick' }: Props = $props();

	const lick = $derived(lickFor(item));

	let serial = $state(0);
	let tempo = $state<number>(CALL_TEMPO);
	let keyName = $state<string | null>(null);
	let heard = $state(false);
	let showNotes = $state(false);
	let stopped = $state(false);
	let clockTurn = $state(false);
	// The answer: what is shown, whether it can still be corrected, and who gave it.
	let ans = $state.raw<AnswerState>(OPEN_ANSWER);
	const answer = $derived<Verdict | null>(ans.shown);
	let win = $state.raw<TurnWindow>(CLOSED_WINDOW);
	let grade = $state.raw<LineGrade | null>(null);
	// The record as it was BEFORE this question, for the one correction (rerecord).
	let before: ItemProgress | undefined;
	let nextButton = $state<HTMLButtonElement>();

	// One owner per question; the item id is in it, so two items over one lick never share one.
	const owner = $derived(`lick:${item.id}:${serial}`);

	/** The key for this question: the pick, else a random one that fits the range and isn't the last. */
	function chooseKey(previous?: string): string | null {
		if (fixedKey) return fixedKey;
		const l = lick;
		return l ? pickLickKey(l, view.offset, Math.random, previous) : null;
	}
	keyName = untrack(() => chooseKey());

	const built = $derived.by((): LickCallRun | null => {
		if (!lick || !keyName) return null;
		const r = lickCallRun(lick, { root: keyName, offset: view.offset, tempo });
		return r.ok ? r.call : null;
	});
	const call = $derived(built);
	const missingLick = $derived(!lick);
	const noKey = $derived(!!lick && !call);

	const phase = $derived<CallPhase>(
		callPhase(learn.phase, learn.cue, call?.turnCue ?? 0, learn.activeFor(owner), clockTurn)
	);
	const callSounding = $derived(learn.activeFor(owner));
	const hearing = $derived(learn.activeFor(`${owner}:hear`));
	// Hear the lick is sound too: Play reads Stop, the tempo is held, Space stops it.
	const sounding = $derived(callSounding || hearing);

	// The fallback clock for a late or lost turn marker starts when the plan is
	// really playing (not at the tap, when samples may still be loading), and its
	// cleanup clears it on stop, forget, a new run and unmount.
	$effect(() => {
		if (!call || !callSounding || learn.phase !== 'playing') return;
		const t = setTimeout(() => (clockTurn = true), turnDelayMs(call));
		return () => clearTimeout(t);
	});

	const kbdOn = $derived(midi.status === 'on');
	const MARK_NOW = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

	// Hold the keyboard for as long as the card is mounted with it on, so nothing
	// played on this card can reach the song. The release also runs on unmount.
	$effect(() => {
		if (!kbdOn) return;
		const release = midi.captureNotes((note, atMs) => {
			win = windowStep(win, { type: 'note', midi: note, atMs });
		});
		return release;
	});

	// Open / close the turn window from the call's phase. Declared before the arm
	// below: the first 'ready' closes the window, and arming then re-opens it.
	$effect(() => {
		const p = phase;
		untrack(() => {
			win = windowStep(win, { type: 'phase', phase: p, atMs: MARK_NOW() });
			// 'ready' closes the window; an unanswered turn stays armed for the next Play.
			if (p === 'ready' && kbdOn && ans.shown === null) win = windowStep(CLOSED_WINDOW, { type: 'arm' });
		});
	});

	// Armed whenever the keyboard is on and nothing has been answered yet.
	$effect(() => {
		const on = kbdOn;
		untrack(() => {
			if (on && ans.shown === null) {
				win = windowStep(win, { type: 'arm' });
				// Switched on mid-turn: replay the current phase so the window opens.
				if (phase === 'turn' || phase === 'done') win = windowStep(win, { type: 'phase', phase, atMs: MARK_NOW() });
			} else win = windowStep(win, { type: 'disarm' });
		});
	});

	// Grade when the line is complete and settled, or when the turn is over.
	$effect(() => {
		const w = win;
		const c = call;
		if (!c || !kbdOn || w.state === 'graded' || w.state === 'closed') return;
		if (untrack(() => ans.shown) !== null) return;
		const d = gradeDue(w, c.expected, MARK_NOW());
		if (d.due) {
			untrack(() => gradeWindow(w, c));
			return;
		}
		if (d.waitMs === null) return;
		const t = setTimeout(() => (win = { ...win }), d.waitMs + 1);
		return () => clearTimeout(t);
	});

	function gradeWindow(w: TurnWindow, c: LickCallRun) {
		const g = gradeLine(c.expected, w.notes.map((n) => n.midi));
		win = windowStep(w, { type: 'graded' });
		grade = g;
		if (g.verdict === 'none') {
			// Too little heard to judge: nothing recorded, the card says so.
			if (sounding) stop();
			heard = true;
			return;
		}
		if (sounding) stop();
		heard = true;
		showNotes = true;
		answerWith('keyboard', g.verdict);
	}

	/** Every verdict goes through answerStep: the keyboard first, one correction after. */
	function answerWith(from: 'keyboard' | 'self', verdict: Verdict) {
		const { state, record } = answerStep(ans, { from, verdict });
		ans = state;
		if (!record) return;
		const correct = record.verdict === 'right';
		if (record.how === 'first') {
			before = learnProgress.items[item.id];
			learnProgress.record(item.id, correct);
		} else {
			learnProgress.rerecord(item.id, before, correct);
		}
		onanswer?.(correct);
	}

	function toggleKeyboard() {
		if (midi.status === 'on') midi.disable();
		else void midi.enable();
	}

	/** A fresh, armed turn window (when the keyboard is on and nothing is answered). */
	function rearm() {
		grade = null;
		win = kbdOn && ans.shown === null ? windowStep(CLOSED_WINDOW, { type: 'arm' }) : CLOSED_WINDOW;
	}

	function forgetAll() {
		learn.forget(owner);
		learn.forget(`${owner}:note`);
		learn.forget(`${owner}:hear`);
	}

	// The turn has been played out once the run is done.
	$effect(() => {
		if (phase === 'done') heard = true;
	});

	// The pitch select moves the written staff and rebuilds the call; what was
	// sounding under the old one must not be replayed.
	let lastOffset = untrack(() => view.offset);
	$effect(() => {
		const off = view.offset;
		if (off === lastOffset) return;
		lastOffset = off;
		untrack(() => {
			forgetAll();
			clockTurn = false;
			stopped = false;
			if (answer === null) {
				heard = false;
				rearm();
			}
			// The key that fit the old instrument may not fit this one: pick another unless one was asked for.
			if (!fixedKey && lick && (!keyName || !lickCallRun(lick, { root: keyName, offset: off, tempo }).ok)) {
				keyName = chooseKey(keyName ?? undefined);
			}
		});
	});

	// ---- actions (each called straight from a tap: nothing awaited before play) ----

	function play() {
		if (!call) return;
		unlockAudio();
		if (sounding) {
			stop();
			return;
		}
		clockTurn = false;
		stopped = false;
		// A second attempt is heard, not read.
		if (answer === null) {
			showNotes = false;
			rearm();
		}
		void learn.play(call, owner);
	}

	function stop() {
		// Stopping once your turn has begun still counts as having heard the lick,
		// so you can say how it went (a Review session can't be stranded on a lick).
		if (phase === 'turn') heard = true;
		learn.stop();
		clockTurn = false;
		stopped = true;
	}

	function toggle() {
		if (!call) return;
		if (sounding) stop();
		else play();
	}

	function hear() {
		if (!call) return;
		unlockAudio();
		if (sounding) {
			stop();
			return;
		}
		clockTurn = false;
		stopped = false;
		void learn.play(call.hear, `${owner}:hear`);
	}

	function say(correct: boolean) {
		if (ans.locked || !heard) return;
		if (sounding) stop();
		answerWith('self', correct ? 'right' : 'wrong');
		showNotes = true;
	}

	function next() {
		forgetAll();
		const previous = keyName ?? undefined;
		serial += 1;
		heard = false;
		showNotes = false;
		stopped = false;
		clockTurn = false;
		ans = OPEN_ANSWER;
		before = undefined;
		rearm();
		keyName = chooseKey(previous);
	}

	function setTempo(value: number) {
		if (sounding || !CALL_TEMPOS.includes(value as (typeof CALL_TEMPOS)[number])) return;
		forgetAll();
		tempo = value;
		clockTurn = false;
		stopped = false;
		if (answer === null) {
			heard = false;
			rearm();
		}
	}

	onMount(() => workspace.register(toggle));
	onDestroy(forgetAll);

	$effect(() => {
		if (answer !== null && ans.source === 'self' && nextButton) nextButton.focus({ preventScroll: true });
	});

	// ---- what the card says ----

	const schedule = $derived.by(() => {
		const p = learnProgress.items[item.id];
		if (!p || p.seen === 0) return 'New';
		const now = Date.now();
		if (isDue(p, now)) return 'Due for review';
		const days = Math.ceil((p.due - now) / DAY_MS);
		return days <= 1 ? 'Review tomorrow' : `Review in ${days} days`;
	});

	const back = $derived.by(() => {
		if (answer === null) return null;
		const p = learnProgress.items[item.id];
		return p ? backWhen(p.due, Date.now()) : null;
	});

	const status = $derived.by(() => {
		if (hearing) return 'Listen.';
		if (stopped && phase === 'ready' && answer === null && grade?.verdict !== 'none') return 'Stopped. Play to start again.';
		// Say what was missed in words too: the X noteheads are not the only carrier.
		// The strays are already in the line, so only the missed notes are added.
		const words = ans.source === 'keyboard' && answer === 'wrong' ? missedWords(grade, false) : '';
		const backTail = back ? ` ${back.charAt(0).toUpperCase() + back.slice(1)}.` : '';
		const shown: CallPhase = heard && phase === 'ready' ? 'done' : phase;
		const line = callStatus({
			phase: shown,
			missingLick,
			noKey,
			fixedKey: !!fixedKey,
			kbd: kbdOn,
			early: win.ring.length,
			played: win.notes.length,
			expected: call?.expected.length ?? 0,
			grade,
			answer,
			source: ans.source,
			back: words ? null : back
		});
		return words ? `${line} ${words}${backTail}` : line;
	});

	const staffShown = $derived(showNotes || answer !== null);
	// X noteheads on the notes a keyboard answer missed; nothing for a self-check.
	const marks = $derived(
		call && ans.source === 'keyboard' && grade ? marksByNote(call.staff.notes, grade.marks) : null
	);
	const playLabel = $derived(sounding ? 'Stop' : heard ? 'Play again' : 'Play');
	const modeName = $derived(lick?.mode ?? 'major');
</script>

<!-- The card takes the key's colour locally, like the Ear card: Play is the
     page's one block of colour and the key is printed beside it. -->
<section
	class="card"
	aria-labelledby="lick-title-{serial}"
	style:--field={`var(--c-${modeName})`}
	style:--on-field="var(--on-pigment)"
>
	<div class="card__head">
		<h2 id="lick-title-{serial}" class="card__title">{lick?.name ?? item.title}</h2>
		<span class="label card__schedule">{schedule}</span>
		<p class="hint card__lede">
			{#if lick}{LICK_STYLE_NAMES[lick.style]} · {lick.feel === 'swing' ? 'swung' : 'straight'} · {/if}{item.lede}
		</p>
	</div>

	<div class="deck">
		<div class="deck__key">
			<span class="label">Key</span>
			<span class="deck__keyname">
				{#if keyName}
					<span class="deck__root" aria-hidden="true"><ChordSymbol symbol={keyName} /></span><span
						class="visually-hidden">{spokenNote(keyName)}</span
					>
					{modeName}
				{:else}
					No key
				{/if}
			</span>
		</div>
		<label class="field deck__tempo">
			<span class="label">Tempo</span>
			<select
				class="field__select"
				value={tempo}
				disabled={sounding}
				onchange={(e) => setTempo(Number((e.target as HTMLSelectElement).value))}
			>
				{#each CALL_TEMPOS as t (t)}
					<option value={t}>{t} bpm</option>
				{/each}
			</select>
		</label>
		<button class="play" class:play--on={sounding} disabled={!call} onclick={toggle}>{playLabel}</button>
		<p class="deck__status" class:deck__status--done={answer !== null} role="status" aria-live="polite">{status}</p>
	</div>

	{#if view.offset !== 0 && call}
		<p class="hint card__offset">
			The staff is in your written pitch; the lick sounds in the concert key shown above.
		</p>
	{/if}

	{#if midi.supported}
		<div class="kbd">
			<button
				class="bar-btn"
				class:bar-btn--on={kbdOn}
				aria-pressed={kbdOn}
				disabled={midi.status === 'requesting' || sounding}
				onclick={toggleKeyboard}>Keyboard</button
			>
			<p class="hint kbd__line">{keyboardLine({ status: midi.status, device: midi.device, offset: view.offset })}</p>
		</div>
		{#if midi.status === 'error' && midi.error}
			<p class="kbd__error" role="alert">{midi.error}</p>
		{/if}
	{/if}

	{#if heard && call}
		<div class="tools" role="group" aria-label="After your turn">
			{#if !staffShown}
				<button class="bar-btn" onclick={() => (showNotes = true)}>Show the notes</button>
			{/if}
			<button class="bar-btn" onclick={hear}>{hearing ? 'Stop' : 'Hear the lick'}</button>
		</div>
	{/if}

	{#if staffShown && call}
		<div class="staff">
			<DrillStaff notes={call.staff.notes} meter={lick?.timeSignature} final={true} {marks} />
		</div>
	{/if}

	{#if heard && !ans.locked}
		<div class="verdict" role="group" aria-label={answer === null ? 'How did it go?' : 'Correct the keyboard'}>
			<span class="label">{answer === null ? 'How did it go?' : 'Disagree? Say how it went'}</span>
			<button class="bar-btn" onclick={() => say(true)}>Got it</button>
			<button class="bar-btn" onclick={() => say(false)}>Not yet</button>
		</div>
	{/if}

	{#if onskip && answer === null}
		<div class="next" role="group" aria-label="Skip">
			<button class="bar-btn" onclick={() => onskip()}>Skip this lick</button>
		</div>
	{/if}

	{#if answer !== null}
		<div class="next" role="group" aria-label="Next">
			<button class="bar-btn bar-btn--primary" bind:this={nextButton} onclick={() => (onnext ? onnext() : next())}
				>{nextLabel}</button
			>
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

	/* The lick's name, set like a drill or tune name: condensed, its own case. */
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

	.card__lede,
	.card__offset {
		grid-column: 1 / -1;
		margin: 0;
	}

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

	.deck__tempo {
		min-width: 6rem;
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

		&:disabled {
			opacity: 0.5;
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

	.deck__status--done {
		color: var(--ink);
		font-weight: 600;
	}

	.tools,
	.verdict,
	.next {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}

	.kbd {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}

	.kbd__line {
		flex: 1 1 14rem;
		margin: 0;
	}

	.kbd__error {
		margin: 0;
		font-size: 0.8125rem;
		color: var(--danger);
	}

	.staff {
		border-top: 1px solid var(--rule);
		padding-top: var(--space-3);
	}
</style>
