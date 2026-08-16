import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import BibleSearchPlugin from './main';
import { getDefaultVerseFormat, validateTemplate } from './utils/formatter';

export interface BibleSearchSettings {
	kjvDbUrl: string;
	rstDbUrl: string;
	verseFormat: string;
	showParallelByDefault: boolean;
	highlightMatches: boolean;
	resultsPerPage: number;
	stripMarkup: boolean;
}

export const DEFAULT_SETTINGS: BibleSearchSettings = {
	kjvDbUrl: 'https://example.com/KJV+.sqlite3',
	rstDbUrl: 'https://example.com/RST+.sqlite3',
	verseFormat: getDefaultVerseFormat(),
	showParallelByDefault: true, // Show both translations by default
	highlightMatches: true,
	resultsPerPage: 5,
	stripMarkup: true,
};

export class BibleSearchSettingTab extends PluginSettingTab {
	plugin: BibleSearchPlugin;

	constructor(app: App, plugin: BibleSearchPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();
		// Scope element so our CSS below can't leak into Obsidian's core
		// settings or other plugins' settings tabs (see styles.css)
		containerEl.addClass('bible-search-settings');

		// Database Configuration Section
		new Setting(containerEl).setName('Database Configuration').setHeading();

		new Setting(containerEl)
			.setName('KJV Database URL')
			.setDesc('URL to KJV+.sqlite3 database file')
			.addText((text) =>
				text
					.setPlaceholder('https://example.com/KJV+.sqlite3')
					.setValue(this.plugin.settings.kjvDbUrl)
					.onChange(async (value) => {
						this.plugin.settings.kjvDbUrl = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('RST Database URL')
			.setDesc('URL to RST+.sqlite3 database file (Russian)')
			.addText((text) =>
				text
					.setPlaceholder('https://example.com/RST+.sqlite3')
					.setValue(this.plugin.settings.rstDbUrl)
					.onChange(async (value) => {
						this.plugin.settings.rstDbUrl = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Download KJV Database')
			.setDesc('Download and cache KJV database locally')
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
			.setName('Download RST Database')
			.setDesc('Download and cache RST database locally')
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
		new Setting(containerEl).setName('Search & Display').setHeading();

		new Setting(containerEl)
			.setName('Verse Format Template')
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
			.setName('Show Parallel Translation')
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
			.setName('Highlight Matches')
			.setDesc('Highlight matching keywords in search results')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.highlightMatches)
					.onChange(async (value) => {
						this.plugin.settings.highlightMatches = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Strip Markup')
			.setDesc('Remove Strong\'s numbers and formatting tags from verses')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.stripMarkup)
					.onChange(async (value) => {
						this.plugin.settings.stripMarkup = value;
						await this.plugin.saveSettings();
					}),
			);

		// UI Preferences Section
		new Setting(containerEl).setName('UI Preferences').setHeading();

		new Setting(containerEl)
			.setName('Results Per Page')
			.setDesc('Number of results to display per page')
			.addSlider((slider) =>
				slider
					.setLimits(1, 20, 1)
					.setValue(this.plugin.settings.resultsPerPage)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.resultsPerPage = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}
