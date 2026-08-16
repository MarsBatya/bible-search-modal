import { Notice, Plugin, MarkdownView, MarkdownFileInfo, Editor } from 'obsidian';
import { DEFAULT_SETTINGS, BibleSearchSettings, BibleSearchSettingTab } from './settings';
import { DatabaseEngine, getEngineInstance } from './database/engine';
import { getRandomVerse } from './database/queries';
import { formatVerse } from './utils/formatter';
import { verseKey } from './utils/verse-key';
import { RecentVerseTracker } from './utils/recent-verses';
import { DatabaseInstance } from './types';
import { BibleSearchModal } from './ui/modal';

export default class BibleSearchPlugin extends Plugin {
	settings!: BibleSearchSettings;
	private dbEngine!: DatabaseEngine;

	// Remembers the last search query for the session, so reopening the
	// search modal can pre-fill it (e.g. to insert another verse from the
	// same search, or the parallel verse in the other language)
	private lastSearchQuery: string = '';

	// Verses inserted into a note this session (keyed by verseKey()), so the
	// search modal can mark "you already pasted this one" - deliberately
	// in-memory only, not saved to disk, and reset on reload/restart.
	private recentlyInserted = new RecentVerseTracker(200);

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

		this.addCommand({
			id: 'bible-random-verse',
			name: 'Insert random verse',
			callback: () => {
				this.insertRandomVerse();
			},
			icon: 'shuffle',
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
	 * Pick a random verse from whichever database(s) are loaded (a coin
	 * flip between KJV and RST when both are available) and insert it
	 * directly at the cursor, matching the format template - no modal.
	 */
	private insertRandomVerse() {
		const editor = this.app.workspace.activeEditor?.editor;
		if (!editor) {
			new Notice('No active editor - open a note first');
			return;
		}

		const dbEngine = this.getDbEngine();
		const loadedDbs: DatabaseInstance[] = (['KJV', 'RST'] as const)
			.map((translation) => dbEngine.getDb(translation))
			.filter((db): db is DatabaseInstance => !!db?.isLoaded);

		if (loadedDbs.length === 0) {
			new Notice('No Bible databases loaded. Please configure and download databases in settings.');
			return;
		}

		const db = loadedDbs[Math.floor(Math.random() * loadedDbs.length)]!;
		const verse = getRandomVerse(db);
		if (!verse) {
			new Notice('Failed to pick a random verse');
			return;
		}

		const formatted = formatVerse(verse, this.settings.verseFormat, this.settings.stripMarkup);
		editor.replaceSelection(formatted);
		this.markRecentlyInserted(verseKey(verse));

		new Notice(`Inserted: ${verse.book_name_short} ${verse.chapter}:${verse.verse}`);
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

	/**
	 * Get the last search query, used to pre-fill the search modal on reopen
	 */
	getLastSearchQuery(): string {
		return this.lastSearchQuery;
	}

	/**
	 * Remember the last search query for the session
	 */
	setLastSearchQuery(query: string): void {
		this.lastSearchQuery = query;
	}

	/**
	 * Whether a verse was inserted into a note earlier this session
	 */
	isRecentlyInserted(key: string): boolean {
		return this.recentlyInserted.has(key);
	}

	/**
	 * Record that a verse was just inserted into a note
	 */
	markRecentlyInserted(key: string): void {
		this.recentlyInserted.mark(key);
	}
}
