// Browser file I/O for backups: download the library as JSON, and read an
// uploaded backup file back into a string for importBackup().

import { exportBackup } from './db';

/** Trigger a browser download of a Blob. */
export function downloadBlob(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	URL.revokeObjectURL(url);
}

/** A filesystem-safe slug for export filenames. */
export function safeFileName(name: string): string {
	const trimmed = name.trim().replace(/[^\w\- ]+/g, '').replace(/\s+/g, '-');
	return trimmed || 'vamp';
}

/** localStorage, or null where merely touching it throws (some privacy modes). */
function localStorageOrNull(): Storage | null {
	try {
		return typeof localStorage === 'undefined' ? null : localStorage;
	} catch {
		return null;
	}
}

/** Serialise all saved progressions (plus drills and Learn progress) and trigger a download. */
export async function downloadBackup(): Promise<void> {
	const backup = await exportBackup(localStorageOrNull());
	const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
	const stamp = new Date(backup.exportedAt).toISOString().slice(0, 10);
	downloadBlob(blob, `vamp-backup-${stamp}.json`);
}

/** Read a user-picked file as text. */
export function readFileAsText(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result ?? ''));
		reader.onerror = () => reject(reader.error ?? new Error('Could not read file.'));
		reader.readAsText(file);
	});
}
