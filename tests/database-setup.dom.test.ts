// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { DatabaseStatus } from '../src/database/status';
import type { Translation } from '../src/types';
import { renderDatabaseSetupPanel } from '../src/ui/database-setup';
import type { DatabaseSetupHost } from '../src/ui/database-setup';
import { installObsidianDomHelpers } from './dom';

function hostFor(status: () => DatabaseStatus, overrides: Partial<DatabaseSetupHost> = {}) {
	let notify: ((translation: Translation, value: DatabaseStatus) => void) | undefined;
	const host: DatabaseSetupHost = {
		getDatabaseStatus: status,
		isDatabaseDownloadConfigured: () => false,
		importDatabaseFromPicker: vi.fn().mockResolvedValue(true),
		downloadDatabase: vi.fn().mockResolvedValue(undefined),
		retryDatabase: vi.fn().mockResolvedValue(undefined),
		onDatabaseStatusChange: (listener) => {
			notify = listener;
			return () => { notify = undefined; };
		},
		...overrides,
	};
	return { host, notify: (value: DatabaseStatus) => notify?.('KJV', value) };
}

describe('database setup panel', () => {
	beforeAll(() => installObsidianDomHelpers());

	it('shows Not configured and keeps Download disabled without a URL', () => {
		const status: DatabaseStatus = { state: 'not-configured' };
		const { host } = hostFor(() => status);
		const root = document.createElement('div');
		renderDatabaseSetupPanel(root, host, { translations: ['KJV'] });

		expect(root.textContent).toContain('Not configured');
		expect(root.querySelector<HTMLButtonElement>('.bible-db-download')?.disabled).toBe(true);
		expect(root.querySelector<HTMLButtonElement>('.bible-db-import')?.disabled).toBe(false);
	});

	it('disables install actions while loading and shows Retry after failure', () => {
		let status: DatabaseStatus = { state: 'not-configured' };
		const { host, notify } = hostFor(() => status);
		const root = document.createElement('div');
		renderDatabaseSetupPanel(root, host, { translations: ['KJV'] });

		status = { state: 'loading' };
		notify(status);
		expect(root.textContent).toContain('Loading');
		expect(root.querySelector<HTMLButtonElement>('.bible-db-import')?.disabled).toBe(true);
		expect(root.querySelector<HTMLButtonElement>('.bible-db-download')?.disabled).toBe(true);

		status = { state: 'failed', error: 'invalid schema' };
		notify(status);
		expect(root.textContent).toContain('Failed');
		expect(root.textContent).toContain('invalid schema');
		expect(root.querySelector<HTMLButtonElement>('.bible-db-retry')?.classList.contains('is-hidden')).toBe(false);
	});

	it('runs the import action for its translation', () => {
		const importDatabaseFromPicker = vi.fn().mockResolvedValue(true);
		const { host } = hostFor(() => ({ state: 'ready' }), { importDatabaseFromPicker });
		const root = document.createElement('div');
		renderDatabaseSetupPanel(root, host, { translations: ['KJV'] });

		root.querySelector<HTMLButtonElement>('.bible-db-import')?.click();
		expect(importDatabaseFromPicker).toHaveBeenCalledWith('KJV');
	});
});
