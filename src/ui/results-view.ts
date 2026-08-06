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
}

/**
 * Render a single verse result
 */
export function renderVerseResult(
	container: HTMLElement,
	verse: Verse,
	options: ResultsViewOptions,
	isSelected: boolean = false
): void {
	container.empty();

	const resultEl = container.createDiv({
		cls: `bible-verse-result ${isSelected ? 'selected' : ''}`,
	});

	// Verse reference
	const refEl = resultEl.createDiv({ cls: 'verse-reference' });
	refEl.createEl('span', {
		cls: 'verse-ref',
		text: `${verse.book_name_short} ${verse.chapter}:${verse.verse}`,
	});
	refEl.createEl('span', {
		cls: `translation-badge ${verse.translation.toLowerCase()}`,
		text: verse.translation,
	});

	// Verse text
	let text = options.stripMarkup ? stripMarkup(verse.text) : verse.text;

	if (options.highlightMatches && options.keywords && options.keywords.length > 0) {
		text = highlightKeywords(text, options.keywords);
	}

	const textEl = resultEl.createDiv({ cls: 'verse-text' });
	textEl.innerHTML = text;

	// Add click handler
	resultEl.addEventListener('click', () => {
		options.onSelect(verse);
	});
}

/**
 * Render results list with infinite scroll
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
		const verseEl = listEl.createDiv();
		renderVerseResult(verseEl, verse, options, index === selectedIndex);
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
