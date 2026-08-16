import { App, Modal, Editor, MarkdownView, Notice } from 'obsidian';
import BibleSearchPlugin from '../main';
import { Verse, SearchResult } from '../types';
import { search } from '../search/engine';
import { formatVerse, stripMarkup } from '../utils/formatter';
import { splitKeywords } from '../search/parser';
import {
	createSearchInput,
	createMultiSelectToggle,
	renderMultiSelectBar,
	renderResultsList,
	updateSelection,
	showLoading,
	showError,
} from './results-view';

/**
 * Bible Search Modal - Main UI component for searching and inserting verses
 */
export class BibleSearchModal extends Modal {
	private plugin: BibleSearchPlugin;
	private searchInput!: HTMLInputElement;
	private multiSelectToggleButton!: HTMLButtonElement;
	private multiSelectBar!: HTMLElement;
	private resultsContainer!: HTMLElement;
	private currentResults: Verse[] = [];
	private parallelResults: (Verse | undefined)[] | undefined;
	private currentKeywords: string[] = [];
	private selectedIndex: number = -1;
	private searchQuery: string = '';
	private initialQuery: string = '';

	// Multi-select mode: pick several verses, then insert them all at once,
	// each on its own line. Picks are keyed by "translation|book|chapter|verse"
	// since Verse objects aren't guaranteed to be the same reference across
	// re-renders of the same result set.
	private multiSelectMode: boolean = false;
	private selectedVerseKeys: Set<string> = new Set();

	// Debouncing and cancellation
	private searchDebounceTimer: number | null = null;
	private currentSearchAbortController: AbortController | null = null;

	// Debounce delay (ms) - adjust for mobile responsiveness
	private readonly DEBOUNCE_DELAY = 300;

	constructor(app: App, plugin: BibleSearchPlugin) {
		super(app);
		this.plugin = plugin;
		this.modalEl.classList.add('bible-search-modal');
	}

	/**
	 * Set initial query for the search
	 */
	setInitialQuery(query: string): void {
		this.initialQuery = query;
	}

	onOpen() {
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
			this.handleSearch(prefillQuery);
		}
	}

	/**
	 * Handle search input with debouncing
	 * Waits for user to stop typing before performing expensive database search
	 */
	private handleSearch(query: string) {
		this.searchQuery = query;
		this.selectedIndex = -1;

		// Clear previous debounce timer
		if (this.searchDebounceTimer !== null) {
			clearTimeout(this.searchDebounceTimer);
		}

		if (!query || query.length === 0) {
			this.resultsContainer.empty();
			return;
		}

		// Show loading state immediately, but defer actual search
		showLoading(this.resultsContainer);

		// Debounce: wait for user to stop typing
		this.searchDebounceTimer = window.setTimeout(() => {
			this.performSearch(query);
		}, this.DEBOUNCE_DELAY);
	}

	/**
	 * Perform the actual search (after debounce)
	 */
	private async performSearch(query: string) {
		// Cancel previous search if still in progress
		if (this.currentSearchAbortController) {
			this.currentSearchAbortController.abort();
		}

		// Create new abort controller for this search
		this.currentSearchAbortController = new AbortController();
		const abortSignal = this.currentSearchAbortController.signal;

		// Double-check this is still the latest query
		// (user might have typed more while debouncing)
		if (query !== this.searchQuery) {
			return;
		}

		try {
			const dbEngine = this.plugin.getDbEngine();

			// Check if search was aborted while waiting for DB
			if (abortSignal.aborted) return;

			// Ensure at least one database is available (wait if still loading)
			// 5 second timeout for each database (user can wait, but not forever)
			const kjvDbResult = await dbEngine.ensureDb('KJV', 5000).catch(() => null);
			const rstDbResult = await dbEngine.ensureDb('RST', 5000).catch(() => null);

			// Check if search was aborted while waiting for DB
			if (abortSignal.aborted) return;

			// Convert null to undefined for search function
			const kjvDb = kjvDbResult ?? undefined;
			const rstDb = rstDbResult ?? undefined;

			// If no database is ready, show error
			if (!kjvDb && !rstDb) {
				showError(
					this.resultsContainer,
					'No Bible databases available. Please configure and download databases in settings.'
				);
				return;
			}

			const result = await search(
				query,
				kjvDb,
				rstDb,
				this.plugin.settings.showParallelByDefault,
				this.plugin.settings.stripMarkup
			);

			// Check if search was aborted before showing results
			if (abortSignal.aborted) return;

			// Only show results if this is still the latest query
			if (query !== this.searchQuery) {
				return;
			}

			this.currentResults = result.results;
			this.parallelResults = result.parallelResults;
			// A new search's results are a fresh set - past picks don't carry over
			this.selectedVerseKeys.clear();
			this.updateMultiSelectBar();

			if (this.currentResults.length === 0) {
				showError(this.resultsContainer, 'No verses found');
				return;
			}

			// Get keywords for highlighting
			this.currentKeywords = result.isAddressSearch ? [] : splitKeywords(query);

			this.renderResults();
		} catch (error) {
			// Ignore errors if search was aborted
			if (!abortSignal.aborted) {
				console.error('Search error:', error);
				showError(this.resultsContainer, String(error));
			}
		}
	}

	/**
	 * Clear the search query, results, and any pending/in-flight search
	 */
	private handleClear() {
		if (this.searchDebounceTimer !== null) {
			clearTimeout(this.searchDebounceTimer);
			this.searchDebounceTimer = null;
		}
		if (this.currentSearchAbortController) {
			this.currentSearchAbortController.abort();
			this.currentSearchAbortController = null;
		}

		this.searchQuery = '';
		this.currentResults = [];
		this.parallelResults = undefined;
		this.selectedIndex = -1;
		this.selectedVerseKeys.clear();
		this.resultsContainer.empty();
		this.updateMultiSelectBar();
	}

	/**
	 * Handle keyboard navigation
	 */
	private handleKeyDown(event: KeyboardEvent) {
		if (this.currentResults.length === 0) {
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
				if (this.selectedIndex >= 0 && this.selectedIndex < this.currentResults.length) {
					const verse = this.currentResults[this.selectedIndex];
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
	 * Insert verse into active editor
	 */
	private insertVerse(verse: Verse) {
		try {
			const editor = this.app.workspace.activeEditor?.editor;
			if (!editor) {
				new Notice('No active editor');
				return;
			}

			// Format verse using template
			const formattedVerse = formatVerse(
				verse,
				this.plugin.settings.verseFormat,
				this.plugin.settings.stripMarkup
			);

			// Insert at cursor
			editor.replaceSelection(formattedVerse);

			// Close modal
			this.close();

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
		const formatted = formatVerse(verse, this.plugin.settings.verseFormat, this.plugin.settings.stripMarkup);
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
		const verses = this.getOrderedSelectedVerses();
		if (verses.length === 0) {
			return;
		}

		const formatted = verses
			.map((verse) =>
				formatVerse(verse, this.plugin.settings.verseFormat, this.plugin.settings.stripMarkup)
			)
			.join('\n');

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
		if (this.searchDebounceTimer !== null) {
			clearTimeout(this.searchDebounceTimer);
			this.searchDebounceTimer = null;
		}

		const query = `${verse.book_name_short} ${verse.chapter}`;
		this.searchInput.value = query;
		this.searchQuery = query;
		showLoading(this.resultsContainer);

		await this.performSearch(query);

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
	 * Render the current results, reflecting multi-select state
	 */
	private renderResults() {
		if (this.currentResults.length === 0) {
			return;
		}

		renderResultsList(
			this.resultsContainer,
			this.currentResults,
			{
				stripMarkup: this.plugin.settings.stripMarkup,
				highlightMatches: this.plugin.settings.highlightMatches,
				keywords: this.currentKeywords,
				onSelect: (verse) => this.insertVerse(verse),
				parallelResults: this.parallelResults,
				multiSelectMode: this.multiSelectMode,
				isSelected: (verse) => this.selectedVerseKeys.has(this.verseKey(verse)),
				onToggleSelect: (verse) => this.handleToggleSelect(verse),
				onCopy: (verse) => this.copyVerse(verse),
				onExpand: (verse) => this.expandToChapter(verse),
			},
			this.selectedIndex
		);
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
			() => this.copySelectedVerses()
		);
	}

	/**
	 * Toggle a verse's selected state in multi-select mode
	 */
	private handleToggleSelect(verse: Verse) {
		const key = this.verseKey(verse);
		if (this.selectedVerseKeys.has(key)) {
			this.selectedVerseKeys.delete(key);
		} else {
			this.selectedVerseKeys.add(key);
		}
		this.renderResults();
		this.updateMultiSelectBar();
	}

	/**
	 * Stable identity for a verse, since Verse objects aren't guaranteed to
	 * be the same reference across re-renders of the same result set
	 */
	private verseKey(verse: Verse): string {
		return `${verse.translation}|${verse.book_number}|${verse.chapter}|${verse.verse}`;
	}

	/**
	 * Selected verses in the order they appear in the results list -
	 * interleaving each main verse with its parallel translation when both
	 * are selected, matching the on-screen reading order
	 */
	private getOrderedSelectedVerses(): Verse[] {
		const ordered: Verse[] = [];

		this.currentResults.forEach((verse, index) => {
			if (this.selectedVerseKeys.has(this.verseKey(verse))) {
				ordered.push(verse);
			}

			// parallelResults is index-aligned with currentResults - see
			// SearchResult.parallelResults
			const parallel = this.parallelResults?.[index];
			if (parallel && this.selectedVerseKeys.has(this.verseKey(parallel))) {
				ordered.push(parallel);
			}
		});

		return ordered;
	}

	/**
	 * Insert all selected verses into the active editor, each on its own line
	 */
	private insertSelectedVerses() {
		const verses = this.getOrderedSelectedVerses();
		if (verses.length === 0) {
			return;
		}

		try {
			const editor = this.app.workspace.activeEditor?.editor;
			if (!editor) {
				new Notice('No active editor');
				return;
			}

			const formatted = verses
				.map((verse) =>
					formatVerse(verse, this.plugin.settings.verseFormat, this.plugin.settings.stripMarkup)
				)
				.join('\n');

			editor.replaceSelection(formatted);

			this.close();

			new Notice(`Inserted ${verses.length} verse${verses.length === 1 ? '' : 's'}`);
		} catch (error) {
			console.error('Failed to insert verses:', error);
			new Notice('Failed to insert verses');
		}
	}

	onClose() {
		// Remember whatever is in the search box so the next time the modal
		// opens it's pre-filled (empty if the user cleared it before closing)
		this.plugin.setLastSearchQuery(this.searchInput.value);

		const { contentEl } = this;
		contentEl.empty();
	}
}
