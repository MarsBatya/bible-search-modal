import { Verse } from '../types';
import { stripMarkup, highlightKeywords } from '../utils/formatter';

/**
 * Results View Component for rendering verse results
 */

export interface ResultsViewOptions {
	stripMarkup: boolean;
	highlightMatches: boolean;
	keywords?: string[];
	onSelect: (verse: Verse) => void;
	parallelResults?: Verse[];
}

/**
 * Render verse text into an element, expanding **bold** markers (added by
 * highlightKeywords) into <strong> tags, or plain text otherwise
 */
function renderVerseText(container: HTMLElement, text: string): void {
	if (text && text.includes('**')) {
		// Contains markdown-style bold from highlightKeywords
		container.innerHTML = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
	} else {
		container.textContent = text || '(No text available)';
	}
}

/**
 * Render a single verse result with optional parallel translation
 */
export function renderVerseResult(
	container: HTMLElement,
	verse: Verse,
	options: ResultsViewOptions,
	isSelected: boolean = false,
	parallelVerse?: Verse
): void {
	container.empty();

	const resultEl = container.createDiv({
		cls: `bible-verse-result ${isSelected ? 'selected' : ''}`,
	});

	// Main verse
	const mainVerseEl = resultEl.createDiv({ cls: 'verse-block main-verse' });

	// Verse reference
	const refEl = mainVerseEl.createDiv({ cls: 'verse-reference' });
	refEl.createEl('span', {
		cls: 'verse-ref',
		text: `${verse.book_name_short} ${verse.chapter}:${verse.verse}`,
	});
	refEl.createEl('span', {
		cls: `translation-badge ${verse.translation.toLowerCase()}`,
		text: verse.translation,
	});

	// Verse text
	let text = options.stripMarkup ? stripMarkup(verse.text) : (verse.text || '');

	if (options.highlightMatches && options.keywords && options.keywords.length > 0) {
		text = highlightKeywords(text, options.keywords);
	}

	const textEl = mainVerseEl.createDiv({ cls: 'verse-text' });
	renderVerseText(textEl, text);

	// Add click handler to main verse
	mainVerseEl.addEventListener('click', (e) => {
		e.stopPropagation();
		options.onSelect(verse);
	});
	mainVerseEl.style.cursor = 'pointer';

	// Parallel verse (if available)
	if (parallelVerse) {
		const parallelEl = resultEl.createDiv({ cls: 'verse-block parallel-verse' });

		// Parallel verse reference
		const parallelRefEl = parallelEl.createDiv({ cls: 'verse-reference parallel' });
		parallelRefEl.createEl('span', {
			cls: 'verse-ref',
			text: `${parallelVerse.book_name_short} ${parallelVerse.chapter}:${parallelVerse.verse}`,
		});
		parallelRefEl.createEl('span', {
			cls: `translation-badge ${parallelVerse.translation.toLowerCase()}`,
			text: parallelVerse.translation,
		});

		// Parallel verse text
		let parallelText = options.stripMarkup ? stripMarkup(parallelVerse.text) : (parallelVerse.text || '');

		const parallelTextEl = parallelEl.createDiv({ cls: 'verse-text' });
		renderVerseText(parallelTextEl, parallelText);

		// Add click handler to parallel verse
		parallelEl.addEventListener('click', (e) => {
			e.stopPropagation();
			options.onSelect(parallelVerse);
		});
		parallelEl.style.cursor = 'pointer';
	}
}

/**
 * Render results list with optional parallel translations
 */
export function renderResultsList(
	container: HTMLElement,
	verses: Verse[],
	options: ResultsViewOptions,
	selectedIndex: number = -1
): void {
	container.empty();

	if (verses.length === 0) {
		container.createDiv({
			cls: 'no-results',
			text: 'No results found. Try a different search.',
		});
		return;
	}

	const listEl = container.createDiv({ cls: 'verses-list' });

	verses.forEach((verse, index) => {
		// Find matching parallel verse (same book, chapter, verse)
		let parallelVerse: Verse | undefined;
		if (options.parallelResults && options.parallelResults.length > 0) {
			parallelVerse = options.parallelResults.find(
				(pv) =>
					pv.book_number === verse.book_number &&
					pv.chapter === verse.chapter &&
					pv.verse === verse.verse
			);
		}

		const verseEl = listEl.createDiv();
		renderVerseResult(verseEl, verse, options, index === selectedIndex, parallelVerse);
	});
}

/**
 * Create search input element
 */
export function createSearchInput(
	container: HTMLElement,
	onInput: (value: string) => void,
	onKeyDown: (event: KeyboardEvent) => void,
	placeholder: string = 'Search Bible...'
): HTMLInputElement {
	const input = container.createEl('input', {
		type: 'text',
		cls: 'bible-search-input',
		placeholder,
	}) as HTMLInputElement;

	input.addEventListener('input', (e) => {
		onInput((e.target as HTMLInputElement).value);
	});

	input.addEventListener('keydown', onKeyDown);

	return input;
}

/**
 * Update selection highlight
 */
export function updateSelection(
	container: HTMLElement,
	selectedIndex: number
): void {
	const results = container.querySelectorAll('.bible-verse-result');

	results.forEach((el, index) => {
		if (index === selectedIndex) {
			el.classList.add('selected');
			// Scroll into view
			(el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'nearest' });
		} else {
			el.classList.remove('selected');
		}
	});
}

/**
 * Show loading state
 */
export function showLoading(container: HTMLElement): void {
	container.empty();
	container.createDiv({
		cls: 'loading',
		text: 'Searching...',
	});
}

/**
 * Show error state
 */
export function showError(container: HTMLElement, error: string): void {
	container.empty();
	container.createDiv({
		cls: 'error',
		text: `Error: ${error}`,
	});
}
