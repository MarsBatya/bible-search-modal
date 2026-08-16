import { Notice, Plugin, MarkdownView, MarkdownFileInfo, Editor } from 'obsidian';
import { DEFAULT_SETTINGS, BibleSearchSettings, BibleSearchSettingTab } from './settings';
import { DatabaseEngine, getEngineInstance } from './database/engine';
import { BibleSearchModal } from './ui/modal';

export default class BibleSearchPlugin extends Plugin {
	settings!: BibleSearchSettings;
	private dbEngine!: DatabaseEngine;

	async onload() {
		console.log('Loading Bible Search plugin...');

		// Load settings
		await this.loadSettings();

		// Initialize database engine
		this.dbEngine = getEngineInstance(this.app.vault);

		// Add commands
		this.addCommand({
			id: 'bible-search-open',
			name: 'Open Bible Search',
			callback: () => {
				this.openBibleSearch();
			},
			icon: 'book-copy',
		});

		this.addCommand({
			id: 'bible-search-selection',
			name: 'Search selected text',
			editorCallback: (editor: Editor, _ctx: MarkdownView | MarkdownFileInfo) => {
				const selection = editor.getSelection();
				if (selection) {
					this.openBibleSearchWithQuery(selection);
				}
			},
			icon: 'whole-word',
		});

		// Add settings tab
		this.addSettingTab(new BibleSearchSettingTab(this.app, this));

		// Initialize databases on first load (async, don't block)
		this.initializeDatabases();

		console.log('Bible Search plugin loaded successfully');
	}

	onunload() {
		console.log('Unloading Bible Search plugin');
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<BibleSearchSettings>,
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	/**
	 * Initialize databases on plugin load
	 */
	private async initializeDatabases() {
		try {
			await this.dbEngine.initSqlJs();

			// Try to load cached databases
			const kjvLoaded = await this.dbEngine.loadDb('KJV');
			const rstLoaded = await this.dbEngine.loadDb('RST');

			if (!kjvLoaded && !rstLoaded) {
				new Notice(
					'Bible Search: Configure database URLs in settings and download databases'
				);
			}
		} catch (error) {
			console.error('Failed to initialize databases:', error);
			new Notice('Bible Search: Failed to initialize databases');
		}
	}

	/**
	 * Open Bible search modal
	 */
	private openBibleSearch() {
		new BibleSearchModal(this.app, this).open();
	}

	/**
	 * Open Bible search with initial query
	 */
	private openBibleSearchWithQuery(query: string) {
		const modal = new BibleSearchModal(this.app, this);
		modal.setInitialQuery(query);
		modal.open();
	}

	/**
	 * Download database from URL
	 */
	async downloadDatabase(translation: 'KJV' | 'RST', url: string): Promise<void> {
		await this.dbEngine.initSqlJs();
		await this.dbEngine.fetchDb(translation, url);
	}

	/**
	 * Get database engine instance
	 */
	getDbEngine(): DatabaseEngine {
		return this.dbEngine;
	}
}
