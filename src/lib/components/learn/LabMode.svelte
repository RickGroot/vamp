<script module lang="ts">
	// The idea you had open, by song id, for the session: back from Sketch, the
	// Lab opens on it again while it still applies.
	const lastIdea = new Map<string, string>();
</script>

<script lang="ts">
	// The reharm lab: one chord added to or swapped in your song, heard against
	// the original, A/B. It reads the song on the canvas LIVE (progression.current,
	// through loopBars: the bars you loop are the bars it works on), so an edit,
	// an undo or a loaded example shows here at once.
	//
	// Indices: findReharms runs on loopBars, so its bar and slot indices are
	// LOOP-relative. Every bar number shown, and "Use in my song", adds the loop's
	// start (resolveLoopRange) back: the flattenSlots(loopBars) re-basing gotcha.
	//
	// Pitch: chords are changed in CONCERT pitch and shown through
	// displayChord(…, view.offset); numerals are relative to the key, so they
	// never change with the pitch view.
	//
	// A and B are two runs with two owners in the learn store, each looping the
	// same few bars (the move's window) in your song's own sound. Switching is
	// one learn.play straight from the tap, so it is immediate, from the top of
	// the window. Colour means chord quality only: a new chord is marked in ink
	// and words, never tinted for its role.
	import { onDestroy, onMount, tick, untrack } from 'svelte';
	import { Note } from 'tonal';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { displayChord } from '$lib/audio/transpose';
	import { classifyChord } from '$lib/model/chords';
	import { EXAMPLES } from '$lib/model/examples';
	import type { Part } from '$lib/model/harmony';
	import { inferKey, type KeyInfo } from '$lib/model/key';
	import { numeralOf } from '$lib/model/numerals';
	import { flattenSlots } from '$lib/model/slots';
	import { chordFace, spokenNote } from '$lib/model/symbol';
	import { loopBars, resolveLoopRange } from '$lib/model/time';
	import type { Bar, Slot } from '$lib/model/types';
	import { KEY_ROOTS, spellKey } from '$lib/learn/keys';
	import { learnPlan } from '$lib/learn/plan';
	import { findReharms, KIND_ABOUT, KIND_NAMES, REHARM_KINDS, type Reharm } from '$lib/learn/reharm';
	import { pickedKeys } from '$lib/learn/songKey';
	import { learn } from '$lib/stores/learn.svelte';
	import { progression } from '$lib/stores/progression.svelte';
	import { view } from '$lib/stores/view.svelte';
	import { workspace } from '$lib/stores/workspace.svelte';
	import ChordSymbol from '../ChordSymbol.svelte';
	import Numeral from '../Numeral.svelte';

	type Side = 'a' | 'b';

	const song = $derived(progression.current);
	const range = $derived(resolveLoopRange(song));
	const looped = $derived(range.start > 0 || range.end < song.bars.length - 1);
	/** The bars the lab works on: the loop. Indices below are relative to it. */
	const bars = $derived(loopBars(song));
	/** Song bar number (1-based) of a loop-relative bar index. */
	const barNo = (b: number) => range.start + b + 1;

	// ---- the key (shared with Your song) --------------------------------------

	/** A root as an <option> can print it: real ♭ / ♯ (no SVG inside an option). */
	const rootLabel = (root: string) => {
		const shown = displayChord(root, view.offset);
		return chordFace(shown)?.root ?? shown;
	};
	const sameKey = (a: KeyInfo, b: KeyInfo) => a.mode === b.mode && Note.chroma(a.tonic) === Note.chroma(b.tonic);

	// Read from the whole song, as Your song does, so both modes start from one guess.
	const detected = $derived.by((): KeyInfo => {
		const k = inferKey(flattenSlots(song.bars).map((f) => f.slot.chord));
		return { tonic: spellKey(k.tonic, k.mode), mode: k.mode };
	});
	let picks = $state<Record<string, KeyInfo>>(Object.fromEntries(pickedKeys));
	const chosen = $derived(picks[song.id] ?? null);
	const key = $derived(chosen ?? detected);

	function setKey(next: Partial<KeyInfo>) {
		const mode = next.mode ?? key.mode;
		const k: KeyInfo = { tonic: spellKey(next.tonic ?? key.tonic, mode), mode };
		// Picking what the detector already says is the same as not picking.
		if (sameKey(k, detected)) useDetected();
		else {
			picks[song.id] = k;
			pickedKeys.set(song.id, k);
		}
	}

	function useDetected() {
		delete picks[song.id];
		pickedKeys.delete(song.id);
	}

	// ---- the ideas ------------------------------------------------------------

	// Read as a loop, as Vamp plays it: the last chord leads into the first.
	const ideas = $derived(findReharms(bars, key, { loop: true }));
	const groups = $derived(REHARM_KINDS.map((kind) => ({ kind, items: ideas.filter((r) => r.kind === kind) })));

	let pickedId = $state<string | null>(lastIdea.get(progression.current.id) ?? null);
	const idea = $derived(ideas.find((r) => r.id === pickedId) ?? ideas[0] ?? null);

	let card: HTMLElement | undefined = $state();

	function choose(r: Reharm) {
		const listening = sounding;
		pickedId = r.id;
		lastIdea.set(song.id, r.id);
		// Still listening: carry on with the same side of the new idea.
		if (listening) play(listening, r);
		void tick().then(() => {
			const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
			card?.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'nearest' });
		});
	}

	// ---- playback ---------------------------------------------------------------

	/** Your song's own sound: tempo, meter, instrument and groove, without the click. */
	const sound = $derived({
		tempo: song.tempo,
		timeSignature: song.timeSignature,
		instrument: song.instrument,
		groove: { ...song.groove, metronome: false }
	});

	const keyTag = $derived(`${key.tonic}-${key.mode}`);
	const ownerOf = (side: Side, r: Reharm | null = idea) => `lab:${r?.id ?? 'none'}:${keyTag}:${side}`;
	const ownerA = $derived(ownerOf('a'));
	const ownerB = $derived(ownerOf('b'));

	/** Which version is loading or sounding now. */
	const sounding = $derived<Side | null>(learn.activeFor(ownerA) ? 'a' : learn.activeFor(ownerB) ? 'b' : null);
	/** The version Play and Space play: the last one asked for. */
	let side = $state<Side>('a');
	const loading = $derived(sounding !== null && learn.phase === 'loading');
	const error = $derived(learn.owner === ownerA || learn.owner === ownerB ? learn.error : null);
	/** Index (into the window's slots) of the chord sounding now. */
	const lit = $derived(sounding && learn.cueInfo ? learn.cueInfo.chord : null);

	/** Loop A (your bars) or B (the reharm) over the move's window. Call it from the tap. */
	function play(which: Side, r: Reharm | null = idea) {
		if (!r) return;
		side = which;
		const source = which === 'a' ? bars : r.bars;
		const chords = r.window.flatMap((b) => source[b].slots.map((s) => ({ symbol: s.chord, beats: s.beats })));
		void learn.play(learnPlan([{ role: which, chords }], { ...sound, loop: true }), ownerOf(which, r));
	}

	function toggle() {
		if (sounding) learn.stop();
		else play(side);
	}

	// Space plays the version on screen.
	onMount(() => workspace.register(toggle));

	// A new song, a new sound, a new key or another idea: forget the old runs, so
	// neither Play nor Space sounds a version that is no longer on screen. Only the
	// OLD owners: an idea picked while listening has already started its own.
	const signature = $derived(
		JSON.stringify([
			song.id,
			bars.map((b) => b.slots.map((s) => [s.chord, s.beats])),
			sound,
			key,
			idea?.id ?? null
		])
	);
	let lastSignature: string | null = null;
	let lastOwners: string[] = [];
	$effect(() => {
		const sig = signature;
		const owners = [ownerA, ownerB];
		if (lastSignature !== null && sig !== lastSignature) {
			const stale = lastOwners;
			untrack(() => stale.forEach((o) => learn.forget(o)));
		}
		lastSignature = sig;
		lastOwners = owners;
	});

	onDestroy(() => {
		learn.forget(ownerA);
		learn.forget(ownerB);
	});

	// ---- the two versions, bar by bar -----------------------------------------

	interface Chip {
		id: string;
		symbol: string;
		numeral: string;
		beats: number;
		/** Index into the window's slots: what the cue points at. */
		index: number;
		isNew: boolean;
	}
	interface Cell {
		bar: number;
		chips: Chip[];
	}

	function cellsOf(r: Reharm, source: Bar[], marked: Set<Slot>): Cell[] {
		let index = 0;
		return r.window.map((b) => ({
			bar: barNo(b),
			chips: source[b].slots.map((slot) => ({
				id: slot.id,
				symbol: slot.chord.trim(),
				numeral: numeralOf(slot.chord, key),
				beats: slot.beats,
				index: index++,
				isNew: marked.has(slot)
			}))
		}));
	}

	const rowA = $derived(idea ? cellsOf(idea, bars, new Set()) : []);
	const rowB = $derived.by(() => {
		if (!idea) return [];
		const flat = flattenSlots(idea.bars);
		return cellsOf(idea, idea.bars, new Set(idea.slots.map((i) => flat[i].slot)));
	});

	// ---- words ------------------------------------------------------------------

	/** 'Bar 4', 'Bars 4–5', 'Bars 11–12 and 1–2' (song bar numbers). */
	function barsLabel(nums: number[]): string {
		const runs: [number, number][] = [];
		for (const n of nums) {
			const last = runs[runs.length - 1];
			if (last && n === last[1] + 1) last[1] = n;
			else runs.push([n, n]);
		}
		const text = runs.map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`)).join(' and ');
		return nums.length === 1 ? `Bar ${text}` : `Bars ${text}`;
	}
	const span = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, k) => barNo(from + k));
	const hostLabel = (r: Reharm) => barsLabel(span(r.startBar, r.endBar));
	const windowLabel = $derived(idea ? barsLabel(idea.window.map(barNo)) : '');

	/** A name as plain text for the notice: numerals with real ♭ / ♯. */
	const plainName = (parts: Part[]) =>
		parts
			.map((p) => (typeof p === 'string' ? p : 'numeral' in p ? p.numeral.replace(/^b/, '♭').replace(/^#/, '♯') : p.note))
			.join('');

	const status = $derived.by(() => {
		if (error) return error;
		if (loading) return 'Loading the band…';
		const where = windowLabel.toLowerCase();
		if (sounding === 'a') return `A: your chords, ${where}, round and round. Tap B to hear the change.`;
		if (sounding === 'b') return `B: the reharm, ${where}, round and round. Tap A to hear yours.`;
		return 'Tap A for your chords and B for the reharm. Switch while it plays.';
	});

	// ---- into the song ----------------------------------------------------------

	/** What "Use in my song" just did, while the song is still exactly that. */
	let used = $state<{ at: number; text: string } | null>(null);
	const usedNow = $derived(used && song.updatedAt === used.at ? used : null);

	function useInSong() {
		const r = idea;
		if (!r) return;
		const text = `${plainName(KIND_NAMES[r.kind])} at ${hostLabel(r).toLowerCase()}`;
		// The lab's indices are loop-relative: add the loop's start back.
		const ok = progression.replaceBars(
			range.start + r.startBar,
			r.bars.slice(r.startBar, r.endBar + 1),
			`In your song: ${text}`
		);
		if (ok) used = { at: progression.current.updatedAt, text };
	}

	function undoUse() {
		if (usedNow) progression.undo();
	}

	// An example with a dominant going home, a IV and a C7 → F, for the empty page.
	const starter = EXAMPLES.find((x) => x.id === 'saints');
</script>

<!-- A note name in running text (a key's tonic): drawn like a chord root, said
     as a note ("E flat"), never as a chord ("E flat major"). -->
{#snippet note(concert: string)}{@const written = displayChord(concert, view.offset)}<span class="text-chord"
		><span aria-hidden="true"><ChordSymbol symbol={written} /></span><span class="visually-hidden">{spokenNote(written)}</span
		></span
	>{/snippet}

{#snippet sentence(parts: Part[])}{#each parts as p, i (i)}{#if typeof p === 'string'}{p}{:else if 'numeral' in p}<Numeral
				numeral={p.numeral}
			/>{:else}{@render note(p.note)}{/if}{/each}{/snippet}

{#snippet version(which: Side, row: Cell[])}
	<div class="version" class:version--on={sounding === which}>
		<button class="version__play" aria-pressed={sounding === which} onclick={() => play(which)}>
			<span class="version__letter">{which === 'a' ? 'A' : 'B'}</span>{' '}<span class="label version__word"
				>{which === 'a' ? 'Yours' : 'Reharm'}</span
			>
		</button>
		<ol class="bars" style:--n={row.length} style:--n-narrow={Math.min(row.length, 2)} aria-label={which === 'a' ? 'Your chords' : 'The reharm'}>
			{#each row as cell (cell.bar)}
				<li class="bar">
					<span class="visually-hidden">Bar {cell.bar}:</span>
					{#each cell.chips as chip (chip.id)}
						{@const on = sounding === which && lit === chip.index}
						<span
							class="chip"
							class:chip--on={on}
							class:chip--new={chip.isNew}
							class:chip--rest={!chip.symbol}
							style:--q={chip.symbol ? `var(--c-${classifyChord(chip.symbol)})` : 'var(--rule)'}
							style:flex-grow={chip.beats}
							aria-current={on ? 'true' : undefined}
						>
							<span class="chip__chord"
								>{#if chip.symbol}<ChordSymbol symbol={displayChord(chip.symbol, view.offset)} />{:else}<span aria-hidden="true">–</span
									><span class="visually-hidden">rest</span>{/if}</span
							>
							<span class="chip__num" style:--chars={Math.max(3, chip.numeral.length)}
								>{#if chip.numeral}<Numeral numeral={chip.numeral} />{/if}</span
							>
							{#if which === 'b'}
								<span class="label chip__new" class:chip__new--off={!chip.isNew} aria-hidden={!chip.isNew}>New</span>
							{/if}
						</span>
					{/each}
				</li>
			{/each}
		</ol>
	</div>
{/snippet}

{#if ideas.length === 0 || !idea}
	<section class="card empty" aria-labelledby="lab-empty-title">
		<h2 id="lab-empty-title" class="display card__title">
			{progression.isBlank ? 'Nothing to reharmonise yet' : 'No ideas for these bars'}
		</h2>
		<p class="empty__text">
			{#if progression.isBlank}
				Sketch a few chords and the Lab finds places to change one: a <Numeral numeral="ii" /> in front of a
				dominant, a dominant swapped for its tritone sub, a <Numeral numeral="IV" /> turned minor. You hear yours
				against the new version, and keep the one you like.
			{:else}
				The Lab looks for a chord it can lead into or swap: two chords or more in a row, with room in a bar to split
				one. {#if looped}It works on the bars you loop, bars {range.start + 1}–{range.end + 1}.{/if} Add a chord or two
				in Sketch, or try an example.
			{/if}
		</p>
		<div class="empty__actions">
			<a class="bar-btn bar-btn--primary" href="{base}/">Go to Sketch</a>
			{#if starter}
				<button class="bar-btn empty__try" onclick={() => progression.loadExample(starter)}>
					Try <span class="empty__name">{starter.title}</span>
				</button>
			{/if}
		</div>
	</section>
{:else}
	<section class="song" aria-labelledby="lab-song-title">
		<div class="song__what">
			<h2 id="lab-song-title" class="song__name">{song.name.trim() || 'Untitled'}</h2>
			<p class="hint song__sum">
				{#if looped}Your loop, bars {range.start + 1}–{range.end + 1}{:else}{bars.length} {bars.length === 1 ? 'bar' : 'bars'}{/if}
				· {ideas.length}
				{ideas.length === 1 ? 'idea' : 'ideas'}
			</p>
		</div>
		<div class="song__key">
			<label class="field">
				<span class="label">Key</span>
				<select
					class="field__select"
					value={key.tonic}
					onchange={(ev) => setKey({ tonic: (ev.target as HTMLSelectElement).value })}
				>
					{#each KEY_ROOTS[key.mode] as root (root)}
						<option value={root}>{rootLabel(root)}</option>
					{/each}
				</select>
			</label>
			<div class="seg" role="group" aria-label="Mode">
				<button class="bar-btn" class:bar-btn--on={key.mode === 'major'} aria-pressed={key.mode === 'major'} onclick={() => setKey({ mode: 'major' })}
					>Major</button
				>
				<button class="bar-btn" class:bar-btn--on={key.mode === 'minor'} aria-pressed={key.mode === 'minor'} onclick={() => setKey({ mode: 'minor' })}
					>Minor</button
				>
			</div>
		</div>
		<p class="hint song__keynote">
			{#if chosen}
				Your choice of key, the same as in Your song. The chords suggest {@render note(detected.tonic)}&nbsp;{detected.mode}.
				<button class="link" onclick={useDetected}>Use that</button>
			{:else}
				Guessed from the chords. The key decides which chord is home, so if home sounds like another chord, pick it.
			{/if}
		</p>
	</section>

	{#if usedNow}
		<p class="used" role="status">
			<span>In your song: {usedNow.text}.</span>
			<button class="link" onclick={undoUse}>Undo</button>
		</p>
	{/if}

	<!-- The idea's card takes the key's colour locally, as the other Learn cards
	     do: Play is the page's one block of colour. -->
	<section
		class="card"
		bind:this={card}
		aria-labelledby="idea-title"
		style:--field="var(--c-{key.mode})"
		style:--on-field="var(--on-pigment)"
	>
		<div class="card__head">
			<h2 id="idea-title" class="card__name">{@render sentence(KIND_NAMES[idea.kind])}</h2>
			<span class="label card__where">{hostLabel(idea)}</span>
		</div>
		<p class="card__text">{@render sentence(idea.text)}</p>

		<div class="versions">
			{@render version('a', rowA)}
			{@render version('b', rowB)}
		</div>

		<div class="deck">
			<button class="play deck__play" class:play--on={!!sounding} onclick={toggle}>
				{sounding ? 'Stop' : side === 'a' ? 'Play A' : 'Play B'}
			</button>
			<p class="deck__status" class:deck__status--error={!!error} role="status" aria-live="polite">{status}</p>
		</div>

		<div class="actions">
			<button class="bar-btn bar-btn--primary" onclick={useInSong}>Use in my song</button>
			<button class="bar-btn" onclick={() => void goto(`${base}/`)}>Open in Sketch</button>
		</div>
		<p class="hint actions__note">
			Use in my song changes {hostLabel(idea).toLowerCase()} of your sketch. One Undo brings your chords back.
		</p>
	</section>

	<section class="block" aria-labelledby="ideas-title">
		<h2 id="ideas-title" class="display block__title">Ideas</h2>
		<p class="hint block__hint">Every move your loop allows. Pick one to hear it against yours.</p>
		<ul class="kinds">
			{#each groups as g (g.kind)}
				<li class="kind" class:kind--none={g.items.length === 0}>
					<h3 class="kind__name">{@render sentence(KIND_NAMES[g.kind])}</h3>
					<p class="kind__about">{@render sentence(KIND_ABOUT[g.kind])}</p>
					{#if g.items.length === 0}
						<p class="hint kind__none">Nowhere in these bars.</p>
					{:else}
						<div class="kind__places">
							{#each g.items as r (r.id)}
								<button
									class="bar-btn place"
									class:bar-btn--on={idea.id === r.id}
									aria-pressed={idea.id === r.id}
									onclick={() => choose(r)}
								>
									<span>{hostLabel(r)}</span>
									<span class="place__chords"
										>{#each r.after as c, i (i)}{#if c}<ChordSymbol symbol={displayChord(c, view.offset)} />{:else}<span
													aria-hidden="true">–</span
												>{/if}{/each}</span
									>
								</button>
							{/each}
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	</section>
{/if}

<style lang="scss">
	.card {
		border: var(--rule-heavy) solid var(--ink);
		padding: var(--space-4) var(--space-6) var(--space-6);
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		/* "Choose" scrolls the card into view: keep it clear of the page edge. */
		scroll-margin: var(--space-4);
	}

	.card__head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-1) var(--space-3);
	}

	.card__title {
		margin: 0;
		font-size: 2rem;
	}

	/* A move's name in the display voice, in its own case: never capitals
	   (a numeral in it would lose its case). */
	.card__name,
	.song__name {
		margin: 0;
		font-family: var(--font-display);
		font-stretch: var(--display-stretch);
		font-weight: 900;
		font-size: 2rem;
		line-height: 1;
		overflow-wrap: anywhere;
	}

	.card__text {
		margin: 0;
		max-width: 68ch;
		font-size: 1rem;
		line-height: 1.5;
	}

	/* A chord or key name inside running text: the chord face, a little lighter. */
	.text-chord {
		position: relative;
		display: inline-flex;
		--cs-weight: 700;
		font-size: 1.05em;
		vertical-align: baseline;
	}

	.link {
		border: 0;
		padding: 0;
		background: none;
		font: inherit;
		font-weight: 700;
		color: var(--ink);
		text-decoration: underline;
		text-decoration-thickness: 2px;
		text-underline-offset: 3px;
		cursor: pointer;

		@media (pointer: coarse) {
			min-height: var(--tap);
		}
	}

	/* ---- the song and its key ---- */

	.song {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: end;
		gap: var(--space-2) var(--space-6);
	}

	.song__what {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.song__sum,
	.song__keynote {
		margin: 0;
	}

	.song__keynote {
		grid-column: 1 / -1;
	}

	.song__key {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: var(--space-3);

		.field__select {
			min-width: 5.5rem;
		}
	}

	.seg {
		display: inline-flex;

		.bar-btn + .bar-btn {
			margin-left: calc(-1 * var(--rule-heavy));
		}
	}

	.used {
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1) var(--space-3);
		padding: var(--space-2) 0;
		border-top: 1px solid var(--rule);
		border-bottom: 1px solid var(--rule);
		font-size: 0.9375rem;
		font-weight: 700;
	}

	/* ---- A and B ---- */

	.versions {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		/* The bars lay out by the room the card gives them, not the window. */
		container-type: inline-size;
	}

	.version {
		display: grid;
		grid-template-columns: 4.5rem minmax(0, 1fr);
		gap: var(--space-3);
		align-items: stretch;
	}

	/* The version's switch: a printed key with the letter big. Sounding, it is
	   inked solid, the "on" of every toggle. */
	.version__play {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-1);
		min-height: var(--tap);
		padding: var(--space-2) var(--space-1);
		border: var(--rule-heavy) solid var(--ink);
		border-radius: 0;
		background: transparent;
		font-family: inherit;
		color: var(--ink);
		cursor: pointer;
		transition: transform var(--motion-fast) var(--motion-ease-out);

		&:hover {
			background: var(--wash);
		}

		&:active {
			transform: scale(0.97);
		}
	}

	.version--on .version__play,
	.version--on .version__play:hover {
		background: var(--ink);
		color: var(--ground);
	}

	.version__letter {
		font-family: var(--font-display);
		font-stretch: var(--display-stretch);
		font-weight: 900;
		font-size: 2rem;
		line-height: 1;
	}

	.version--on .version__word {
		color: var(--ground);
	}

	/* The window's bars, as a chart: ink barlines, the chords of a bar sharing it
	   by their beats. */
	.bars {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(var(--n), minmax(0, 1fr));
		border-left: var(--rule-heavy) solid var(--ink);
	}

	.bar {
		display: flex;
		gap: 3px;
		min-width: 0;
		padding: 0 var(--space-1);
		border-right: var(--rule-heavy) solid var(--ink);
	}

	.chip {
		position: relative;
		container-type: inline-size;
		flex: 1 1 0;
		min-width: 0;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-1);
		padding: var(--space-2) var(--space-2) var(--space-2);
		border-top: 6px solid var(--q);
		background: var(--wash);
		color: var(--ink);
	}

	.chip--on {
		background: var(--q);
		color: var(--on-pigment);
		box-shadow: inset 0 0 0 var(--rule-heavy) var(--ink);
	}

	.chip--rest {
		color: var(--ink-3);
	}

	/* Sized to the chip, never past it: a split bar's chords are narrow on a phone. */
	.chip__chord {
		font-size: min(1.75rem, 42cqi);
		line-height: 1;
		min-height: 1em;
	}

	.chip__num {
		font-size: min(0.9375rem, calc(190cqi / var(--chars)));
		font-weight: 800;
		min-height: 1.2em;
	}

	/* The new chord, in ink and words: never a colour for its role. */
	.chip__new {
		font-size: min(0.6875rem, 24cqi);
		color: var(--ink);
		border-top: 2px solid currentColor;
		padding-top: 2px;
	}

	.chip--on .chip__new {
		color: var(--on-pigment);
	}

	/* Every B chip keeps the line, so the row's chords stay level. */
	.chip__new--off {
		visibility: hidden;
	}

	/* ---- the transport ---- */

	.deck {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3) var(--space-4);
	}

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
		margin: 0;
		font-size: 0.9375rem;
		line-height: 1.45;
		color: var(--ink-2);
	}

	.deck__status--error {
		color: var(--danger);
		font-weight: 600;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		padding-top: var(--space-3);
		border-top: 1px solid var(--rule);
	}

	.actions__note {
		margin: calc(-1 * var(--space-2)) 0 0;
	}

	/* ---- the ideas ---- */

	.block {
		border-top: var(--rule-heavy) solid var(--ink);
		padding-top: var(--space-3);
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.block__title {
		margin: 0;
		font-size: 1.75rem;
	}

	.block__hint {
		margin: calc(-1 * var(--space-2)) 0 0;
	}

	.kinds {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
	}

	.kind {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-2);
		padding: var(--space-3) 0 var(--space-4);
		border-bottom: 1px solid var(--rule);

		&:first-child {
			padding-top: 0;
		}
	}

	/* A move's name is a NAME: heavy, in its own case. */
	.kind__name {
		margin: 0;
		font-size: 1.25rem;
		font-weight: 800;
		line-height: 1.2;
	}

	.kind__about {
		margin: 0;
		max-width: 68ch;
		font-size: 0.9375rem;
		line-height: 1.5;
	}

	.kind--none .kind__name,
	.kind--none .kind__about {
		color: var(--ink-3);
	}

	.kind__none {
		margin: 0;
	}

	.kind__places {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	/* Chord names inside a button keep their own case ("Dm7", never "DM7"). */
	.place__chords {
		display: inline-flex;
		align-items: baseline;
		gap: 0.35em;
		font-size: 1rem;
		text-transform: none;
		letter-spacing: 0;
	}

	/* ---- the empty page ---- */

	.empty__text {
		margin: 0;
		max-width: 60ch;
		font-size: 1rem;
		line-height: 1.5;
	}

	.empty__actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.empty__try {
		white-space: normal;
		text-align: left;
		line-height: 1.25;
		padding-block: var(--space-2);
	}

	/* A tune's name inside a button: its own case. */
	.empty__name {
		text-transform: none;
		letter-spacing: 0;
		font-size: 0.875rem;
	}

	/* Narrow card: the switch becomes a strip above its bars (the bars get the
	   whole width), and a long window's bars go two to a row. */
	@container (max-width: 520px) {
		.version {
			grid-template-columns: minmax(0, 1fr);
			gap: var(--space-2);
		}

		.version__play {
			flex-direction: row;
			justify-content: flex-start;
			align-items: baseline;
			gap: var(--space-2);
			padding: var(--space-1) var(--space-3);
		}

		.version__letter {
			font-size: 1.5rem;
		}

		.bars {
			grid-template-columns: repeat(var(--n-narrow), minmax(0, 1fr));
		}

		/* A second row of bars: its own top rule, a little air. */
		.bar:nth-child(n + 3) {
			margin-top: var(--space-2);
		}
	}

	@media (max-width: 640px) {
		.card {
			padding: var(--space-3) var(--space-4) var(--space-4);
		}

		.card__name,
		.song__name,
		.card__title {
			font-size: 1.75rem;
		}

		.song {
			grid-template-columns: minmax(0, 1fr);
		}

		.deck__play {
			flex: 1 1 100%;
		}

		.deck__status {
			flex-basis: 100%;
		}
	}
</style>
