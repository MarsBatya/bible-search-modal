import { App, Modal, Editor, MarkdownView, Notice } from 'obsidian';
import BibleSearchPlugin from '../main';
import { Verse, SearchResult } from '../types';
import { search, addToSearchHistory } from '../search/engine';
import { formatVerse, stripMarkup } from '../utils/formatter';
import { splitKeywords } from '../search/parser';
import {
	createSearchInput,
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
	private resultsContainer!: HTMLElement;
	private currentResults: Verse[] = [];
	private parallelResults: Verse[] | undefined = [];
	private selectedIndex: number = -1;
	private searchQuery: string = '';
	private initialQuery: string = '';

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
		const inputContainer = contentEl.createDiv({ cls: 'search-input-container' });
		this.searchInput = createSearchInput(
			inputContainer,
			(value) => this.handleSearch(value),
			(event) => this.handleKeyDown(event),
			'Search Bible (e.g., "John 3:16" or "grace faith")'
		);

		// Create results container
		this.resultsContainer = contentEl.createDiv({ cls: 'results-container' });

		// Focus input
		this.searchInput.focus();

		// Set initial query if provided
		if (this.initialQuery) {
			this.searchInput.value = this.initialQuery;
			this.handleSearch(this.initialQuery);
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

			if (this.currentResults.length === 0) {
				showError(this.resultsContainer, 'No verses found');
				return;
			}

			// Get keywords for highlighting
			const keywords = result.isAddressSearch ? [] : splitKeywords(query);

			renderResultsList(this.resultsContainer, this.currentResults, {
				stripMarkup: this.plugin.settings.stripMarkup,
				highlightMatches: this.plugin.settings.highlightMatches,
				keywords,
				onSelect: (verse) => this.insertVerse(verse),
				parallelResults: this.parallelResults,
			});

			// Add to search history
			addToSearchHistory(query);
		} catch (error) {
			// Ignore errors if search was aborted
			if (!abortSignal.aborted) {
				console.error('Search error:', error);
				showError(this.resultsContainer, String(error));
			}
		}
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
						this.insertVerse(verse);
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

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
