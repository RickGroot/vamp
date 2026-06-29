// Scales section state: chosen root + scale type, plus a "show scales for this
// chord" entry point used by the per-chord shortcut.

import { browser } from '$app/environment';
import { getScaleInfo, scalesForChord, type ScaleInfo } from '$lib/model/scales';

const KEY = 'vamp:scales';

export type ScaleView = 'keyboard' | 'staff' | 'fretboard';

class ScalesStore {
	open = $state(true);
	root = $state('C');
	type = $state('major');
	/** Which visualisation is shown. */
	display = $state<ScaleView>('keyboard');
	/** Chord symbol the suggestions came from (when opened via a chord), else null. */
	suggestedFor = $state<string | null>(null);
	suggestedTypes = $state<string[]>([]);
	/** Bumped to ask the section to scroll into view. */
	pulse = $state(0);

	constructor() {
		if (browser) {
			try {
				const p = JSON.parse(localStorage.getItem(KEY) || '{}');
				if (typeof p.root === 'string') this.root = p.root;
				if (typeof p.type === 'string') this.type = p.type;
				if (p.display === 'staff' || p.display === 'fretboard') this.display = p.display;
			} catch {
				/* defaults */
			}
		}
	}

	get info(): ScaleInfo {
		return getScaleInfo(this.root, this.type);
	}

	private persist(): void {
		if (browser)
			localStorage.setItem(
				KEY,
				JSON.stringify({ root: this.root, type: this.type, display: this.display })
			);
	}

	setDisplay(view: ScaleView): void {
		this.display = view;
		this.persist();
	}

	setRoot(root: string): void {
		this.root = root;
		this.suggestedFor = null;
		this.persist();
	}

	setType(type: string): void {
		this.type = type;
		this.persist();
	}

	setOpen(open: boolean): void {
		this.open = open;
	}

	/** Open the section pre-loaded with scales that fit a chord. */
	showForChord(symbol: string): void {
		const s = scalesForChord(symbol);
		if (!s) return;
		this.root = s.root;
		this.suggestedTypes = s.types;
		this.type = s.types[0] ?? this.type;
		this.suggestedFor = symbol;
		this.open = true;
		this.pulse++;
		this.persist();
	}
}

export const scales = new ScalesStore();
