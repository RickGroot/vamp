// Render one loop of a progression to a WAV file using smplr's offline renderer.
// Faithful to the groove (chords + bass + drums); the metronome click is skipped.

import { renderOffline } from 'smplr';
import type { Progression } from '$lib/model/types';
import { buildScheduledEvents } from '$lib/audio/schedule';
import { createInstrument, createDrums, drumSampleName } from '$lib/audio/instruments';
import { safeFileName } from '$lib/storage/backup';

const CHORD_VEL = 95;
const BASS_VEL = 80;

export async function exportWav(progression: Progression): Promise<void> {
	const { events, totalQuarters } = buildScheduledEvents(progression, { whole: true });
	const secPerQuarter = 60 / progression.tempo;
	const totalSeconds = totalQuarters * secPerQuarter;

	const result = await renderOffline(
		async (ctx) => {
			const instrument = createInstrument(progression.instrument, ctx);
			const drums = progression.groove.drums !== 'none' ? createDrums(ctx) : null;
			await instrument.load;
			if (drums) await drums.load;

			for (const ev of events) {
				if (ev.kind === 'click') continue;
				const time = ev.atQuarters * secPerQuarter;
				const duration = ev.durQuarters * secPerQuarter;
				if (ev.kind === 'drum') {
					drums?.start({ note: drumSampleName(ev.drum ?? 'kick'), time, velocity: ev.accent ? 110 : 80 });
					continue;
				}
				const velocity = ev.kind === 'bass' ? BASS_VEL : CHORD_VEL;
				for (const note of ev.midi) instrument.start({ note, time, duration, velocity });
			}
		},
		{ duration: totalSeconds + 1.5 } // leave a little release tail
	);

	result.downloadWav(`${safeFileName(progression.name)}.wav`);
}
