import { setIcon } from 'obsidian';
import { Verse } from '../types';
import { stripMarkup, highlightKeywords } from '../utils/formatter';
import { verseKey } from '../utils/verse-key';

/**
 * Results View Component for rendering verse results
 */

export interface ResultsViewOptions {
	highlightMatches: boolean;
	keywords?: string[];
	onSelect: (verse: Verse) => void;
	// Index-aligned with the verses passed to renderResultsList - see
	// SearchResult.parallelResults for why this can't be re-matched by
	// book/chapter/verse equality
	parallelResults?: (Verse | undefined)[];
	// Multi-select mode: tapping a verse toggles it instead of inserting it
	// immediately, so several verses can be picked and pasted together
	multiSelectMode?: boolean;
	isSelected?: (verse: Verse) => boolean;
	onToggleSelect?: (verse: Verse) => void;
	// Copies the verse to the clipboard without inserting it or closing the
	// modal - useful when there's no active editor, or you just want it
	// elsewhere. Omitted -> no copy button rendered.
	onCopy?: (verse: Verse) => void;
	// Re-runs the search as a full-chapter lookup for this verse's book and
	// chapter, then scrolls to and highlights it. Omitted -> no expand button.
	onExpand?: (verse: Verse) => void;
	// Whether this verse was inserted into a note earlier this session -
	// shows a small "already pasted" badge. Omitted -> badge never shown.
	isRecentlyPasted?: (verse: Verse) => boolean;
}

/**
 * Render verse text into an element, expanding **bold** markers (added by
 * highlightKeywords) into <strong> elements, or plain text otherwise.
 * Builds the DOM directly (createEl/appendText) rather than assigning
 * innerHTML - the text always comes from the bundled SQLite databases, but
 * this sidesteps HTML parsing entirely rather than relying on the content
 * being safe.
 */
function renderVerseText(container: HTMLElement, text: string): void {
	container.empty();

	if (!text) {
		container.setText('(No text available)');
		return;
	}

	if (!text.includes('**')) {
		container.setText(text);
		return;
	}

	// Split on **bold** markers, keeping the markers in the result so we
	// can tell bold segments from plain ones
	const parts = text.split(/(\*\*[^*]+\*\*)/g);
	for (const part of parts) {
		const boldMatch = /^\*\*([^*]+)\*\*$/.exec(part);
		if (boldMatch) {
			container.createEl('strong', { text: boldMatch[1] ?? '' });
		} else if (part) {
			container.appendText(part);
		}
	}
}

/**
 * Render the checkbox indicator shown in multi-select mode
 */
function renderCheckbox(refEl: HTMLElement, checked: boolean): void {
	const checkbox = refEl.createDiv({ cls: `verse-checkbox${checked ? ' checked' : ''}` });
	setIcon(checkbox, checked ? 'check' : 'circle');
}

/**
 * Render the "already pasted this session" badge, if the verse was recently
 * inserted into a note
 */
function renderPastedBadge(refEl: HTMLElement, verse: Verse, options: ResultsViewOptions): void {
	if (!options.isRecentlyPasted?.(verse)) return;

	const badge = refEl.createDiv({
		cls: 'verse-pasted-badge',
		attr: { 'aria-label': 'Already inserted this session' },
	});
	setIcon(badge, 'check');
}

/**
 * Render the per-verse action icons (copy, expand to chapter), if their
 * handlers were provided. Each has its own click handler with
 * stopPropagation so it doesn't also trigger the verse row's own
 * select/insert click handler.
 */
function renderVerseActions(refEl: HTMLElement, verse: Verse, options: ResultsViewOptions): void {
	if (!options.onCopy && !options.onExpand) return;

	const actionsEl = refEl.createDiv({ cls: 'verse-actions' });

	if (options.onCopy) {
		const copyButton = actionsEl.createEl('button', {
			cls: 'clickable-icon verse-action-copy',
			attr: { 'aria-label': 'Copy verse' },
		});
		setIcon(copyButton, 'copy');
		copyButton.addEventListener('click', (e) => {
			e.stopPropagation();
			options.onCopy?.(verse);
		});
	}

	if (options.onExpand) {
		const expandButton = actionsEl.createEl('button', {
			cls: 'clickable-icon verse-action-expand',
			attr: { 'aria-label': 'View full chapter' },
		});
		setIcon(expandButton, 'maximize-2');
		expandButton.addEventListener('click', (e) => {
			e.stopPropagation();
			options.onExpand?.(verse);
		});
	}
}

/**
 * Render the primary verse block of a result row
 */
function renderMainVerse(
	resultEl: HTMLElement,
	verse: Verse,
	options: ResultsViewOptions
): void {
	const mainChecked = options.multiSelectMode ? (options.isSelected?.(verse) ?? false) : false;
	const mainPasted = options.isRecentlyPasted?.(verse) ?? false;

	const mainVerseEl = resultEl.createDiv({
		cls: `verse-block main-verse${mainChecked ? ' checked' : ''}${mainPasted ? ' pasted' : ''}`,
		attr: { 'data-verse-key': verseKey(verse) },
	});

	// Verse reference
	const refEl = mainVerseEl.createDiv({ cls: 'verse-reference' });
	if (options.multiSelectMode) {
		renderCheckbox(refEl, mainChecked);
	}
	refEl.createSpan({
		cls: 'verse-ref',
		text: `${verse.book_name_short} ${verse.chapter}:${verse.verse}`,
	});
	refEl.createSpan({
		cls: `translation-badge ${verse.translation.toLowerCase()}`,
		text: verse.translation,
	});
	renderPastedBadge(refEl, verse, options);
	renderVerseActions(refEl, verse, options);

	// Verse text
	let text = stripMarkup(verse.text || '');

	if (options.highlightMatches && options.keywords && options.keywords.length > 0) {
		text = highlightKeywords(text, options.keywords);
	}

	const textEl = mainVerseEl.createDiv({ cls: 'verse-text' });
	renderVerseText(textEl, text);

	// Add click handler to main verse - toggles selection in multi-select
	// mode, otherwise inserts immediately
	mainVerseEl.addEventListener('click', (e) => {
		e.stopPropagation();
		if (options.multiSelectMode) {
			options.onToggleSelect?.(verse);
		} else {
			options.onSelect(verse);
		}
	});
}

/**
 * Render the parallel translation block of a result row
 */
function renderParallelVerse(
	resultEl: HTMLElement,
	parallelVerse: Verse,
	options: ResultsViewOptions
): void {
	const parallelChecked = options.multiSelectMode
		? (options.isSelected?.(parallelVerse) ?? false)
		: false;
	const parallelPasted = options.isRecentlyPasted?.(parallelVerse) ?? false;

	const parallelEl = resultEl.createDiv({
		cls: `verse-block parallel-verse${parallelChecked ? ' checked' : ''}${parallelPasted ? ' pasted' : ''}`,
		attr: { 'data-verse-key': verseKey(parallelVerse) },
	});

	// Parallel verse reference
	const parallelRefEl = parallelEl.createDiv({ cls: 'verse-reference parallel' });
	if (options.multiSelectMode) {
		renderCheckbox(parallelRefEl, parallelChecked);
	}
	parallelRefEl.createSpan({
		cls: 'verse-ref',
		text: `${parallelVerse.book_name_short} ${parallelVerse.chapter}:${parallelVerse.verse}`,
	});
	parallelRefEl.createSpan({
		cls: `translation-badge ${parallelVerse.translation.toLowerCase()}`,
		text: parallelVerse.translation,
	});
	renderPastedBadge(parallelRefEl, parallelVerse, options);
	renderVerseActions(parallelRefEl, parallelVerse, options);

	// Parallel verse text
	const parallelText = stripMarkup(parallelVerse.text || '');

	const parallelTextEl = parallelEl.createDiv({ cls: 'verse-text' });
	renderVerseText(parallelTextEl, parallelText);

	// Add click handler to parallel verse - selected independently from
	// the main verse in multi-select mode
	parallelEl.addEventListener('click', (e) => {
		e.stopPropagation();
		if (options.multiSelectMode) {
			options.onToggleSelect?.(parallelVerse);
		} else {
			options.onSelect(parallelVerse);
		}
	});
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
		cls: `bible-verse-result${isSelected ? ' selected' : ''}`,
	});

	renderMainVerse(resultEl, verse, options);

	if (parallelVerse) {
		renderParallelVerse(resultEl, parallelVerse, options);
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
	appendRows(listEl, verses, options, 0, selectedIndex);
}

/**
 * Append a page of results without touching rows that are already rendered.
 * `startIndex` keeps `parallelResults` index alignment with the full result
 * set, and row indexes let later parallel blocks be attached in place.
 */
export function appendResultsList(
	container: HTMLElement,
	verses: Verse[],
	options: ResultsViewOptions,
	startIndex: number = 0
): void {
	if (verses.length === 0) return;

	let listEl = container.querySelector<HTMLElement>('.verses-list');
	if (!listEl) {
		container.empty();
		listEl = container.createDiv({ cls: 'verses-list' });
	}

	appendRows(listEl, verses, options, startIndex);
}

function appendRows(
	listEl: HTMLElement,
	verses: Verse[],
	options: ResultsViewOptions,
	startIndex: number,
	selectedIndex: number = -1
): void {
	verses.forEach((verse, offset) => {
		const index = startIndex + offset;
		// parallelResults is index-aligned with the full result list (not
		// re-matched by book/chapter/verse - for Psalms/Job/Song of Solomon a
		// correctly paired verse can have different chapter/verse numbers)
		const parallelVerse = options.parallelResults?.[index];

		const rowEl = listEl.createDiv({ attr: { 'data-row-index': String(index) } });
		renderVerseResult(rowEl, verse, options, index === selectedIndex, parallelVerse);
	});
}

/**
 * Attach parallel translation blocks to already-rendered primary rows,
 * without replacing those rows. Rows that already have a parallel block are
 * left alone, so repeated/late counterpart updates stay idempotent.
 */
export function attachParallelResults(
	container: HTMLElement,
	verses: Verse[],
	parallelResults: (Verse | undefined)[] | undefined,
	options: ResultsViewOptions
): void {
	if (!parallelResults) return;

	const listEl = container.querySelector('.verses-list');
	if (!listEl) return;

	verses.forEach((_verse, index) => {
		const parallelVerse = parallelResults[index];
		if (!parallelVerse) return;

		const rowEl = listEl.querySelector(`[data-row-index="${index}"]`);
		const resultEl = rowEl?.querySelector('.bible-verse-result') as HTMLElement | null;
		if (!resultEl || resultEl.querySelector('.parallel-verse')) return;

		renderParallelVerse(resultEl, parallelVerse, options);
	});
}

/**
 * Toggle the multi-select state of a single already-rendered verse row,
 * updating only that row and its checkbox rather than rebuilding the list.
 */
export function updateVerseSelection(
	container: HTMLElement,
	verse: Verse,
	selected: boolean
): void {
	const key = verseKey(verse);
	container.querySelectorAll('[data-verse-key]').forEach((el) => {
		if (el.getAttribute('data-verse-key') !== key) return;
		el.classList.toggle('checked', selected);
		const checkbox = el.querySelector('.verse-checkbox');
		if (checkbox) {
			checkbox.classList.toggle('checked', selected);
			setIcon(checkbox as HTMLElement, selected ? 'check' : 'circle');
		}
	});
}

/**
 * Create search input element, with a button to clear it
 */
export function createSearchInput(
	container: HTMLElement,
	onInput: (value: string) => void,
	onKeyDown: (event: KeyboardEvent) => void,
	onClear: () => void,
	placeholder: string = 'Search Bible...'
): HTMLInputElement {
	const input = container.createEl('input', {
		type: 'text',
		cls: 'bible-search-input',
		placeholder,
	});

	input.addEventListener('input', (e) => {
		onInput((e.target as HTMLInputElement).value);
	});

	input.addEventListener('keydown', onKeyDown);

	const clearButton = container.createEl('button', {
		cls: 'clickable-icon bible-search-clear',
		attr: { 'aria-label': 'Clear search' },
	});
	setIcon(clearButton, 'x');

	clearButton.addEventListener('click', () => {
		input.value = '';
		input.focus();
		onClear();
	});

	return input;
}

/**
 * Create the button that toggles multi-select mode on/off
 */
export function createMultiSelectToggle(
	container: HTMLElement,
	onToggle: () => void
): HTMLButtonElement {
	const button = container.createEl('button', {
		cls: 'clickable-icon bible-multiselect-toggle',
		attr: { 'aria-label': 'Select multiple verses' },
	});
	setIcon(button, 'list-checks');

	button.addEventListener('click', onToggle);

	return button;
}

/**
 * Create (or update) the bar shown in multi-select mode with the selection
 * count and Copy/Insert/Cancel actions
 */
export function renderMultiSelectBar(
	container: HTMLElement,
	selectedCount: number,
	onInsert: () => void,
	onCancel: () => void,
	onCopy: () => void
): void {
	const count = container.querySelector<HTMLElement>('.multiselect-count')
		?? container.createSpan({ cls: 'multiselect-count' });
	count.setText(`${selectedCount} verse${selectedCount === 1 ? '' : 's'} selected`);

	const actionsEl = container.querySelector<HTMLElement>('.multiselect-actions')
		?? container.createDiv({ cls: 'multiselect-actions' });
	const cancelButton = actionsEl.querySelector<HTMLButtonElement>('.multiselect-cancel')
		?? actionsEl.createEl('button', { cls: 'multiselect-cancel', text: 'Cancel' });
	cancelButton.onclick = onCancel;

	const copyButton = actionsEl.querySelector<HTMLButtonElement>('.multiselect-copy')
		?? actionsEl.createEl('button', { cls: 'multiselect-copy' });
	copyButton.setText(`Copy${selectedCount > 0 ? ` (${selectedCount})` : ''}`);
	copyButton.disabled = selectedCount === 0;
	copyButton.onclick = onCopy;

	const insertButton = actionsEl.querySelector<HTMLButtonElement>('.mod-cta')
		?? actionsEl.createEl('button', { cls: 'mod-cta' });
	insertButton.setText(`Insert${selectedCount > 0 ? ` (${selectedCount})` : ''}`);
	insertButton.disabled = selectedCount === 0;
	insertButton.onclick = onInsert;
}

/**
 * Update selection highlight. Scrolling is immediate (not smooth) so
 * arrow-key navigation keeps up with repeated key presses.
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
			(el as HTMLElement).scrollIntoView({ behavior: 'auto', block: 'nearest' });
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
 * Show a neutral empty state. This is not an error: the query was valid but
 * matched nothing, so keep the tone helpful and suggest query shapes.
 */
export function showNoResults(container: HTMLElement, query?: string): void {
	container.empty();
	const empty = container.createDiv({ cls: 'no-results' });
	empty.createDiv({
		text: query?.trim()
			? `No verses found for “${query.trim()}”.`
			: 'No verses found.',
	});
	empty.createDiv({
		cls: 'no-results-hint',
		text: 'Try a book and chapter (e.g. “John 3”), a reference (e.g. “John 3:16”), or keywords (e.g. “grace faith”).',
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
