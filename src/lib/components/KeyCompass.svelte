<script lang="ts">
	// The key as a sunflower: the circle of fifths grown as a seedhead, turned so
	// the tonic sits at the top, with a ring of petals printed in two inks.
	//
	//   • at rest, every note your song uses is lit in the ink of the chord
	//     family that uses it most — your song, as a flower;
	//   • the tonic's florets are ink;
	//   • the chord sounding now swells its florets in its own ink, and the
	//     petals take a breath on each change;
	//   • transposing turns the flower. A song's shape is the same in every key.
	//
	// Event-driven: it redraws when the song, key or sounding chord changes and
	// never animates on its own. Decorative — the key name beside it is the text.
	import { untrack } from 'svelte';
	import { Note } from 'tonal';
	import { isValidChordSymbol } from '$lib/audio/chord';
	import { classifyChord, type ChordFamily } from '$lib/model/chords';
	import { chordChroma, florets, sectorPitchClass, tonicRotation } from '$lib/art/seedhead';

	interface Props {
		/** Concert-pitch tonic of the key ('' when there's nothing to show yet). */
		tonic: string;
		/** Every chord symbol in the song (concert). */
		chords?: string[];
		/** The chord sounding now (concert), or ''. */
		sounding?: string;
		/** Written-pitch offset in semitones, so the flower matches the key you read. */
		offset?: number;
		/** Extra lit notes (concert pitch classes) when there are no chords — a drill's scale. */
		notes?: number[];
		/** Rendered size in px. */
		size?: number;
	}

	let { tonic, chords = [], sounding = '', offset = 0, notes = [], size = 96 }: Props = $props();

	const VB = 100;
	const C = VB / 2;
	const HEAD_R = 27;
	const HEAD = florets(150, HEAD_R);
	const PETALS = 21;

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
	const nowFamily = $derived(valid(sounding) ? classifyChord(sounding) : null);
	const tonicPc = $derived.by(() => {
		const pc = tonic ? Note.chroma(tonic) : undefined;
		return pc === undefined || Number.isNaN(pc) ? null : wrap(pc);
	});
	const writtenTonic = $derived(tonicPc === null ? 'C' : Note.pitchClass(Note.fromMidi(60 + tonicPc)));

	// Turn by the short way round, so C → F spins a fifth, not eleven.
	let rotation = $state(tonicRotation('C'));
	$effect(() => {
		const target = tonicRotation(writtenTonic);
		const current = untrack(() => rotation);
		const delta = ((((target - current) % 360) + 540) % 360) - 180;
		if (delta !== 0) rotation = current + delta;
	});

	function fill(sector: number): { color: string; grow: number } {
		const pc = sectorPitchClass(sector);
		if (now.has(pc)) return { color: nowFamily ? `var(--c-${nowFamily})` : 'var(--spot)', grow: 1.9 };
		if (pc === tonicPc) return { color: 'var(--ink)', grow: 1.35 };
		if (songInk.has(pc)) {
			const f = songInk.get(pc);
			return { color: f ? `var(--c-${f})` : 'var(--spot)', grow: 1.2 };
		}
		return { color: 'var(--rule)', grow: 1 };
	}

	const petals = Array.from({ length: PETALS }, (_, i) => (i / PETALS) * 360);
</script>

<svg class="flower" viewBox="0 0 {VB} {VB}" width={size} height={size} aria-hidden="true">
	<!-- Petals: a warm halo first, then the sun over it. -->
	{#key sounding}
		<g class="flower__petals">
			{#each petals as a (a)}
				<ellipse class="petal petal--under" cx={C} cy={C - HEAD_R - 10} rx="5.2" ry="11" transform="rotate({a} {C} {C})" />
			{/each}
			{#each petals as a (a)}
				<ellipse class="petal" cx={C} cy={C - HEAD_R - 9.5} rx="4" ry="9.5" transform="rotate({a} {C} {C})" />
			{/each}
		</g>
	{/key}
	<circle class="flower__disc" cx={C} cy={C} r={HEAD_R + 2} />
	<g class="flower__head" style:transform="rotate({rotation}deg)">
		{#each HEAD as f, i (i)}
			{@const t = fill(f.sector)}
			<circle class="floret" cx={C + f.x} cy={C + f.y} r={f.r * t.grow} style:fill={t.color} />
		{/each}
	</g>
</svg>

<style lang="scss">
	.flower {
		display: block;
		flex: 0 0 auto;
		overflow: visible;
	}

	.flower__petals {
		transform-origin: 50px 50px;
		animation: petals-breathe 360ms var(--motion-pop);
	}

	@keyframes petals-breathe {
		from {
			transform: scale(0.9) rotate(-4deg);
		}
	}

	.petal {
		fill: var(--sun);
	}

	.petal--under {
		fill: var(--spot);
		opacity: 0.35;
	}

	.flower__disc {
		fill: var(--paper);
		stroke: color-mix(in srgb, var(--sun) 70%, var(--spot));
		stroke-width: 1.5;
	}

	.flower__head {
		transform-origin: 50px 50px;
		transition: transform 560ms var(--motion-pop);
	}

	.floret {
		transition:
			fill var(--motion-standard) var(--motion-ease-out),
			r var(--motion-standard) var(--motion-pop);
	}

</style>
