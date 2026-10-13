<script lang="ts">
	// The key as a record: the circle of fifths printed round the label, the
	// record turned so the tonic sits at 12 o'clock.
	//
	//   • every note your song uses is a dot on the vinyl, in the ink of the
	//     chord family that uses it most — your song, pressed into the record;
	//   • the label is the key's colour (minor blue, major yellow), with the
	//     tonic's name reversed out of an ink spot;
	//   • the chord sounding now swells its dots;
	//   • transposing turns the record the short way round, and the note names
	//     turn back as it goes, so they always read upright.
	//
	// Event-driven: it redraws when the song, key or sounding chord changes and
	// never animates on its own. Decorative — the key name beside it is the text.
	import { untrack } from 'svelte';
	import { Note } from 'tonal';
	import { isValidChordSymbol } from '$lib/audio/chord';
	import { classifyChord, type ChordFamily } from '$lib/model/chords';
	import { chordChroma, sectorPitchClass, tonicRotation } from '$lib/art/seedhead';

	interface Props {
		/** Concert-pitch tonic of the key ('' when there's nothing to show yet). */
		tonic: string;
		/** Every chord symbol in the song (concert). */
		chords?: string[];
		/** The chord sounding now (concert), or ''. */
		sounding?: string;
		/** Written-pitch offset in semitones, so the record matches the key you read. */
		offset?: number;
		/** Extra lit notes (concert pitch classes) when there are no chords — a drill's scale. */
		notes?: number[];
		/** Minor or major: the label's colour. */
		mode?: 'major' | 'minor' | string;
		/** Rendered size in px. */
		size?: number;
	}

	let { tonic, chords = [], sounding = '', offset = 0, notes = [], mode = 'major', size = 112 }: Props = $props();

	const VB = 100;
	const C = VB / 2;
	const R_VINYL = 49;
	const R_DOTS = 40;
	const R_LABEL = 29;
	const R_NAMES = 21;
	const GROOVES = [33, 35.5, 44.5, 47];
	// Circle-of-fifths order, conventionally spelled; sector 0 = C.
	const NAMES = ['C', 'G', 'D', 'A', 'E', 'B', 'F♯', 'D♭', 'A♭', 'E♭', 'B♭', 'F'];

	const wrap = (pc: number) => (((pc + offset) % 12) + 12) % 12;
	const valid = (s: string) => s.trim() !== '' && isValidChordSymbol(s);

	// Written pitch class → the family whose chords use it most.
	const songInk = $derived.by(() => {
		const counts = new Map<number, Map<ChordFamily, number>>();
		for (const symbol of chords) {
			if (!valid(symbol)) continue;
			const family = classifyChord(symbol);
			for (const pc of chordChroma(symbol)) {
				const w = wrap(pc);
				const byFamily = counts.get(w) ?? new Map<ChordFamily, number>();
				byFamily.set(family, (byFamily.get(family) ?? 0) + 1);
				counts.set(w, byFamily);
			}
		}
		const out = new Map<number, ChordFamily | null>();
		for (const [pc, byFamily] of counts) {
			let best: ChordFamily | null = null;
			let n = 0;
			for (const [f, c] of byFamily) if (c > n) [best, n] = [f, c];
			out.set(pc, best);
		}
		for (const pc of notes) if (!out.has(wrap(pc))) out.set(wrap(pc), null);
		return out;
	});

	const now = $derived(valid(sounding) ? new Set([...chordChroma(sounding)].map(wrap)) : new Set<number>());
	const tonicPc = $derived.by(() => {
		const pc = tonic ? Note.chroma(tonic) : undefined;
		return pc === undefined || Number.isNaN(pc) ? null : wrap(pc);
	});
	const writtenTonic = $derived(tonicPc === null ? 'C' : Note.pitchClass(Note.fromMidi(60 + tonicPc)));
	const labelInk = $derived(tonicPc === null ? 'var(--c-other)' : mode === 'minor' ? 'var(--c-minor)' : 'var(--c-major)');

	// Turn by the short way round, so C → F spins a fifth, not eleven.
	let rotation = $state(tonicRotation('C'));
	$effect(() => {
		const target = tonicRotation(writtenTonic);
		const current = untrack(() => rotation);
		const delta = ((((target - current) % 360) + 540) % 360) - 180;
		if (delta !== 0) rotation = current + delta;
	});

	const sectors = Array.from({ length: 12 }, (_, s) => {
		const a = ((s + 0.5) * 30 * Math.PI) / 180;
		return {
			s,
			name: NAMES[s],
			dot: [C + Math.sin(a) * R_DOTS, C - Math.cos(a) * R_DOTS] as const,
			text: [C + Math.sin(a) * R_NAMES, C - Math.cos(a) * R_NAMES] as const
		};
	});

	function dotOf(s: number): { ink: string; r: number } | null {
		const pc = sectorPitchClass(s);
		if (!songInk.has(pc)) return now.has(pc) ? { ink: 'var(--ink-3)', r: 3.6 } : null;
		const f = songInk.get(pc);
		return { ink: f ? `var(--c-${f})` : 'var(--c-other)', r: now.has(pc) ? 4.4 : 2.9 };
	}
</script>

<svg class="record" viewBox="0 0 {VB} {VB}" width={size} height={size} aria-hidden="true">
	<circle class="record__vinyl" cx={C} cy={C} r={R_VINYL} />
	{#each GROOVES as r (r)}
		<circle class="record__groove" cx={C} cy={C} {r} />
	{/each}
	<g class="record__turn" style:--rot="{rotation}deg">
		{#each sectors as sec (sec.s)}
			{@const d = dotOf(sec.s)}
			{#if d}
				<circle class="record__dot" cx={sec.dot[0]} cy={sec.dot[1]} r={d.r} style:fill={d.ink} />
			{/if}
		{/each}
		<circle class="record__label" cx={C} cy={C} r={R_LABEL} style:fill={labelInk} />
		{#each sectors as sec (sec.s)}
			{@const pc = sectorPitchClass(sec.s)}
			{#if pc === tonicPc}
				<circle class="record__tonic" cx={sec.text[0]} cy={sec.text[1]} r="5.6" />
			{/if}
			<text
				class="record__name"
				class:record__name--lit={songInk.has(pc) || pc === tonicPc}
				class:record__name--tonic={pc === tonicPc}
				x={sec.text[0]}
				y={sec.text[1]}>{sec.name}</text
			>
		{/each}
	</g>
	<circle class="record__hole" cx={C} cy={C} r="2.4" />
</svg>

<style lang="scss">
	.record {
		display: block;
		flex: 0 0 auto;
		overflow: visible;
	}

	/* The vinyl is always black — a record is a record on either board — with a
	   hairline so it keeps its edge on the dark one. */
	.record__vinyl {
		fill: var(--vinyl);
		stroke: var(--vinyl-rim);
		stroke-width: 1;
	}

	.record__groove {
		fill: none;
		stroke: var(--vinyl-groove);
		stroke-width: 0.5;
	}

	.record__turn {
		transform-origin: 50px 50px;
		transform: rotate(var(--rot));
		transition: transform 620ms var(--motion-ease-out);
	}

	.record__dot {
		transition:
			r var(--motion-standard) var(--motion-ease-out),
			fill var(--motion-standard) var(--motion-ease-out);
	}

	.record__label {
		transition: fill var(--motion-standard) var(--motion-ease-out);
	}

	.record__tonic {
		fill: var(--vinyl);
	}

	/* The names turn back as the record turns, so they always read upright. */
	.record__name {
		font-family: var(--font-display);
		font-stretch: 75%;
		font-weight: 800;
		font-size: 7px;
		fill: var(--on-pigment);
		opacity: 0.55;
		text-anchor: middle;
		dominant-baseline: central;
		transform-box: fill-box;
		transform-origin: center;
		transform: rotate(calc(-1 * var(--rot)));
		transition: transform 620ms var(--motion-ease-out);
	}

	.record__name--lit {
		opacity: 1;
	}

	.record__name--tonic {
		fill: var(--on-vinyl);
	}

	.record__hole {
		fill: var(--ground);
	}
</style>
