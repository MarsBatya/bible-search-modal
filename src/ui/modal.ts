import { App, Modal, Notice, Editor, EditorPosition } from 'obsidian';
import type BibleSearchPlugin from '../main';
import { Verse, Translation, TranslationSelection } from '../types';
import { search } from '../search/engine';
import { coordinateSearch, MissingDatabaseError } from '../search/coordinator';
import { formatVerse, formatVerses } from '../utils/formatter';
import { splitKeywords } from '../search/parser';
import { verseKey } from '../utils/verse-key';
import {
	createSearchInput,
	createMultiSelectToggle,
	renderMultiSelectBar,
	renderResultsList,
	appendResultsList,
	attachParallelResults,
	updateSelection,
	updateVerseSelection,
	showError,
	showNoResults,
} from './results-view';
import type { ResultsViewOptions } from './results-view';
import { renderDatabaseSetupPanel } from './database-setup';
import type { DatabaseSetupPanel } from './database-setup';
import type { DatabaseStatus } from '../database/status';

/**
 * Bible Search Modal - Main UI component for searching and inserting verses
 */
export class BibleSearchModal extends Modal {
	private plugin: BibleSearchPlugin;
	private searchInput!: HTMLInputElement;
	private multiSelectToggleButton!: HTMLButtonElement;
	private multiSelectBar!: HTMLElement;
	private resultsContainer!: HTMLElement;
	private statusContainer!: HTMLElement;
	private sourceContainer!: HTMLElement;
	private resultSource: Translation | undefined;
	private currentResults: Verse[] = [];
	private currentResultsTruncated = false;
	private isLoadingMore = false;
	private parallelResults: (Verse | undefined)[] | undefined;
	private currentKeywords: string[] = [];
	private selectedIndex: number = -1;
	private searchQuery: string = '';
	private translationSelection: TranslationSelection = 'Auto';
	private requestId = 0;
	private displayedRequestId = -1;
	private closed = false;
	private initialQuery: string = '';

	// The editor and selection/cursor to insert into, captured when the
	// modal opens rather than looked up fresh at insert time. On mobile the
	// on-screen keyboard closing when the modal opens can leave the note
	// editor's *live* selection reset to the start of the file by the time a
	// verse is tapped, which was inserting verses at the top of the note
	// instead of where the cursor actually was. Pinning it down up front
	// sidesteps that regardless of what the live selection does in between.
	private targetEditor: Editor | null = null;
	private insertRange: { from: EditorPosition; to: EditorPosition } | null = null;

	// Multi-select mode: pick several verses, then insert them all at once,
	// each on its own line. Picks are keyed by "translation|book|chapter|verse"
	// since Verse objects aren't guaranteed to be the same reference across
	// re-renders of the same result set.
	private multiSelectMode: boolean = false;
	private selectedVerseKeys: Set<string> = new Set();

	// Debouncing and cancellation
	private searchDebounceTimer: number | null = null;
	private indicatorTimer: number | null = null;
	private currentSearchAbortController: AbortController | null = null;
	private currentPrimaryPromise: Promise<void> = Promise.resolve();
	private databaseSetupPanel: DatabaseSetupPanel | null = null;

	// Debounce delay (ms) - adjust for mobile responsiveness
	private readonly DEBOUNCE_DELAY = 150;

	constructor(app: App, plugin: BibleSearchPlugin, private readonly onClosed?: () => void) {
		super(app);
		this.plugin = plugin;
		this.modalEl.classList.add('bible-search-modal');

		// Obsidian's own Modal has built-in logic to restore the editor's
		// selection on close (shouldRestoreSelection, on by default) - it
		// doesn't know we've just inserted text, so it was very likely
		// fighting our own restoreEditorFocus() and sometimes winning,
		// reapplying whatever it captured at open-time regardless of the
		// edit we just made. We do our own restore deliberately (see
		// insertTextAtEditor/restoreEditorFocus), so opt out of Obsidian's.
		this.shouldRestoreSelection = false;
	}

	/**
	 * Set initial query for the search
	 */
	setInitialQuery(query: string): void {
		this.initialQuery = query;
	}

	/** Used by translation controls when they are added to the modal. */
	setTranslationSelection(selection: TranslationSelection): void {
		if (this.translationSelection === selection || this.closed) return;
		this.translationSelection = selection;
		this.handleSearch(this.searchInput.value, true);
	}

	onOpen(): void {
		this.closed = false;
		// Capture the target editor and its selection/cursor now, before the
		// modal takes over focus - see the comment on targetEditor above.
		const activeEditor = this.app.workspace.activeEditor?.editor ?? null;
		this.targetEditor = activeEditor;
		this.insertRange = activeEditor
			? { from: activeEditor.getCursor('from'), to: activeEditor.getCursor('to') }
			: null;

		const { contentEl } = this;
		contentEl.empty();

		// Create search input
		const inputContainer = contentEl.createDiv({ cls: 'bible-search-bar' });
		this.searchInput = createSearchInput(
			inputContainer,
			(value) => this.handleSearch(value),
			(event) => this.handleKeyDown(event),
			() => this.handleClear(),
			'Search Bible (e.g., "John 3:16" or "grace faith")'
		);
		this.multiSelectToggleButton = createMultiSelectToggle(inputContainer, () =>
			this.toggleMultiSelectMode()
		);

		// Multi-select bar (selection count + Insert/Cancel), hidden until enabled
		this.multiSelectBar = contentEl.createDiv({ cls: 'bible-multiselect-bar is-hidden' });

		// Create results container
		this.resultsContainer = contentEl.createDiv({ cls: 'results-container' });
		this.statusContainer = contentEl.createDiv({ cls: 'search-status' });
		this.sourceContainer = contentEl.createDiv({ cls: 'search-source' });

		// Focus input
		this.searchInput.focus();

		// Pre-fill with an explicit initial query (e.g. "search selected text"),
		// falling back to the last query from this session - handy for inserting
		// another verse from the same search, or the parallel verse in the
		// other language
		const prefillQuery = this.initialQuery || this.plugin.getLastSearchQuery();
		if (prefillQuery) {
			this.searchInput.value = prefillQuery;
			this.searchInput.select();
			this.handleSearch(prefillQuery, true);
		} else {
			this.checkEmptySetup();
		}
	}

	private checkEmptySetup(): void {
		const requestId = this.requestId;
		const engine = this.plugin.getDbEngine();
		void Promise.all([
			engine.ensureDb('KJV').catch(() => null),
			engine.ensureDb('RST').catch(() => null),
		]).then((databases) => {
			if (this.isCurrent(requestId) && !this.searchQuery.trim()
				&& !databases.some((database) => database?.isLoaded)) this.showDatabaseSetup();
		});
	}

	/**
	 * Handle search input with debouncing
	 * Waits for user to stop typing before performing expensive database search
	 */
	private handleSearch(query: string, immediate = false): void {
		const requestId = ++this.requestId;
		this.searchQuery = query;
		this.selectedIndex = -1;
		this.clearResultData();
		this.currentSearchAbortController?.abort();
		this.clearTimers();

		// Clear previous debounce timer
		if (!query.trim()) {
			this.resultsContainer.empty();
			this.statusContainer.empty();
			this.sourceContainer.empty();
			this.resultsContainer.removeAttribute('aria-busy');
			this.checkEmptySetup();
			return;
		}

		// Old rows remain visible, but their callbacks are guarded by request ID.
		this.resultsContainer.setAttribute('aria-busy', 'true');
		this.statusContainer.empty();
		this.indicatorTimer = window.setTimeout(() => {
			this.indicatorTimer = null;
			if (this.isCurrent(requestId)) this.statusContainer.setText('Searching…');
		}, 150);

		if (immediate) {
			void this.performSearch(query, requestId);
			return;
		}
		this.searchDebounceTimer = window.setTimeout(() => {
			this.searchDebounceTimer = null;
			void this.performSearch(query, requestId);
		}, this.DEBOUNCE_DELAY);
	}

	private clearTimers(): void {
		if (this.searchDebounceTimer !== null) window.clearTimeout(this.searchDebounceTimer);
		if (this.indicatorTimer !== null) window.clearTimeout(this.indicatorTimer);
		this.searchDebounceTimer = null;
		this.indicatorTimer = null;
	}

	private finishPending(requestId: number): void {
		if (!this.isCurrent(requestId)) return;
		if (this.indicatorTimer !== null) window.clearTimeout(this.indicatorTimer);
		this.indicatorTimer = null;
		this.statusContainer.empty();
		this.resultsContainer.removeAttribute('aria-busy');
	}

	private isCurrent(requestId: number): boolean {
		return !this.closed && requestId === this.requestId;
	}

	private hasCurrentResults(): boolean {
		return this.isCurrent(this.displayedRequestId) && this.searchQuery.trim().length > 0;
	}

	private clearResultData(): void {
		this.databaseSetupPanel?.destroy();
		this.databaseSetupPanel = null;
		this.displayedRequestId = -1;
		this.resultSource = undefined;
		this.currentResults = [];
		this.currentResultsTruncated = false;
		this.parallelResults = undefined;
		this.currentKeywords = [];
		this.isLoadingMore = false;
		this.selectedVerseKeys.clear();
		this.updateMultiSelectBar();
	}

	/**
	 * Perform the actual search (after debounce)
	 */
	private async performSearch(query: string, requestId: number) {
		if (!this.isCurrent(requestId)) return;
		let primaryDone!: () => void;
		this.currentPrimaryPromise = new Promise<void>((resolve) => { primaryDone = resolve; });
		this.currentSearchAbortController?.abort();
		const controller = new AbortController();
		this.currentSearchAbortController = controller;
		const isCurrent = () => !controller.signal.aborted && this.isCurrent(requestId);
		try {
			await coordinateSearch(query, this.translationSelection,
				this.plugin.settings.showParallelByDefault, this.plugin.getDbEngine(), isCurrent,
				(result) => {
					this.currentResults = result.results;
					this.resultSource = result.sourceDb;
					this.displayedRequestId = requestId;
					this.currentResultsTruncated = result.isTruncated ?? false;
					this.parallelResults = result.parallelResults;
					this.currentKeywords = result.isAddressSearch ? [] : splitKeywords(query);
					this.sourceContainer.setText(`Showing ${result.sourceDb}`);
					this.finishPending(requestId);
					primaryDone();
					if (result.results.length === 0) {
						showNoResults(this.resultsContainer, query);
					} else this.renderResults();
				},
				(result) => {
					// Counterparts arrived after the primary rows rendered -
					// attach them in place instead of rebuilding the list.
					if (!this.hasCurrentResults()) return;
					this.parallelResults = result.parallelResults;
					this.attachParallelResults();
				}, () => this.currentResults);
		} catch (error) {
			if (isCurrent()) {
				this.finishPending(requestId);
				this.sourceContainer.empty();
				if (error instanceof MissingDatabaseError) {
					this.showDatabaseSetup();
				} else {
					console.error('Search error:', error);
					showError(this.resultsContainer, error instanceof Error ? error.message : String(error));
				}
			}
		} finally {
			primaryDone();
		}
	}

	/**
	 * Replace the result area with actionable database setup controls. Shown
	 * when a search can't run because no source database is available.
	 */
	private showDatabaseSetup(): void {
		this.databaseSetupPanel?.destroy();
		this.resultsContainer.empty();
		this.databaseSetupPanel = renderDatabaseSetupPanel(
			this.resultsContainer,
			{
				getDatabaseStatus: (translation) => this.plugin.getDatabaseStatus(translation),
				isDatabaseDownloadConfigured: (translation) =>
					this.plugin.isDatabaseDownloadConfigured(translation),
				importDatabaseFromPicker: async (translation) => {
					const imported = await this.plugin.importDatabaseFromPicker(translation);
					if (imported) this.retrySearchAfterSetup();
					return imported;
				},
				downloadDatabase: async (translation) => {
					await this.plugin.downloadDatabase(translation);
					this.retrySearchAfterSetup();
				},
				retryDatabase: async (translation) => {
					await this.plugin.retryDatabase(translation);
					this.retrySearchAfterSetup();
				},
				onDatabaseStatusChange: (listener: (translation: Translation, status: DatabaseStatus) => void) =>
					this.plugin.onDatabaseStatusChange(listener),
			},
			{
				heading: 'Bible database setup',
				intro: 'Search needs a local KJV or RST database. Import a .sqlite3 file, or configure a download URL in plugin settings.',
			},
		);
	}

	private retrySearchAfterSetup(): void {
		if (this.closed || !this.searchQuery.trim()) return;
		this.handleSearch(this.searchQuery, true);
	}

	/**
	 * Clear the search query, results, and any pending/in-flight search
	 */
	private handleClear() {
		++this.requestId;
		this.clearTimers();
		if (this.currentSearchAbortController) {
			this.currentSearchAbortController.abort();
			this.currentSearchAbortController = null;
		}

		this.searchQuery = '';
		this.selectedIndex = -1;
		this.clearResultData();
		this.resultsContainer.empty();
		this.statusContainer.empty();
		this.sourceContainer.empty();
		this.resultsContainer.removeAttribute('aria-busy');
		this.checkEmptySetup();
	}

	/**
	 * Handle keyboard navigation
	 */
	private handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Enter' && this.searchDebounceTimer !== null) {
			event.preventDefault();
			window.clearTimeout(this.searchDebounceTimer);
			this.searchDebounceTimer = null;
			void this.performSearch(this.searchQuery, this.requestId);
			return;
		}
		if (!this.hasCurrentResults() || this.currentResults.length === 0) {
			return;
		}

		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault();
				this.selectNext();
				break;

			case 'ArrowUp':
				event.preventDefault();
				this.selectPrevious();
				break;

			case 'Enter':
				event.preventDefault();
				if (this.currentResults.length > 0) {
					const verse = this.currentResults[this.selectedIndex >= 0 ? this.selectedIndex : 0];
					if (verse) {
						if (this.multiSelectMode) {
							this.handleToggleSelect(verse);
						} else {
							this.insertVerse(verse);
						}
					}
				}
				break;

			case 'Escape':
				event.preventDefault();
				this.close();
				break;
		}
	}

	/**
	 * Select next result
	 */
	private selectNext() {
		if (this.selectedIndex < this.currentResults.length - 1) {
			this.selectedIndex++;
		} else {
			this.selectedIndex = 0; // Wrap around
		}
		this.updateResultsSelection();
	}

	/**
	 * Select previous result
	 */
	private selectPrevious() {
		if (this.selectedIndex > 0) {
			this.selectedIndex--;
		} else {
			this.selectedIndex = this.currentResults.length - 1; // Wrap around
		}
		this.updateResultsSelection();
	}

	/**
	 * Update the visual selection
	 */
	private updateResultsSelection() {
		updateSelection(this.resultsContainer, this.selectedIndex);
	}

	/**
	 * Replace the captured insert range (see targetEditor/insertRange) with
	 * `text`, falling back to the editor's live cursor if the modal somehow
	 * opened without one captured. Leaves the model's selection at the end
	 * of the inserted text; call restoreEditorFocus() after closing the
	 * modal to hand focus back and scroll there.
	 */
	private insertTextAtEditor(text: string): { editor: Editor; endPos: EditorPosition } | null {
		const editor = this.targetEditor ?? this.app.workspace.activeEditor?.editor;
		if (!editor) {
			new Notice('No active editor');
			return null;
		}

		const range = this.insertRange ?? { from: editor.getCursor(), to: editor.getCursor() };
		editor.replaceRange(text, range.from, range.to);

		const endPos = editor.offsetToPos(editor.posToOffset(range.from) + text.length);
		editor.setSelection(endPos);

		return { editor, endPos };
	}

	/**
	 * Hand focus back to the note editor and scroll to `pos`. Reasserts a
	 * few times over the next moment rather than once - on mobile, closing
	 * the modal and dismissing the on-screen keyboard both do their own
	 * focus handling slightly asynchronously, and if either of those lands
	 * *after* a single one-shot restore, it can silently win and leave the
	 * cursor wherever it left it (often the top of the file). Calling
	 * setSelection/focus repeatedly is cheap and idempotent, so brute-forcing
	 * "whichever runs last wins" is more reliable here than trying to guess
	 * the one correct delay.
	 */
	private restoreEditorFocus(editor: Editor, pos: EditorPosition) {
		const reassert = () => {
			editor.setSelection(pos);
			editor.focus();
			editor.scrollIntoView({ from: pos, to: pos }, true);
		};
		reassert();
		window.setTimeout(reassert, 50);
		window.setTimeout(reassert, 250);
	}

	/**
	 * Blur the search input, close the modal, and hand focus back to the
	 * note editor. Blurring first (rather than leaving it as a side effect
	 * of the modal tearing down) lets the on-screen keyboard start hiding
	 * immediately, in parallel with the modal's own close transition,
	 * instead of only starting once that transition finishes - on mobile
	 * that serialization is most of what reads as "lag" between tapping a
	 * verse and seeing it land in the note.
	 */
	private closeAndRestoreFocus(inserted: { editor: Editor; endPos: EditorPosition }) {
		this.searchInput.blur();
		this.close();
		this.restoreEditorFocus(inserted.editor, inserted.endPos);
	}

	/**
	 * Insert verse into active editor
	 */
	private insertVerse(verse: Verse) {
		if (!this.hasCurrentResults()) return;
		try {
			// Format verse using template
			const formattedVerse = formatVerse(
				verse,
				this.plugin.settings.verseFormat
			);

			const inserted = this.insertTextAtEditor(formattedVerse);
			if (!inserted) return;

			this.plugin.markRecentlyInserted(verseKey(verse));
			this.closeAndRestoreFocus(inserted);

			new Notice(`Inserted: ${verse.book_name_short} ${verse.chapter}:${verse.verse}`);
		} catch (error) {
			console.error('Failed to insert verse:', error);
			new Notice('Failed to insert verse');
		}
	}

	/**
	 * Copy a single verse to the clipboard, formatted using the configured
	 * template. Unlike inserting, this doesn't require an active editor and
	 * doesn't close the modal - handy for browsing several verses and
	 * copying each one out to paste elsewhere.
	 */
	private async copyVerse(verse: Verse) {
		if (!this.hasCurrentResults()) return;
		const formatted = formatVerse(verse, this.plugin.settings.verseFormat);
		const copied = await this.writeToClipboard(formatted);
		if (copied) {
			new Notice(`Copied: ${verse.book_name_short} ${verse.chapter}:${verse.verse}`);
		}
	}

	/**
	 * Copy all multi-selected verses to the clipboard, each on its own line -
	 * same formatting and ordering as insertSelectedVerses(), but doesn't
	 * clear the selection or close the modal
	 */
	private async copySelectedVerses() {
		if (!this.hasCurrentResults()) return;
		const verses = this.getOrderedSelectedVerses();
		if (verses.length === 0) {
			return;
		}

		const formatted = formatVerses(
			verses,
			this.plugin.settings.verseFormat,
			this.plugin.settings.groupAdjacentVerses,
		).join('\n');

		const copied = await this.writeToClipboard(formatted);
		if (copied) {
			new Notice(`Copied ${verses.length} verse${verses.length === 1 ? '' : 's'}`);
		}
	}

	/**
	 * Write text to the system clipboard, showing a Notice on failure.
	 * Returns whether it succeeded, so callers can skip their own success
	 * Notice without duplicating the try/catch.
	 */
	private async writeToClipboard(text: string): Promise<boolean> {
		try {
			await navigator.clipboard.writeText(text);
			return true;
		} catch (error) {
			console.error('Failed to copy to clipboard:', error);
			new Notice('Failed to copy to clipboard');
			return false;
		}
	}

	/**
	 * Re-run the search as a full-chapter lookup for this verse's book and
	 * chapter (reusing the address-search chapter path - typing e.g. "John 3"
	 * already returns the whole chapter), then scroll to and highlight the
	 * verse that was expanded from, so it opens in context instead of at the
	 * top of the chapter.
	 */
	private async expandToChapter(verse: Verse) {
		if (!this.hasCurrentResults()) return;
		const query = `${verse.book_name_short} ${verse.chapter}`;
		this.searchInput.value = query;
		this.handleSearch(query, true);
		const requestId = this.requestId;
		// The immediate search is already running; wait for its primary result.
		await this.currentPrimaryPromise;
		if (!this.isCurrent(requestId) || !this.hasCurrentResults()) return;

		const index = this.currentResults.findIndex(
			(v) =>
				v.translation === verse.translation &&
				v.book_number === verse.book_number &&
				v.chapter === verse.chapter &&
				v.verse === verse.verse
		);
		if (index !== -1) {
			this.selectedIndex = index;
			this.updateResultsSelection();
		}
	}

	/**
	 * Build the results-view options for the currently displayed result set.
	 * The callbacks guard on the request that produced the rows, so rows left
	 * over from an older query can't act once a newer one is displayed.
	 */
	private createResultsOptions(): ResultsViewOptions {
		const renderedRequestId = this.displayedRequestId;
		const isActionCurrent = () => this.isCurrent(renderedRequestId) && this.hasCurrentResults();

		return {
			highlightMatches: this.plugin.settings.highlightMatches,
			keywords: this.currentKeywords,
			onSelect: (verse) => { if (isActionCurrent()) this.insertVerse(verse); },
			parallelResults: this.parallelResults,
			multiSelectMode: this.multiSelectMode,
			isSelected: (verse) => this.selectedVerseKeys.has(verseKey(verse)),
			onToggleSelect: (verse) => { if (isActionCurrent()) this.handleToggleSelect(verse); },
			onCopy: (verse) => { if (isActionCurrent()) void this.copyVerse(verse); },
			onExpand: (verse) => { if (isActionCurrent()) void this.expandToChapter(verse); },
			isRecentlyPasted: (verse) => this.plugin.isRecentlyInserted(verseKey(verse)),
		};
	}

	/**
	 * Render the current results, reflecting multi-select state
	 */
	private renderResults() {
		if (!this.hasCurrentResults() || this.currentResults.length === 0) {
			return;
		}

		renderResultsList(
			this.resultsContainer,
			this.currentResults,
			this.createResultsOptions(),
			this.selectedIndex
		);

		this.updateTruncationControls();
	}

	/**
	 * Append only the newly loaded page, leaving existing rows (and their
	 * scroll position/focus) untouched.
	 */
	private appendResults(verses: Verse[], startIndex: number) {
		if (!this.hasCurrentResults() || verses.length === 0) return;
		appendResultsList(this.resultsContainer, verses, this.createResultsOptions(), startIndex);
	}

	/**
	 * Attach counterpart blocks to existing primary rows in place.
	 */
	private attachParallelResults() {
		if (!this.hasCurrentResults()) return;
		attachParallelResults(
			this.resultsContainer,
			this.currentResults,
			this.parallelResults,
			this.createResultsOptions()
		);
	}

	/**
	 * Create or update the truncation notice / "Load more" control without
	 * recreating it, so a focused button keeps focus across pagination.
	 */
	private updateTruncationControls() {
		const existing = this.resultsContainer.querySelector<HTMLElement>('.search-more-results');

		if (!this.currentResultsTruncated || this.currentResults.length === 0) {
			existing?.remove();
			return;
		}

		const moreResultsEl = existing ?? this.resultsContainer.createDiv({ cls: 'search-more-results' });
		let messageEl = moreResultsEl.querySelector<HTMLElement>('.search-truncation-message');
		if (!messageEl) {
			messageEl = moreResultsEl.createDiv({ cls: 'search-truncation-message' });
		}
		messageEl.setText(
			`Showing ${this.currentResults.length} results. More matches are available.`
		);

		let loadMoreButton = moreResultsEl.querySelector<HTMLButtonElement>('button');
		if (!loadMoreButton) {
			loadMoreButton = moreResultsEl.createEl('button');
			loadMoreButton.addEventListener('click', () => {
				if (this.hasCurrentResults()) void this.loadMoreResults();
			});
		}
		loadMoreButton.setText(this.isLoadingMore ? 'Loading…' : 'Load more results');
		loadMoreButton.disabled = this.isLoadingMore;
	}

	/** Append the next keyword result page without discarding current selections. */
	private async loadMoreResults() {
		if (!this.hasCurrentResults() || this.isLoadingMore || !this.currentResultsTruncated) return;
		const requestId = this.requestId;
		const query = this.searchQuery;
		const priorCount = this.currentResults.length;
		this.isLoadingMore = true;
		this.updateTruncationControls();

		try {
			const engine = this.plugin.getDbEngine();
			const result = await search(
				query,
				engine.getDb('KJV'),
				engine.getDb('RST'),
				this.plugin.settings.showParallelByDefault,
				priorCount,
				{ translation: this.resultSource }
			);
			if (!this.isCurrent(requestId) || !this.hasCurrentResults()) return;
			const appended = result.results;
			this.currentResults = this.currentResults.concat(appended);
			this.parallelResults = this.parallelResults || result.parallelResults
				? (this.parallelResults ?? Array<Verse | undefined>(priorCount).fill(undefined))
					.concat(result.parallelResults ?? Array<Verse | undefined>(appended.length).fill(undefined))
				: undefined;
			this.currentResultsTruncated = result.isTruncated ?? false;
			this.appendResults(appended, priorCount);
		} catch (error) {
			if (this.isCurrent(requestId)) {
				console.error('Failed to load more search results:', error);
				new Notice('Failed to load more results');
			}
		} finally {
			if (this.isCurrent(requestId)) {
				this.isLoadingMore = false;
				this.updateTruncationControls();
			}
		}
	}

	/**
	 * Turn multi-select mode on/off. Turning it off discards any picks -
	 * picks don't persist once you're back to single-tap-to-insert.
	 */
	private toggleMultiSelectMode() {
		this.multiSelectMode = !this.multiSelectMode;
		if (!this.multiSelectMode) {
			this.selectedVerseKeys.clear();
		}
		this.multiSelectToggleButton.classList.toggle('is-active', this.multiSelectMode);
		this.renderResults();
		this.updateMultiSelectBar();
	}

	/**
	 * Show/hide and refresh the selection-count / Insert / Cancel bar
	 */
	private updateMultiSelectBar() {
		if (!this.multiSelectMode) {
			this.multiSelectBar.addClass('is-hidden');
			this.multiSelectBar.empty();
			return;
		}

		this.multiSelectBar.removeClass('is-hidden');
		renderMultiSelectBar(
			this.multiSelectBar,
			this.selectedVerseKeys.size,
			() => this.insertSelectedVerses(),
			() => this.toggleMultiSelectMode(),
			() => void this.copySelectedVerses()
		);
	}

	/**
	 * Toggle a verse's selected state in multi-select mode. Only the affected
	 * row and the selection counter are updated - the rest of the list is
	 * left in place so scroll position and focus survive.
	 */
	private handleToggleSelect(verse: Verse) {
		if (!this.hasCurrentResults()) return;
		const key = verseKey(verse);
		const selected = !this.selectedVerseKeys.has(key);
		if (selected) {
			this.selectedVerseKeys.add(key);
		} else {
			this.selectedVerseKeys.delete(key);
		}
		updateVerseSelection(this.resultsContainer, verse, selected);
		this.updateMultiSelectBar();
	}

	/**
	 * Selected verses in the order they appear in the results list -
	 * interleaving each main verse with its parallel translation when both
	 * are selected, matching the on-screen reading order
	 */
	private getOrderedSelectedVerses(): Verse[] {
		const ordered: Verse[] = [];

		this.currentResults.forEach((verse, index) => {
			if (this.selectedVerseKeys.has(verseKey(verse))) {
				ordered.push(verse);
			}

			// parallelResults is index-aligned with currentResults - see
			// SearchResult.parallelResults
			const parallel = this.parallelResults?.[index];
			if (parallel && this.selectedVerseKeys.has(verseKey(parallel))) {
				ordered.push(parallel);
			}
		});

		return ordered;
	}

	/**
	 * Insert all selected verses into the active editor, each on its own line
	 */
	private insertSelectedVerses() {
		if (!this.hasCurrentResults()) return;
		const verses = this.getOrderedSelectedVerses();
		if (verses.length === 0) {
			return;
		}

		try {
			const formatted = formatVerses(
				verses,
				this.plugin.settings.verseFormat,
				this.plugin.settings.groupAdjacentVerses,
			).join('\n');

			const inserted = this.insertTextAtEditor(formatted);
			if (!inserted) return;

			verses.forEach((verse) => this.plugin.markRecentlyInserted(verseKey(verse)));
			this.closeAndRestoreFocus(inserted);

			new Notice(`Inserted ${verses.length} verse${verses.length === 1 ? '' : 's'}`);
		} catch (error) {
			console.error('Failed to insert verses:', error);
			new Notice('Failed to insert verses');
		}
	}

	onClose(): void {
		this.closed = true;
		++this.requestId;
		this.clearTimers();
		this.currentSearchAbortController?.abort();
		this.currentSearchAbortController = null;
		this.clearResultData();
		// Remember whatever is in the search box so the next time the modal
		// opens it's pre-filled (empty if the user cleared it before closing)
		this.plugin.setLastSearchQuery(this.searchInput.value);

		const { contentEl } = this;
		contentEl.empty();
		this.onClosed?.();
	}
}
