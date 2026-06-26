// View-only preferences (not part of a saved progression): the transposing-
// instrument display offset, count-in, Roman-numeral overlay, and the practice
// rhythm-section mix + "trade fours" — all per-device prefs, persisted locally
// and (for the mix) pushed live to the playback engine.

import { browser } from '$app/environment';
import { engine } from '$lib/audio/engine';
import {
	computeMixLevels,
	defaultMix,
	MIX_LANES,
	type MixLane,
	type MixLevels,
	type MixState
} from '$lib/audio/mix';

export interface TransposeOption {
	id: string;
	label: string;
	/** Written pitch = concert + offset semitones. */
	offset: number;
}

export const TRANSPOSE_OPTIONS: TransposeOption[] = [
	{ id: 'concert', label: 'Concert', offset: 0 },
	{ id: 'bb', label: 'B♭ Trumpet', offset: 2 },
	{ id: 'eb', label: 'E♭ Alto sax', offset: 9 },
	{ id: 'f', label: 'F Horn', offset: 7 }
];

const STORAGE_KEY = 'vamp:transpose';
const COUNT_IN_KEY = 'vamp:countIn';
const ROMAN_KEY = 'vamp:roman';
const MIX_KEY = 'vamp:mix';
const TRADE_KEY = 'vamp:trade';

/** "Trade fours" block lengths offered in the UI (0 = off). */
export const TRADE_OPTIONS = [0, 2, 4, 8];

class ViewStore {
	transposeId = $state('concert');
	/** Play a one-bar metronome count-in before the loop. */
	countIn = $state(false);
	/** Show Roman-numeral analysis under each chord. */
	showRoman = $state(false);
	/** Per-lane rhythm-section mix (mute / solo / volume). */
	mix = $state<MixState>(defaultMix());
	/** "Trade fours" block length in bars (0 = off). */
	tradeBars = $state(0);

	constructor() {
		if (browser) {
			const saved = localStorage.getItem(STORAGE_KEY);
			if (saved && TRANSPOSE_OPTIONS.some((o) => o.id === saved)) this.transposeId = saved;
			this.countIn = localStorage.getItem(COUNT_IN_KEY) === '1';
			this.showRoman = localStorage.getItem(ROMAN_KEY) === '1';
			this.mix = readMix();
			this.tradeBars = readTrade();
			// Push the restored mix to the engine so the first play already respects it.
			engine.setMix(this.mixLevels);
			engine.setTradeBars(this.tradeBars);
		}
	}

	get offset(): number {
		return TRANSPOSE_OPTIONS.find((o) => o.id === this.transposeId)?.offset ?? 0;
	}

	/** Effective per-lane gains (0..1) after solo/mute resolution. */
	get mixLevels(): MixLevels {
		return computeMixLevels(this.mix);
	}

	private syncMix(): void {
		engine.setMix(this.mixLevels);
		if (browser) localStorage.setItem(MIX_KEY, JSON.stringify(this.mix));
	}

	setLaneVolume(lane: MixLane, volume: number): void {
		this.mix[lane].volume = Math.max(0, Math.min(1, volume));
		this.syncMix();
	}

	toggleLaneMute(lane: MixLane): void {
		this.mix[lane].mute = !this.mix[lane].mute;
		this.syncMix();
	}

	toggleLaneSolo(lane: MixLane): void {
		this.mix[lane].solo = !this.mix[lane].solo;
		this.syncMix();
	}

	resetMix(): void {
		this.mix = defaultMix();
		this.syncMix();
	}

	setTradeBars(bars: number): void {
		this.tradeBars = Math.max(0, Math.floor(bars));
		engine.setTradeBars(this.tradeBars);
		if (browser) localStorage.setItem(TRADE_KEY, String(this.tradeBars));
	}

	setTranspose(id: string): void {
		this.transposeId = id;
		if (browser) localStorage.setItem(STORAGE_KEY, id);
	}

	setCountIn(on: boolean): void {
		this.countIn = on;
		if (browser) localStorage.setItem(COUNT_IN_KEY, on ? '1' : '0');
	}

	setShowRoman(on: boolean): void {
		this.showRoman = on;
		if (browser) localStorage.setItem(ROMAN_KEY, on ? '1' : '0');
	}
}

/** Read a persisted mix, defensively (storage may be absent, stale, or corrupt). */
function readMix(): MixState {
	const mix = defaultMix();
	try {
		const raw = localStorage.getItem(MIX_KEY);
		if (!raw) return mix;
		const parsed = JSON.parse(raw) as Partial<Record<MixLane, Partial<MixState['chords']>>>;
		for (const lane of MIX_LANES) {
			const saved = parsed?.[lane];
			if (!saved) continue;
			if (typeof saved.volume === 'number') mix[lane].volume = Math.max(0, Math.min(1, saved.volume));
			mix[lane].mute = saved.mute === true;
			mix[lane].solo = saved.solo === true;
		}
	} catch {
		/* fall back to defaults */
	}
	return mix;
}

function readTrade(): number {
	const n = Number(localStorage.getItem(TRADE_KEY));
	return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export const view = new ViewStore();
