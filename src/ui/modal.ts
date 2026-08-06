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
	private selectedIndex: number = -1;
	private searchQuery: string = '';
	private initialQuery: string = '';

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
	 * Handle search input
	 */
	private async handleSearch(query: string) {
		this.searchQuery = query;
		this.selectedIndex = -1;

		if (!query || query.length === 0) {
			this.resultsContainer.empty();
			return;
		}

		try {
			showLoading(this.resultsContainer);

			const dbEngine = this.plugin.getDbEngine();
			const kjvDb = dbEngine.getDb('KJV');
			const rstDb = dbEngine.getDb('RST');

			if (!kjvDb?.isLoaded && !rstDb?.isLoaded) {
				showError(
					this.resultsContainer,
					'No Bible databases loaded. Download them in settings.'
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

			this.currentResults = result.results;

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
			});

			// Add to search history
			addToSearchHistory(query);
		} catch (error) {
			console.error('Search error:', error);
			showError(this.resultsContainer, String(error));
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
