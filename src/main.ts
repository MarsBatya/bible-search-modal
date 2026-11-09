import { Notice, Plugin, MarkdownView, MarkdownFileInfo, Editor } from 'obsidian';
import {
	DEFAULT_SETTINGS,
	BibleSearchSettings,
	BibleSearchSettingTab,
} from './settings';
import { normalizeDatabaseUrl } from './utils/database-url';
import { DatabaseEngine, getEngineInstance } from './database/engine';
import { getRandomVerse } from './database/queries';
import { pickDatabaseFile } from './database/file-picker';
import type { DatabaseStatus } from './database/status';
import { formatVerse } from './utils/formatter';
import { verseKey } from './utils/verse-key';
import { RecentVerseTracker } from './utils/recent-verses';
import { DatabaseInstance, Translation, TranslationSelection } from './types';
import { BibleSearchModal } from './ui/modal';

export default class BibleSearchPlugin extends Plugin {
	settings!: BibleSearchSettings;
	private dbEngine!: DatabaseEngine;
	private backgroundWarmTimer: number | null = null;
	private unloaded = false;
	private openModals = new Set<BibleSearchModal>();

	// Remembers the last search query for the session, so reopening the
	// search modal can pre-fill it (e.g. to insert another verse from the
	// same search, or the parallel verse in the other language)
	private lastSearchQuery: string = '';

	// Verses inserted into a note this session (keyed by verseKey()), so the
	// search modal can mark "you already pasted this one" - deliberately
	// in-memory only, not saved to disk, and reset on reload/restart.
	private recentlyInserted = new RecentVerseTracker(200);

	// Session-only overrides made from the modal's translation controls.
	// Not persisted: reopening Obsidian falls back to Auto and the saved
	// parallel-display setting.
	private sessionTranslationSelection: TranslationSelection = 'Auto';
	private sessionShowParallel: boolean | null = null;

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
			if (this.unloaded) return;
			this.backgroundWarmTimer = window.setTimeout(() => {
				this.backgroundWarmTimer = null;
				if (!this.unloaded) void this.preloadDatabases();
			}, 3000);
		});
	}

	onunload(): void {
		this.unloaded = true;
		for (const modal of this.openModals) modal.close();
		this.openModals.clear();
		if (this.backgroundWarmTimer !== null) {
			window.clearTimeout(this.backgroundWarmTimer);
			this.backgroundWarmTimer = null;
		}
		this.dbEngine?.dispose();
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<BibleSearchSettings>,
		);
		// Older builds persisted the example.com URLs as if they were real
		// defaults. Treat those (and only those) as unconfigured, while
		// preserving any genuine user-entered URL.
		this.settings.kjvDbUrl = normalizeDatabaseUrl(this.settings.kjvDbUrl);
		this.settings.rstDbUrl = normalizeDatabaseUrl(this.settings.rstDbUrl);
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
		this.openBibleSearchWithQuery('');
	}

	/**
	 * Open Bible search with initial query
	 */
	private openBibleSearchWithQuery(query: string) {
		if (this.unloaded) return;
		const modal = new BibleSearchModal(this.app, this, () => this.openModals.delete(modal));
		this.openModals.add(modal);
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
		if (this.unloaded) return;
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
	 * Download database from URL. An empty/placeholder URL is rejected rather
	 * than silently attempting example.com.
	 */
	async downloadDatabase(translation: Translation, url?: string): Promise<void> {
		const resolvedUrl = normalizeDatabaseUrl(url ?? this.getDatabaseUrl(translation));
		if (!resolvedUrl) {
			new Notice(`Enter a ${translation} database URL in settings first.`);
			throw new Error(`No ${translation} database URL configured`);
		}
		await this.dbEngine.fetchDb(translation, resolvedUrl);
	}

	/** URL currently configured for a translation, or an empty string. */
	getDatabaseUrl(translation: Translation): string {
		return normalizeDatabaseUrl(
			translation === 'KJV' ? this.settings.kjvDbUrl : this.settings.rstDbUrl,
		);
	}

	/** Whether an explicit download can be started for this translation. */
	isDatabaseDownloadConfigured(translation: Translation): boolean {
		return this.getDatabaseUrl(translation).length > 0;
	}

	/** Current per-translation database state for settings and setup UI. */
	getDatabaseStatus(translation: Translation): DatabaseStatus {
		return this.dbEngine.getStatus(translation);
	}

	/** Subscribe to database status changes (for settings and the modal). */
	onDatabaseStatusChange(listener: Parameters<DatabaseEngine['onStatusChange']>[0]): () => void {
		return this.dbEngine.onStatusChange(listener);
	}

	/**
	 * Import a user-selected local SQLite file for a translation. The file's
	 * own name/casing doesn't matter; contents are validated and saved under
	 * the canonical plugin filename.
	 */
	async importDatabase(translation: Translation, file: File): Promise<void> {
		const data = await file.arrayBuffer();
		await this.dbEngine.importDb(translation, data);
		new Notice(`${translation} database imported successfully`);
	}

	/**
	 * Open the file picker and import the selected database. Returns false when
	 * the user cancels, so callers can keep their current UI state.
	 */
	async importDatabaseFromPicker(translation: Translation): Promise<boolean> {
		try {
			const imported = await this.dbEngine.importLocalFile(translation, pickDatabaseFile);
			if (imported) new Notice(`${translation} database imported successfully`);
			return imported;
		} catch (error) {
			console.error(`Failed to import ${translation} database:`, error);
			new Notice(`Failed to import ${translation} database: ${String(error)}`);
			return false;
		}
	}

	/** Retry loading a translation from the cached file. */
	async retryDatabase(translation: Translation): Promise<void> {
		await this.dbEngine.loadDb(translation);
	}

	/**
	 * Get database engine instance
	 */
	getDbEngine(): DatabaseEngine {
		return this.dbEngine;
	}

	/** Translation selected from the modal controls, for this session only. */
	getTranslationSelection(): TranslationSelection {
		return this.sessionTranslationSelection;
	}

	/** Remember the modal's translation override until Obsidian reloads. */
	setTranslationSelection(selection: TranslationSelection): void {
		this.sessionTranslationSelection = selection;
	}

	/**
	 * Whether parallel verses are currently shown. The saved setting is the
	 * initial default; a modal control change overrides it for the session.
	 */
	getShowParallel(): boolean {
		return this.sessionShowParallel ?? this.settings.showParallelByDefault;
	}

	/** Remember the modal's parallel-display override for this session. */
	setShowParallel(show: boolean): void {
		this.sessionShowParallel = show;
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
