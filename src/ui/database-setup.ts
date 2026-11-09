import { Notice } from 'obsidian';
import type { DatabaseStatus } from '../database/status';
import type { Translation } from '../types';

export interface DatabaseSetupHost {
	getDatabaseStatus(translation: Translation): DatabaseStatus;
	isDatabaseDownloadConfigured(translation: Translation): boolean;
	importDatabaseFromPicker(translation: Translation): Promise<boolean>;
	downloadDatabase(translation: Translation): Promise<void>;
	retryDatabase(translation: Translation): Promise<void>;
	onDatabaseStatusChange(listener: (translation: Translation, status: DatabaseStatus) => void): () => void;
}

export interface DatabaseSetupPanelOptions {
	translations?: Translation[];
	heading?: string;
	intro?: string;
}

export interface DatabaseSetupPanel {
	/** Re-render every row from the host's current status. */
	update(): void;
	/** Stop listening for status changes. */
	destroy(): void;
}

export function databaseStatusLabel(status: DatabaseStatus): string {
	switch (status.state) {
		case 'ready':
			return 'Ready';
		case 'loading':
			return 'Loading';
		case 'failed':
			return 'Failed';
		default:
			return 'Not configured';
	}
}

export function databaseStatusDescription(
	translation: Translation,
	status: DatabaseStatus,
): string {
	switch (status.state) {
		case 'ready':
			return `${translation} database is ready.`;
		case 'loading':
			return `Loading ${translation} database…`;
		case 'failed':
			return status.error
				? `${translation} database failed: ${status.error}`
				: `${translation} database failed. Import a valid .sqlite3 file or retry.`;
		default:
			return `No ${translation} database configured. Import a local .sqlite3 file or enter a download URL.`;
	}
}

function runAction(action: () => Promise<unknown>): void {
	void action().catch((error) => {
		new Notice(String(error instanceof Error ? error.message : error));
	});
}

/**
 * Render import/download/retry controls for one or both translations and keep
 * their status labels live. Used by the settings tab and by the search modal
 * when no database is available.
 */
export function renderDatabaseSetupPanel(
	container: HTMLElement,
	host: DatabaseSetupHost,
	options: DatabaseSetupPanelOptions = {},
): DatabaseSetupPanel {
	const translations = options.translations ?? ['KJV', 'RST'];
	const panel = container.createDiv({ cls: 'bible-db-setup' });

	if (options.heading) {
		panel.createDiv({ cls: 'bible-db-setup-heading', text: options.heading });
	}
	if (options.intro) {
		panel.createDiv({ cls: 'bible-db-setup-intro', text: options.intro });
	}

	const rows = new Map<Translation, {
		status: HTMLElement;
		detail: HTMLElement;
		importButton: HTMLButtonElement;
		downloadButton: HTMLButtonElement;
		retryButton: HTMLButtonElement;
	}>();

	for (const translation of translations) {
		const row = panel.createDiv({
			cls: 'bible-db-setup-row',
			attr: { 'data-translation': translation },
		});
		const info = row.createDiv({ cls: 'bible-db-setup-info' });
		const nameEl = info.createDiv({ cls: 'bible-db-setup-name' });
		nameEl.createSpan({ text: `${translation} database` });
		const status = nameEl.createSpan({ cls: 'bible-db-status' });
		const detail = info.createDiv({ cls: 'bible-db-setup-detail' });

		const actions = row.createDiv({ cls: 'bible-db-setup-actions' });
		const importButton = actions.createEl('button', {
			cls: 'bible-db-import',
			text: 'Import local database',
		});
		importButton.addEventListener('click', () => {
			runAction(() => host.importDatabaseFromPicker(translation));
		});

		const downloadButton = actions.createEl('button', {
			cls: 'bible-db-download',
			text: 'Download',
		});
		downloadButton.addEventListener('click', () => {
			runAction(() => host.downloadDatabase(translation));
		});

		const retryButton = actions.createEl('button', {
			cls: 'bible-db-retry',
			text: 'Retry',
		});
		retryButton.addEventListener('click', () => {
			runAction(() => host.retryDatabase(translation));
		});

		rows.set(translation, { status, detail, importButton, downloadButton, retryButton });
	}

	const update = (): void => {
		for (const translation of translations) {
			const elements = rows.get(translation);
			if (!elements) continue;
			const status = host.getDatabaseStatus(translation);
			const busy = status.state === 'loading';
			const configured = host.isDatabaseDownloadConfigured(translation);

			elements.status.setText(databaseStatusLabel(status));
			elements.status.className = `bible-db-status is-${status.state}`;
			elements.detail.setText(databaseStatusDescription(translation, status));

			elements.importButton.disabled = busy;
			elements.downloadButton.disabled = busy || !configured;
			elements.downloadButton.title = configured
				? `Download the ${translation} database from the configured URL`
				: `Enter a ${translation} database URL in settings to enable downloads`;
			elements.retryButton.disabled = busy;
			elements.retryButton.classList.toggle('is-hidden', status.state !== 'failed');
		}
	};

	const unsubscribe = host.onDatabaseStatusChange(() => update());
	update();

	return {
		update,
		destroy: () => {
			unsubscribe();
			panel.remove();
		},
	};
}
