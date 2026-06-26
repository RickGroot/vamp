// Drone / pedal-tone generator: a sustained tonal centre to practise scales,
// modes and intonation over, independent of the progression's transport.
//
// A warm root tone (optionally with its perfect fifth) made from a couple of
// Tone oscillators through a shared gain. The gain is ramped on start/stop and
// on changes so there are no clicks. Pitch changes glide live.

import * as Tone from 'tone';
import { unlockAudio } from './context';

const FADE = 0.08; // seconds
const MASTER = 0.22; // keep well below clipping when both partials sound

function freq(midi: number): number {
	return Tone.Frequency(midi, 'midi').toFrequency();
}

class DroneEngine {
	private osc1: Tone.Oscillator | null = null;
	private osc2: Tone.Oscillator | null = null;
	private gain: Tone.Gain | null = null;
	private _on = false;
	private rootMidi = 48;
	private fifth = true;
	private volume = 0.5; // 0..1

	get isOn(): boolean {
		return this._on;
	}

	async start(rootMidi: number, opts: { fifth?: boolean; volume?: number } = {}): Promise<void> {
		await unlockAudio();
		this.rootMidi = rootMidi;
		if (opts.fifth !== undefined) this.fifth = opts.fifth;
		if (opts.volume !== undefined) this.volume = opts.volume;
		this.build();
		this._on = true;
	}

	stop(): void {
		this._on = false;
		const gain = this.gain;
		const osc1 = this.osc1;
		const osc2 = this.osc2;
		this.gain = null;
		this.osc1 = null;
		this.osc2 = null;
		if (!gain) return;
		gain.gain.rampTo(0, FADE);
		setTimeout(() => {
			osc1?.stop();
			osc1?.dispose();
			osc2?.stop();
			osc2?.dispose();
			gain.dispose();
		}, FADE * 1000 + 80);
	}

	setRoot(midi: number): void {
		this.rootMidi = midi;
		this.osc1?.frequency.rampTo(freq(midi), 0.05);
		this.osc2?.frequency.rampTo(freq(midi + 7), 0.05);
	}

	setFifth(on: boolean): void {
		this.fifth = on;
		if (this._on) this.build(); // rebuild to add/remove the fifth partial
	}

	setVolume(v: number): void {
		this.volume = Math.max(0, Math.min(1, v));
		this.gain?.gain.rampTo(this.volume * MASTER, 0.05);
	}

	private build(): void {
		// Dispose any prior nodes (e.g. when toggling the fifth) before recreating.
		this.osc1?.stop();
		this.osc1?.dispose();
		this.osc2?.stop();
		this.osc2?.dispose();
		this.gain?.dispose();

		const gain = new Tone.Gain(0).toDestination();
		this.gain = gain;

		this.osc1 = new Tone.Oscillator(freq(this.rootMidi), 'sine').connect(gain);
		this.osc1.start();

		if (this.fifth) {
			this.osc2 = new Tone.Oscillator(freq(this.rootMidi + 7), 'triangle').connect(gain);
			this.osc2.volume.value = -9; // the fifth sits a touch under the root
			this.osc2.start();
		} else {
			this.osc2 = null;
		}

		gain.gain.rampTo(this.volume * MASTER, FADE);
	}
}

export const drone = new DroneEngine();
