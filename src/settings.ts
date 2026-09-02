import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import type BibleSearchPlugin from './main';
import { getDefaultVerseFormat, validateTemplate } from './utils/formatter';
import { renderLogo } from './ui/logo';

export interface BibleSearchSettings {
	kjvDbUrl: string;
	rstDbUrl: string;
	verseFormat: string;
	showParallelByDefault: boolean;
	highlightMatches: boolean;
}

export const DEFAULT_SETTINGS: BibleSearchSettings = {
	kjvDbUrl: 'HTTPS://example.com/kjv+.sqlite3',
	rstDbUrl: 'HTTPS://example.com/rst+.sqlite3',
	verseFormat: getDefaultVerseFormat(),
	showParallelByDefault: true, // Show both translations by default
	highlightMatches: true,
};

export class BibleSearchSettingTab extends PluginSettingTab {
	plugin: BibleSearchPlugin;

	constructor(app: App, plugin: BibleSearchPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	/**
	 * Required by Obsidian 1.13.0+ to support settings search.
	 * This is not dead code - do not remove.
	 */
	getControlValue(key: string): unknown {
		return this.plugin.settings[key as keyof BibleSearchSettings];
	}

	/**
	 * Required by Obsidian 1.13.0+ to support settings search.
	 * This is not dead code - do not remove.
	 */
	async setControlValue(key: string, value: unknown): Promise<void> {
		if (key === 'verseFormat') {
			const validation = validateTemplate(value as string);
			if (!validation.valid) {
				new Notice(`Invalid template: ${validation.error}`);
				return;
			}
		}
		// @ts-expect-error - value type depends on the specific key being set
		this.plugin.settings[key as keyof BibleSearchSettings] = value;
		await this.plugin.saveSettings();
	}

	/**
	 * Required by Obsidian 1.13.0+ to support settings search.
	 * This is not dead code - do not remove.
	 */
	getSettingDefinitions() {
		return [
			{
				type: 'group',
				name: 'Database configuration',
				items: [
					{
						name: 'Kjv database URL',
						desc: 'URL to kjv+.sqlite3 database file',
						control: {
							type: 'text',
							key: 'kjvDbUrl',
							placeholder: 'HTTPS://example.com/kjv+.sqlite3'
						}
					},
					{
						name: 'Rst database URL',
						desc: 'URL to rst+.sqlite3 database file (russian)',
						control: {
							type: 'text',
							key: 'rstDbUrl',
							placeholder: 'HTTPS://example.com/rst+.sqlite3'
						}
					},
					{
						name: 'Download kjv database',
						desc: 'Download and cache kjv database locally',
						action: async () => {
							try {
								await this.plugin.downloadDatabase('KJV', this.plugin.settings.kjvDbUrl);
							} catch (error) {
								new Notice(`Failed to download KJV database: ${String(error)}`);
							}
						}
					},
					{
						name: 'Download rst database',
						desc: 'Download and cache rst database locally',
						action: async () => {
							try {
								await this.plugin.downloadDatabase('RST', this.plugin.settings.rstDbUrl);
							} catch (error) {
								new Notice(`Failed to download RST database: ${String(error)}`);
							}
						}
					}
				]
			},
			{
				type: 'group',
				name: 'Search & display',
				items: [
					{
						name: 'Verse format template',
						desc: 'Template for pasted verses. Available: {short_name}, {long_name}, {chapter}, {verse}, {translation}, {text}, {raw_text}',
						control: {
							type: 'text',
							key: 'verseFormat',
							placeholder: '{short_name} {chapter}:{verse} ({translation}) — {text}'
						}
					},
					{
						name: 'Show parallel translation',
						desc: 'Show parallel verse from other translation alongside results',
						control: {
							type: 'toggle',
							key: 'showParallelByDefault'
						}
					},
					{
						name: 'Highlight matches',
						desc: 'Highlight matching keywords in search results',
						control: {
							type: 'toggle',
							key: 'highlightMatches'
						}
					}
				]
			}
		];
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();
		// Scope element so our CSS below can't leak into Obsidian's core
		// settings or other plugins' settings tabs (see styles.css)
		containerEl.addClass('bible-search-settings');

		const header = containerEl.createDiv({ cls: 'bible-search-settings-header' });
		renderLogo(header, 40);
		header.createSpan({ text: 'Bible Search', cls: 'bible-search-settings-title' });

		// Database Configuration Section
		new Setting(containerEl).setName('Database configuration').setHeading();

		new Setting(containerEl)
			.setName('Kjv database URL')
			.setDesc('URL to kjv+.sqlite3 database file')
			.addText((text) =>
				text
					.setPlaceholder('HTTPS://example.com/kjv+.sqlite3')
					.setValue(this.plugin.settings.kjvDbUrl)
					.onChange(async (value) => {
						this.plugin.settings.kjvDbUrl = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Rst database URL')
			.setDesc('URL to rst+.sqlite3 database file (russian)')
			.addText((text) =>
				text
					.setPlaceholder('HTTPS://example.com/rst+.sqlite3')
					.setValue(this.plugin.settings.rstDbUrl)
					.onChange(async (value) => {
						this.plugin.settings.rstDbUrl = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Download kjv database')
			.setDesc('Download and cache kjv database locally')
			.addButton((button) =>
				button.setButtonText('Download').onClick(async () => {
					try {
						await this.plugin.downloadDatabase('KJV', this.plugin.settings.kjvDbUrl);
					} catch (error) {
						new Notice(`Failed to download KJV database: ${String(error)}`);
					}
				}),
			);

		new Setting(containerEl)
			.setName('Download rst database')
			.setDesc('Download and cache rst database locally')
			.addButton((button) =>
				button.setButtonText('Download').onClick(async () => {
					try {
						await this.plugin.downloadDatabase('RST', this.plugin.settings.rstDbUrl);
					} catch (error) {
						new Notice(`Failed to download RST database: ${String(error)}`);
					}
				}),
			);

		// Search & Display Section
		new Setting(containerEl).setName('Search & display').setHeading();

		new Setting(containerEl)
			.setName('Verse format template')
			.setDesc(
				'Template for pasted verses. Available: {short_name}, {long_name}, {chapter}, {verse}, {translation}, {text}, {raw_text}'
			)
			.addText((text) =>
				text
					.setPlaceholder('{short_name} {chapter}:{verse} ({translation}) — {text}')
					.setValue(this.plugin.settings.verseFormat)
					.onChange(async (value) => {
						// Validate template
						const validation = validateTemplate(value);
						if (!validation.valid) {
							new Notice(`Invalid template: ${validation.error}`);
							return;
						}
						this.plugin.settings.verseFormat = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Show parallel translation')
			.setDesc('Show parallel verse from other translation alongside results')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showParallelByDefault)
					.onChange(async (value) => {
						this.plugin.settings.showParallelByDefault = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Highlight matches')
			.setDesc('Highlight matching keywords in search results')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.highlightMatches)
					.onChange(async (value) => {
						this.plugin.settings.highlightMatches = value;
						await this.plugin.saveSettings();
					}),
			);

	}
}
