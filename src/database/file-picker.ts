/**
 * Open the browser/Electron file picker and return the selected SQLite file.
 *
 * Uses a transient `<input type="file">` so the same code works in Obsidian on
 * desktop and mobile, without any Node/Electron filesystem APIs.
 */
export function pickDatabaseFile(): Promise<File | null> {
	return new Promise((resolve) => {
		if (typeof document === 'undefined') {
			resolve(null);
			return;
		}

		const input = document.body.createEl('input');
		input.type = 'file';
		input.accept = '.sqlite,.sqlite3,.db,application/vnd.sqlite3,application/x-sqlite3';
		input.classList.add('bible-search-file-input');
		input.setAttribute('aria-hidden', 'true');
		document.body.appendChild(input);

		let settled = false;
		const finish = (file: File | null) => {
			if (settled) return;
			settled = true;
			input.remove();
			resolve(file);
		};

		input.addEventListener('change', () => {
			finish(input.files?.[0] ?? null);
		});
		input.addEventListener('cancel', () => finish(null));

		try {
			input.click();
		} catch {
			finish(null);
		}
	});
}
