// Shared dropdown/popover dismissal. The menus used to rely on focusout alone,
// which breaks in real browsers: deleting a focused row unmounts it without
// firing focusout (the menu then never closes on outside clicks), macOS
// Safari/Firefox don't move focus into clicked buttons at all, and Escape did
// nothing. While `open`, this action closes on a pointerdown outside the host
// and on Escape (refocusing the toggle); focusout stays as the Tab-away path.

export interface DismissableParams {
	open: boolean;
	close: () => void;
}

export function dismissable(node: HTMLElement, params: DismissableParams) {
	let current = params;
	let attached = false;

	const onPointerDown = (event: PointerEvent) => {
		const target = event.target as Node | null;
		if (target && !node.contains(target)) current.close();
	};

	const onKeydown = (event: KeyboardEvent) => {
		if (event.key !== 'Escape') return;
		current.close();
		// Return focus to the toggle so keyboard users aren't dropped to <body>.
		node.querySelector<HTMLElement>('button, [href], input, select, [tabindex]')?.focus();
	};

	const sync = () => {
		if (current.open && !attached) {
			// Capture phase so a click that stops propagation still dismisses.
			document.addEventListener('pointerdown', onPointerDown, true);
			document.addEventListener('keydown', onKeydown, true);
			attached = true;
		} else if (!current.open && attached) {
			document.removeEventListener('pointerdown', onPointerDown, true);
			document.removeEventListener('keydown', onKeydown, true);
			attached = false;
		}
	};

	sync();
	return {
		update(next: DismissableParams) {
			current = next;
			sync();
		},
		destroy() {
			current = { open: false, close: () => {} };
			sync();
		}
	};
}
