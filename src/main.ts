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

	async onload(): Promise<void> {
		// Load settings
		await this.loadSettings();

		// Initialize database engine
		this.dbEngine = getEngineInstance(this.app.vault);

		// Add commands
		this.addCommand({
			id: 'bible-search-open',
			name: 'Open bible search',
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
				void this.insertRandomVerse();
			},
			icon: 'shuffle',
		});

		// Add settings tab
		this.addSettingTab(new BibleSearchSettingTab(this.app, this));

		// Defers background database warming until after Obsidian has finished
		// its startup and layout rendering, so it never blocks or contributes
		// to plugin startup time.
		this.app.workspace.onLayoutReady(() => {
			window.setTimeout(() => {
				void this.preloadDatabases();
			}, 3000);
		});
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<BibleSearchSettings>,
		);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	/**
	 * Preload databases in the background after workspace layout is ready
	 */
	private async preloadDatabases(): Promise<void> {
		try {
			await Promise.all([
				this.dbEngine.loadDb('KJV'),
				this.dbEngine.loadDb('RST'),
			]);
		} catch (error) {
			console.debug('Background database preload failed:', error);
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
	private async insertRandomVerse() {
		const editor = this.app.workspace.activeEditor?.editor;
		if (!editor) {
			new Notice('No active editor - open a note first');
			return;
		}

		const dbEngine = this.getDbEngine();
		const [kjv, rst] = await Promise.all([
			dbEngine.ensureDb('KJV', 5000).catch(() => null),
			dbEngine.ensureDb('RST', 5000).catch(() => null),
		]);
		const loadedDbs: DatabaseInstance[] = [kjv, rst].filter(
			(db): db is DatabaseInstance => !!db?.isLoaded
		);

		if (loadedDbs.length === 0) {
			new Notice('No bible databases loaded. Please configure and download databases in settings.');
			return;
		}

		const db = loadedDbs[Math.floor(Math.random() * loadedDbs.length)]!;
		const verse = getRandomVerse(db);
		if (!verse) {
			new Notice('Failed to pick a random verse');
			return;
		}

		const formatted = formatVerse(verse, this.settings.verseFormat);
		editor.replaceSelection(formatted);
		this.markRecentlyInserted(verseKey(verse));

		new Notice(`Inserted: ${verse.book_name_short} ${verse.chapter}:${verse.verse}`);
	}

	/**
	 * Public API for other plugins (e.g. Templater user scripts) to pull a
	 * random verse as a formatted string, without opening the search modal.
	 * Waits for the database to finish loading if it's still in progress
	 * (e.g. called shortly after Obsidian starts) rather than failing just
	 * because it isn't loaded *yet*.
	 *
	 * @param translation 'KJV' or 'RST'
	 * @param verseFormat Format template to use; defaults to the plugin's configured template
	 * @param stripMarkup Whether to strip Strong's numbers/markup; defaults to the plugin's setting
	 * @returns The formatted verse, or null if that database isn't available
	 */
	async retrieveRandomVerse(
		translation: 'KJV' | 'RST',
		verseFormat?: string,
		stripMarkup?: boolean
	): Promise<string | null> {
		const db = await this.dbEngine.ensureDb(translation, 5000).catch(() => null);
		if (!db) {
			return null;
		}
		const verse = getRandomVerse(db);
		if (!verse) {
			return null;
		}
		return formatVerse(verse, verseFormat ?? this.settings.verseFormat);
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
