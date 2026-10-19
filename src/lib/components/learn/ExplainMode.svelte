<script module lang="ts">
	import type { KeyInfo } from '$lib/model/key';

	// The key you picked for a song, by song id, for the session: "Open in
	// Sketch" and back must not lose it. Never persisted; the detector's guess is
	// the default every launch. Shared with the Lab (learn/songKey.ts).
	import { pickedKeys as picked } from '$lib/learn/songKey';
</script>

<script lang="ts">
	// Your song: what every chord in the sketch is doing in its key, with the
	// named patterns it contains. It reads the song on the canvas LIVE
	// (progression.current, like the practice store), so an edit, an undo or a
	// loaded example shows here at once.
	//
	// Pitch: chords are stored and analysed in CONCERT pitch and shown through
	// displayChord(…, view.offset); numerals are relative to the key, so they
	// never change with the pitch view.
	//
	// Indices: the analysis runs on the WHOLE song (progression.current.bars,
	// not loopBars), so every slot and bar index is the editor's own and "Open in
	// Sketch" can set the loop range with them as they are. Reading loopBars here
	// would re-base them to the loop and need its start added back.
	import { onMount, untrack } from 'svelte';
	import { Note } from 'tonal';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { displayChord } from '$lib/audio/transpose';
	import { detectProgressions, type Change, type Detection } from '$lib/model/analysis';
	import { classifyChord } from '$lib/model/chords';
	import { EXAMPLES } from '$lib/model/examples';
	import {
		explainSong,
		ROLE_NAMES,
		spokenLabel,
		type ExplainedChange,
		type Part
	} from '$lib/model/harmony';
	import { inferKey } from '$lib/model/key';
	import { PRESET_ROOTS } from '$lib/model/presets';
	import { flattenSlots } from '$lib/model/slots';
	import { chordFace, spokenNote } from '$lib/model/symbol';
	import { barBeats } from '$lib/model/time';
	import { learnPlan } from '$lib/learn/plan';
	import { learn } from '$lib/stores/learn.svelte';
	import { progression } from '$lib/stores/progression.svelte';
	import { view } from '$lib/stores/view.svelte';
	import { workspace } from '$lib/stores/workspace.svelte';
	import ChordSymbol from '../ChordSymbol.svelte';
	import KeyCompass from '../KeyCompass.svelte';
	import Numeral from '../Numeral.svelte';

	/** The whole song, played once. */
	const SONG_OWNER = 'song:play';
	/** One chord into the next (a tapped chip). */
	const HEAR_OWNER = 'song:hear';

	// Keys as they are usually written (as on the Learn map): flats for major,
	// sharps where a minor key is spelled with them.
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
	const sameKey = (a: KeyInfo, b: KeyInfo) => a.mode === b.mode && Note.chroma(a.tonic) === Note.chroma(b.tonic);

	const song = $derived(progression.current);
	const flat = $derived(flattenSlots(song.bars));
	const symbols = $derived(flat.map((f) => f.slot.chord));

	const detected = $derived.by((): KeyInfo => {
		const k = inferKey(symbols);
		return { tonic: respell(k.tonic, k.mode), mode: k.mode };
	});
	let picks = $state<Record<string, KeyInfo>>(Object.fromEntries(picked));
	const chosen = $derived(picks[song.id] ?? null);
	const key = $derived(chosen ?? detected);

	// Read as a loop, as Vamp plays it: the last chord leads back into the first.
	const explained = $derived(explainSong(song.bars, key, { loop: true }));
	const detections = $derived(detectProgressions(song.bars, key));
	const outside = $derived(explained.filter((e) => e.role !== 'diatonic'));

	/** Show only the chords from outside the key. */
	let onlyOutside = $state(false);

	// A diatonic chord's sentence is said the first time its numeral comes up;
	// after that its row is just the chord and the numeral. Chords from outside
	// the key always say theirs.
	const rows = $derived.by(() => {
		const seen = new Set<string>();
		return explained
			.map((e, i) => {
				const firstTime = !seen.has(e.fn);
				if (e.role === 'diatonic') seen.add(e.fn);
				return { e, i, sayText: e.role !== 'diatonic' || firstTime };
			})
			.filter((r) => !onlyOutside || r.e.role !== 'diatonic');
	});

	// ---- the key ------------------------------------------------------------

	function setKey(next: Partial<KeyInfo>) {
		const mode = next.mode ?? key.mode;
		const k: KeyInfo = { tonic: respell(next.tonic ?? key.tonic, mode), mode };
		// Picking what the detector already says is the same as not picking.
		if (sameKey(k, detected)) {
			delete picks[song.id];
			picked.delete(song.id);
		} else {
			picks[song.id] = k;
			picked.set(song.id, k);
		}
	}

	function useDetected() {
		delete picks[song.id];
		picked.delete(song.id);
	}

	// ---- playback -----------------------------------------------------------

	/** Your song's own sound: tempo, meter, instrument and groove, without the click. */
	const sound = $derived({
		tempo: song.tempo,
		timeSignature: song.timeSignature,
		instrument: song.instrument,
		groove: { ...song.groove, metronome: false }
	});

	const songActive = $derived(learn.activeFor(SONG_OWNER));
	const songDone = $derived(learn.owner === SONG_OWNER && learn.phase === 'done');
	const loading = $derived((songActive || learn.activeFor(HEAR_OWNER)) && learn.phase === 'loading');
	const error = $derived(learn.owner === SONG_OWNER || learn.owner === HEAR_OWNER ? learn.error : null);

	/** Which row a tapped chord belongs to. */
	let heard = $state<number | null>(null);
	const hearing = $derived(learn.activeFor(HEAR_OWNER) ? heard : null);

	const rowOfSlot = (slot: number) =>
		explained.findIndex((e) => e.change.startSlot <= slot && slot <= e.change.endSlot);
	const rowOfChange = (c: Change | null) => (c ? explained.findIndex((e) => e.change === c) : -1);

	/** The row sounding now: the song's slot, or the tapped chord and then the one it goes to. */
	const lit = $derived.by((): number | null => {
		const cue = learn.cueInfo;
		if (!cue || cue.chord === null) return null;
		if (songActive) {
			const row = rowOfSlot(cue.chord);
			return row < 0 ? null : row;
		}
		if (hearing !== null) {
			if (cue.chord === 0) return hearing;
			const row = rowOfChange(explained[hearing]?.next ?? null);
			return row < 0 ? null : row;
		}
		return null;
	});
	const litSymbol = $derived(lit !== null ? (explained[lit]?.change.symbol ?? '') : '');

	function playSong() {
		if (explained.length === 0) return;
		const chords = flat.map((f) => ({ symbol: f.slot.chord, beats: f.slot.beats }));
		void learn.play(learnPlan([{ role: 'listen', chords }], sound), SONG_OWNER);
	}

	function toggle() {
		if (songActive) learn.stop();
		else playSong();
	}

	/** Tap a chord: it, then where it goes, a bar each. */
	function hear(i: number) {
		const e = explained[i];
		if (!e) return;
		heard = i;
		const bar = barBeats(song.timeSignature);
		const chords = [{ symbol: e.change.symbol, beats: bar }];
		if (e.next) chords.push({ symbol: e.next.symbol, beats: bar });
		void learn.play(learnPlan([{ role: 'listen', chords }], sound), HEAR_OWNER);
	}

	// Space plays the song as this page reads it.
	onMount(() => workspace.register(toggle));

	// A new song, a different sound or a new key is a new page: forget the old
	// run, so neither "Play again" nor Space sounds the old version.
	const signature = $derived(
		JSON.stringify([
			song.id,
			song.bars.map((b) => b.slots.map((s) => [s.chord, s.beats])),
			song.tempo,
			song.timeSignature,
			song.instrument,
			song.groove,
			key
		])
	);
	let lastSignature: string | null = null;
	$effect(() => {
		const sig = signature;
		if (lastSignature !== null && sig !== lastSignature)
			untrack(() => {
				learn.forget(SONG_OWNER);
				learn.forget(HEAR_OWNER);
				heard = null;
			});
		lastSignature = sig;
	});

	const status = $derived.by(() => {
		if (error) return error;
		if (loading) return 'Loading the band…';
		if (songActive) return 'Your song, once through. Each chord lights up below as it sounds.';
		if (hearing !== null) {
			const e = explained[hearing];
			return e?.next ? 'A chord, then where it goes.' : 'This chord on its own: a rest follows it.';
		}
		if (songDone) return 'Tap any chord below to hear it move to the next one.';
		return 'Play it once with your band, or tap a chord below to hear where it goes.';
	});

	// ---- Sketch -------------------------------------------------------------

	/** Loop these bars in Sketch. The indices are the editor's own (see the top). */
	function openInSketch(startBar: number, endBar: number) {
		progression.setLoopRange(startBar, endBar);
		void goto(`${base}/`);
	}

	/** A chord and the one it goes to, when that comes after it (not round the seam). */
	function openRow(e: ExplainedChange) {
		const end = e.next && e.next.startBar >= e.change.startBar ? e.next.endBar : e.change.endBar;
		openInSketch(e.change.startBar, end);
	}

	const barsLabel = (start: number, end: number) => (start === end ? `Bar ${start + 1}` : `Bars ${start + 1}–${end + 1}`);
	const rowBars = (e: ExplainedChange) => barsLabel(e.change.startBar, e.change.endBar);
	const patternId = (d: Detection) => `${d.patternId}:${d.startSlot}`;
	/** A pattern formula ('i–♭VII–♭VI–V') as numerals for Numeral, which draws the accidentals. */
	const formulaParts = (formula: string) => formula.split('–').map((p) => p.replace(/^♭/, 'b').replace(/^♯/, '#'));

	// An example with a secondary dominant (C7 → F), for the empty page.
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

{#snippet label(e: ExplainedChange)}<span class="fn" aria-hidden="true"
		>{#if e.role === 'passing-dim'}<span class="fn__word">passing into</span> <Numeral numeral={e.target ?? ''} />{:else if (e.role === 'secondary-dominant' || e.role === 'tritone-sub') && e.target}<Numeral
				numeral={e.fn}
			/><span class="fn__slash">/</span><Numeral numeral={e.target} />{:else}<Numeral numeral={e.fn} />{/if}</span
	><span class="visually-hidden">{spokenLabel(e)}</span>{/snippet}

{#if explained.length === 0}
	<section class="card empty" aria-labelledby="song-empty-title">
		<h2 id="song-empty-title" class="display card__title">
			{progression.isBlank ? 'Nothing to explain yet' : "These chords didn't read"}
		</h2>
		<p class="empty__text">
			{#if progression.isBlank}
				Sketch a few chords and this page tells you what each one is doing in its key: which belong,
				which are borrowed from another key, and which pull toward the chord after them.
			{:else}
				None of the chords in your sketch could be read as a chord symbol. Try names like C, Am7 or
				B♭7 in Sketch.
			{/if}
		</p>
		<div class="empty__actions">
			<a class="bar-btn bar-btn--primary" href="{base}/">Go to Sketch</a>
			{#if progression.isBlank && starter}
				<button class="bar-btn empty__try" onclick={() => progression.loadExample(starter)}>
					Try <span class="empty__name">{starter.title}</span>
				</button>
			{/if}
		</div>
	</section>
{:else}
	<!-- The song's card. It takes the key's colour locally, as the map's card does:
	     Play is the page's one block of colour. -->
	<section
		class="card"
		aria-labelledby="song-title"
		style:--field="var(--c-{key.mode})"
		style:--on-field="var(--on-pigment)"
	>
		<div class="card__head">
			<KeyCompass tonic={key.tonic} chords={symbols} sounding={litSymbol} offset={view.offset} mode={key.mode} size={80} />
			<div class="card__what">
				<h2 id="song-title" class="card__name">{song.name.trim() || 'Untitled'}</h2>
				<p class="hint card__sum">
					{explained.length}
					{explained.length === 1 ? 'chord' : 'chords'} ·
					{#if outside.length === 0}every one in the key{:else}{outside.length} from outside the key{/if}
				</p>
			</div>
		</div>

		<div class="deck">
			<label class="field deck__key">
				<span class="label">Key</span>
				<select
					class="field__select"
					value={key.tonic}
					onchange={(ev) => setKey({ tonic: (ev.target as HTMLSelectElement).value })}
				>
					{#each ROOTS[key.mode] as root (root)}
						<option value={root}>{rootLabel(root)}</option>
					{/each}
				</select>
			</label>
			<div class="seg deck__mode" role="group" aria-label="Mode">
				<button class="bar-btn" class:bar-btn--on={key.mode === 'major'} aria-pressed={key.mode === 'major'} onclick={() => setKey({ mode: 'major' })}
					>Major</button
				>
				<button class="bar-btn" class:bar-btn--on={key.mode === 'minor'} aria-pressed={key.mode === 'minor'} onclick={() => setKey({ mode: 'minor' })}
					>Minor</button
				>
			</div>
			<button class="play deck__play" class:play--on={songActive} onclick={toggle}>
				{songActive ? 'Stop' : songDone ? 'Play again' : 'Play'}
			</button>
			<p class="deck__status" class:deck__status--error={!!error} role="status" aria-live="polite">{status}</p>
		</div>

		<p class="hint card__keynote">
			{#if chosen}
				Your choice of key. The chords suggest {@render note(detected.tonic)}&nbsp;{detected.mode}.
				<button class="link" onclick={useDetected}>Use that</button>
			{:else}
				Guessed from the chords. If home sounds like a different chord to you, pick it: rock songs often fool the
				guess.
			{/if}
		</p>
	</section>

	{#if detections.length > 0}
		<section class="block" aria-labelledby="patterns-title">
			<h2 id="patterns-title" class="display block__title">Patterns</h2>
			<ul class="patterns">
				{#each detections as d (patternId(d))}
					<li class="pattern">
						<div class="pattern__head">
							<h3 class="pattern__name">
								{d.name}{#if d.relation}&nbsp;in {@render note(d.localTonic)}{/if}{#if d.repeats > 1}&nbsp;×{d.repeats}{/if}
							</h3>
							<span class="label">{barsLabel(d.startBar, d.endBar)}</span>
						</div>
						<p class="pattern__formula">
							<span class="pattern__numerals"
								>{#each formulaParts(d.formula) as part, i (i)}{#if i > 0}<span aria-hidden="true">–</span>{/if}<Numeral
										numeral={part}
									/>{/each}</span
							>
							<span class="pattern__chords"
								>{#each d.chords as c, i (i)}{#if i > 0}<span class="pattern__arrow" aria-hidden="true">→</span>{/if}<span
										class="text-chord"><ChordSymbol symbol={displayChord(c, view.offset)} /></span
									>{/each}</span
							>
						</p>
						{#if d.relation}
							<p class="hint pattern__relation">
								In {@render note(d.localTonic)}, the <Numeral numeral={d.relation} /> of your key.
							</p>
						{/if}
						<p class="pattern__text">{d.blurb} {d.why}</p>
						<p class="pattern__text pattern__text--listen">{d.listen}</p>
						<button class="bar-btn pattern__open" onclick={() => openInSketch(d.startBar, d.endBar)}>
							Open in Sketch at {barsLabel(d.startBar, d.endBar).toLowerCase()}
						</button>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	<section class="block" aria-labelledby="chords-title">
		<div class="block__head">
			<h2 id="chords-title" class="display block__title">Chord by chord</h2>
			{#if outside.length > 0 && outside.length < explained.length}
				<div class="seg" role="group" aria-label="Show">
					<button class="bar-btn" class:bar-btn--on={!onlyOutside} aria-pressed={!onlyOutside} onclick={() => (onlyOutside = false)}
						>All</button
					>
					<button class="bar-btn" class:bar-btn--on={onlyOutside} aria-pressed={onlyOutside} onclick={() => (onlyOutside = true)}
						>Outside the key</button
					>
				</div>
			{/if}
		</div>
		<p class="hint block__hint">Tap a chord to hear it go to the next one.</p>

		<ol class="rows">
			{#each rows as row (row.e.change.startSlot)}
				{@const e = row.e}
				<li class="row" class:row--outside={e.role !== 'diatonic'}>
					<button
						class="chip"
						class:chip--on={lit === row.i}
						style:--q="var(--c-{classifyChord(e.change.symbol)})"
						aria-current={lit === row.i ? 'true' : undefined}
						onclick={() => hear(row.i)}
					>
						<span class="chip__chord"><ChordSymbol symbol={displayChord(e.change.symbol, view.offset)} /></span>
						<span class="visually-hidden">{e.next ? ', hear it go to the next chord' : ', hear it'}</span>
					</button>
					<div class="row__main">
						<p class="label row__meta">{rowBars(e)} · {ROLE_NAMES[e.role]}{#if e.backdoor}&nbsp;· backdoor{/if}</p>
						<p class="row__fn">{@render label(e)}</p>
						{#if row.sayText}
							<p class="row__text">{@render sentence(e.text)}</p>
						{/if}
					</div>
					{#if e.role !== 'diatonic'}
						<button class="bar-btn bar-btn--quiet row__open" onclick={() => openRow(e)}>Open in Sketch</button>
					{/if}
				</li>
			{/each}
		</ol>
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

	.card__head {
		display: flex;
		align-items: center;
		gap: var(--space-4);
		min-width: 0;
	}

	.card__what {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.card__title {
		margin: 0;
		font-size: 2rem;
	}

	/* The tune's name in the display voice, in its own case: never capitals
	   (a title like "ii–V–I in C" would read "II–V–I IN C"). */
	.card__name {
		margin: 0;
		font-family: var(--font-display);
		font-stretch: var(--display-stretch);
		font-weight: 900;
		font-size: 2rem;
		line-height: 1;
		overflow-wrap: anywhere;
	}

	.card__sum,
	.card__keynote {
		margin: 0;
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

	/* The card's transport, as on the map: what to play, Play, then the status. */
	.deck {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: var(--space-3) var(--space-4);
	}

	.deck__key .field__select {
		min-width: 5.5rem;
	}

	.seg {
		display: inline-flex;

		.bar-btn + .bar-btn {
			margin-left: calc(-1 * var(--rule-heavy));
		}
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
		align-self: center;
		margin: 0;
		font-size: 0.9375rem;
		line-height: 1.45;
		color: var(--ink-2);
	}

	.deck__status--error {
		color: var(--danger);
		font-weight: 600;
	}

	/* Sections under the card: a heavy rule, a display title. */
	.block {
		border-top: var(--rule-heavy) solid var(--ink);
		padding-top: var(--space-3);
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.block__head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2) var(--space-4);
	}

	.block__title {
		margin: 0;
		font-size: 1.75rem;
	}

	.block__hint {
		margin: calc(-1 * var(--space-2)) 0 0;
	}

	/* Patterns: printed entries, one under another. */
	.patterns {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
	}

	.pattern {
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

	.pattern__head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-1) var(--space-3);
	}

	/* A pattern's name is a NAME ("ii–V–I"): heavy, in its own case. */
	.pattern__name {
		margin: 0;
		font-size: 1.25rem;
		font-weight: 800;
		line-height: 1.2;
	}

	.pattern__formula {
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0 var(--space-3);
		font-size: 1rem;
		font-weight: 800;
	}

	.pattern__numerals {
		display: inline-flex;
		flex-wrap: wrap;
		align-items: baseline;
	}

	.pattern__chords {
		display: inline-flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0 var(--space-1);
		font-weight: 400;
		color: var(--ink-2);
	}

	.pattern__arrow {
		color: var(--ink-3);
	}

	.pattern__relation {
		margin: 0;
	}

	.pattern__text {
		margin: 0;
		max-width: 68ch;
		font-size: 0.9375rem;
		line-height: 1.5;
		color: var(--ink);
	}

	.pattern__text--listen {
		color: var(--ink-2);
	}

	/* Chord by chord. The list is its own container, so a row lays out by the
	   room it has, not the window. */
	.rows {
		list-style: none;
		margin: 0;
		padding: 0;
		container-type: inline-size;
	}

	.row {
		display: grid;
		grid-template-columns: 6rem minmax(0, 1fr) auto;
		align-items: start;
		gap: var(--space-2) var(--space-4);
		padding: var(--space-3) 0;
		border-bottom: 1px solid var(--rule);
	}

	/* A chord in the key reads quieter than one from outside it: the difference
	   is ink and words, never a colour (chord inks mean quality only). */
	.row:not(.row--outside) .row__fn {
		font-weight: 700;
	}

	.chip {
		position: relative;
		container-type: inline-size;
		display: flex;
		align-items: center;
		width: 100%;
		min-height: var(--tap);
		padding: var(--space-2);
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

	/* Sized to the chip, never past it (container units of the chip). */
	.chip__chord {
		font-size: min(1.75rem, 40cqi);
		line-height: 1;
	}

	.row__main {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.row__meta {
		margin: 0;
		color: var(--ink-3);
	}

	.row--outside .row__meta {
		color: var(--ink);
	}

	.row__fn {
		margin: 0;
		font-size: 1.25rem;
		font-weight: 800;
		line-height: 1.2;
	}

	.fn {
		display: inline-flex;
		align-items: baseline;
		flex-wrap: wrap;
	}

	.fn__slash {
		margin: 0 0.06em;
	}

	/* A flex row drops the space between items, so the gap is set here. */
	.fn__word {
		margin-right: 0.3em;
		font-size: 0.8em;
		font-weight: 700;
	}

	.row__text {
		margin: 0;
		max-width: 68ch;
		font-size: 0.9375rem;
		line-height: 1.5;
		color: var(--ink-2);
	}

	.row--outside .row__text {
		color: var(--ink);
	}

	.row__open {
		align-self: center;
	}

	/* Narrow: the chord on the left, everything else stacked beside it. */
	@container (max-width: 560px) {
		.row {
			grid-template-columns: 4.5rem minmax(0, 1fr);
			column-gap: var(--space-3);
		}

		.row__open {
			grid-column: 2;
			justify-self: start;
			align-self: start;
			/* Line the quiet button's text up with the words above it. */
			margin-left: calc(-1 * var(--space-3));
		}
	}

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

	/* The tune's name is long: let the button wrap rather than run off a phone. */
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

	@media (max-width: 640px) {
		.card {
			padding: var(--space-3) var(--space-4) var(--space-4);
		}

		.card__name,
		.card__title {
			font-size: 1.75rem;
		}

		.deck__play {
			flex: 1 1 100%;
		}

		.deck__status {
			flex-basis: 100%;
		}
	}

	@media (max-width: 400px) {
		.deck {
			column-gap: var(--space-3);
		}
	}
</style>
