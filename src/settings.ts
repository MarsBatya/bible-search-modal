import { App, ButtonComponent, PluginSettingTab, Setting, Notice } from 'obsidian';
import type { SettingDefinitionRender } from 'obsidian';
import type BibleSearchPlugin from './main';
import { getDefaultVerseFormat, validateTemplate } from './utils/formatter';
import { renderLogo } from './ui/logo';
import {
	databaseStatusDescription,
	databaseStatusLabel,
	renderDatabaseSetupPanel,
} from './ui/database-setup';
import type { DatabaseSetupPanel } from './ui/database-setup';
import type { Translation } from './types';
import { normalizeDatabaseUrl } from './utils/database-url';

export { normalizeDatabaseUrl } from './utils/database-url';

export interface BibleSearchSettings {
	kjvDbUrl: string;
	rstDbUrl: string;
	verseFormat: string;
	showParallelByDefault: boolean;
	highlightMatches: boolean;
	groupAdjacentVerses: boolean;
}

export const DEFAULT_SETTINGS: BibleSearchSettings = {
	kjvDbUrl: '',
	rstDbUrl: '',
	verseFormat: getDefaultVerseFormat(),
	showParallelByDefault: true, // Show both translations by default
	highlightMatches: true,
	groupAdjacentVerses: true,
};

export class BibleSearchSettingTab extends PluginSettingTab {
	plugin: BibleSearchPlugin;
	private databaseSetupPanel: DatabaseSetupPanel | null = null;
	private databaseRowUpdaters = new Set<() => void>();

	constructor(app: App, plugin: BibleSearchPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	hide(): void {
		this.databaseSetupPanel?.destroy();
		this.databaseSetupPanel = null;
		this.databaseRowUpdaters.clear();
	}

	private refreshDatabaseRows(): void {
		for (const update of this.databaseRowUpdaters) update();
		this.databaseSetupPanel?.update();
	}

	/**
	 * Declarative status row used by Obsidian 1.13+'s settings renderer,
	 * including Import/Download/Retry actions that disable while busy.
	 */
	private databaseDefinition(translation: Translation): SettingDefinitionRender {
		return {
			name: `${translation} database`,
			aliases: [
				`import ${translation} database`,
				`download ${translation} database`,
				`retry ${translation} database`,
				`${translation} sqlite`,
			],
			desc: databaseStatusDescription(
				translation,
				this.plugin.getDatabaseStatus(translation),
			),
			render: (setting) => {
				const importButton = new ButtonComponent(setting.controlEl)
					.setButtonText('Import local database')
					.onClick(() => {
						void this.plugin.importDatabaseFromPicker(translation);
					});
				const downloadButton = new ButtonComponent(setting.controlEl)
					.setButtonText('Download')
					.onClick(() => {
						void this.plugin.downloadDatabase(translation).catch((error) => {
							new Notice(`Failed to download ${translation} database: ${String(error)}`);
						});
					});
				const retryButton = new ButtonComponent(setting.controlEl)
					.setButtonText('Retry')
					.onClick(() => {
						void this.plugin.retryDatabase(translation).catch((error) => {
							new Notice(`Failed to load ${translation} database: ${String(error)}`);
						});
					});

				const update = () => {
					const status = this.plugin.getDatabaseStatus(translation);
					const busy = status.state === 'loading';
					const configured = this.plugin.isDatabaseDownloadConfigured(translation);
					setting.setName(`${translation} database (${databaseStatusLabel(status)})`);
					setting.descEl.setText(databaseStatusDescription(translation, status));
					importButton.buttonEl.disabled = busy;
					downloadButton.buttonEl.disabled = busy || !configured;
					downloadButton.buttonEl.title = configured
						? `Download the ${translation} database from the configured URL`
						: `Enter a ${translation} database URL to enable downloads`;
					retryButton.buttonEl.disabled = busy;
					retryButton.buttonEl.classList.toggle('is-hidden', status.state !== 'failed');
				};

				const unsubscribe = this.plugin.onDatabaseStatusChange((changed) => {
					if (changed === translation) update();
				});
				this.databaseRowUpdaters.add(update);
				update();
				return () => {
					this.databaseRowUpdaters.delete(update);
					unsubscribe();
				};
			},
		};
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
		if (key === 'kjvDbUrl' || key === 'rstDbUrl') {
			value = normalizeDatabaseUrl(value as string);
		}
		// @ts-expect-error - value type depends on the specific key being set
		this.plugin.settings[key as keyof BibleSearchSettings] = value;
		await this.plugin.saveSettings();
		if (key === 'kjvDbUrl' || key === 'rstDbUrl') this.refreshDatabaseRows();
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
						desc: 'Optional URL for an explicit KJV download (not a default)',
						control: {
							type: 'text',
							key: 'kjvDbUrl',
							placeholder: 'https://example.com/kjv+.sqlite3'
						}
					},
					{
						name: 'Rst database URL',
						desc: 'Optional URL for an explicit RST download (not a default)',
						control: {
							type: 'text',
							key: 'rstDbUrl',
							placeholder: 'https://example.com/rst+.sqlite3'
						}
					},
					this.databaseDefinition('KJV'),
					this.databaseDefinition('RST'),
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
						name: 'Group adjacent verses',
						desc: 'Combine consecutive selected verses from the same chapter onto one line',
						control: {
							type: 'toggle',
							key: 'groupAdjacentVerses'
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

		this.databaseSetupPanel?.destroy();
		this.databaseSetupPanel = renderDatabaseSetupPanel(containerEl, this.plugin, {
			heading: 'Database status',
			intro: 'Import a local SQLite file, or enter an optional download URL below. Downloads only start when you select Download.',
		});

		new Setting(containerEl)
			.setName('Kjv database URL')
			.setDesc('Optional URL for an explicit kjv download. Downloads never start automatically.')
			.addText((text) =>
				text
					.setPlaceholder('HTTPS://example.com/kjv+.sqlite3')
					.setValue(this.plugin.settings.kjvDbUrl)
					.onChange(async (value) => {
						this.plugin.settings.kjvDbUrl = normalizeDatabaseUrl(value);
						await this.plugin.saveSettings();
						this.refreshDatabaseRows();
					}),
			);

		new Setting(containerEl)
			.setName('Rst database URL')
			.setDesc('Optional URL for an explicit rst download. Downloads never start automatically.')
			.addText((text) =>
				text
					.setPlaceholder('HTTPS://example.com/rst+.sqlite3')
					.setValue(this.plugin.settings.rstDbUrl)
					.onChange(async (value) => {
						this.plugin.settings.rstDbUrl = normalizeDatabaseUrl(value);
						await this.plugin.saveSettings();
						this.refreshDatabaseRows();
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
			.setName('Group adjacent verses')
			.setDesc('Combine consecutive selected verses from the same chapter onto one line')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.groupAdjacentVerses)
					.onChange(async (value) => {
						this.plugin.settings.groupAdjacentVerses = value;
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
