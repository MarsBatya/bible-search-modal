import { describe, expect, it, vi } from 'vitest';

vi.mock('obsidian', () => ({
	PluginSettingTab: class {
		containerEl = {};
		constructor(public app: unknown, public plugin: unknown) {}
	},
	Setting: class {},
	ButtonComponent: class {},
	Notice: class {},
}));

import { DEFAULT_SETTINGS, BibleSearchSettingTab } from '../src/settings';
import { normalizeDatabaseUrl } from '../src/utils/database-url';

describe('database URL settings', () => {
	it('does not use example URLs as real defaults', () => {
		expect(DEFAULT_SETTINGS.kjvDbUrl).toBe('');
		expect(DEFAULT_SETTINGS.rstDbUrl).toBe('');
	});

	it('treats legacy example placeholders as unconfigured', () => {
		expect(normalizeDatabaseUrl('HTTPS://example.com/kjv+.sqlite3')).toBe('');
		expect(normalizeDatabaseUrl('https://example.com/rst+.sqlite3')).toBe('');
	});

	it('preserves a real saved URL', () => {
		expect(normalizeDatabaseUrl(' https://bibles.example.org/KJV+.sqlite3 ')).toBe(
			'https://bibles.example.org/KJV+.sqlite3',
		);
	});

	it('normalizes URL updates made through settings search', async () => {
		const saveSettings = vi.fn().mockResolvedValue(undefined);
		const plugin = {
			settings: { ...DEFAULT_SETTINGS },
			saveSettings,
		};
		const tab = new BibleSearchSettingTab({} as never, plugin as never);

		await tab.setControlValue('kjvDbUrl', 'HTTPS://example.com/kjv+.sqlite3');
		expect(plugin.settings.kjvDbUrl).toBe('');
		expect(saveSettings).toHaveBeenCalledOnce();
	});
});
