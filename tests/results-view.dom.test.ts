// @vitest-environment jsdom
/**
 * DOM tests for result rendering.
 *
 * These cover the phase-3 rendering requirements: toggling a selection only
 * touches the affected row, appending a page keeps existing row elements,
 * and attaching counterpart blocks doesn't replace primary rows.
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Verse } from '../src/types';
import type { ResultsViewOptions } from '../src/ui/results-view';
import {
	appendResultsList,
	attachParallelResults,
	renderResultsList,
	renderMultiSelectBar,
	updateSelection,
	updateVerseSelection,
} from '../src/ui/results-view';
import { installObsidianDomHelpers } from './dom';

function verse(number: number, translation: Verse['translation'] = 'KJV'): Verse {
	return {
		book_number: 500,
		book_name_short: translation === 'KJV' ? 'John' : 'Ин',
		book_name_long: translation === 'KJV' ? 'John' : 'Иоанн',
		chapter: 3,
		verse: number,
		text: `Verse ${number}`,
		translation,
	};
}

function options(overrides: Partial<ResultsViewOptions> = {}): ResultsViewOptions {
	return {
		highlightMatches: false,
		onSelect: vi.fn(),
		...overrides,
	};
}

function container(): HTMLElement {
	const el = document.createElement('div');
	document.body.appendChild(el);
	return el;
}

function resultRows(root: HTMLElement): HTMLElement[] {
	return Array.from(root.querySelectorAll('.bible-verse-result'));
}

describe('results rendering DOM', () => {
	const scrollIntoView = vi.fn();

	beforeAll(() => {
		installObsidianDomHelpers();
	});

	beforeEach(() => {
		document.body.textContent = '';
		scrollIntoView.mockClear();
		Element.prototype.scrollIntoView = scrollIntoView;
	});

	it('appends a new page without replacing existing row elements', () => {
		const root = container();
		const firstPage = [verse(16), verse(17)];
		renderResultsList(root, firstPage, options(), 0);

		const rowsBefore = resultRows(root);
		const wrappersBefore = Array.from(root.querySelectorAll('[data-row-index]'));

		const secondPage = [verse(18)];
		appendResultsList(root, secondPage, options(), firstPage.length);

		const rowsAfter = resultRows(root);
		expect(rowsAfter).toHaveLength(3);
		expect(rowsAfter[0]).toBe(rowsBefore[0]);
		expect(rowsAfter[1]).toBe(rowsBefore[1]);
		expect(rowsAfter[2]).not.toBe(rowsBefore[1]);

		const wrappersAfter = Array.from(root.querySelectorAll('[data-row-index]'));
		expect(wrappersAfter[0]).toBe(wrappersBefore[0]);
		expect(wrappersAfter[1]).toBe(wrappersBefore[1]);
		expect(wrappersAfter[2]?.getAttribute('data-row-index')).toBe('2');
	});

	it('appends pages with index-aligned parallel results', () => {
		const root = container();
		const firstPage = [verse(16), verse(17)];
		renderResultsList(root, firstPage, options(), 0);

		const third = verse(18);
		const thirdParallel = verse(18, 'RST');
		appendResultsList(
			root,
			[third],
			options({ parallelResults: [undefined, undefined, thirdParallel] }),
			firstPage.length
		);

		const rowTwo = root.querySelector('[data-row-index="2"]');
		expect(rowTwo?.querySelector('.parallel-verse')).not.toBeNull();
		expect(rowTwo?.querySelector('.parallel-verse')?.getAttribute('data-verse-key')).toBe(
			'RST|500|3|18'
		);
	});

	it('attaches counterparts without replacing primary rows', () => {
		const root = container();
		const verses = [verse(16), verse(17)];
		renderResultsList(root, verses, options(), 0);
		const rowsBefore = resultRows(root);
		const mainBlocksBefore = Array.from(root.querySelectorAll('.main-verse'));

		attachParallelResults(root, verses, [verse(16, 'RST'), verse(17, 'RST')], options());

		const rowsAfter = resultRows(root);
		expect(rowsAfter[0]).toBe(rowsBefore[0]);
		expect(rowsAfter[1]).toBe(rowsBefore[1]);
		expect(Array.from(root.querySelectorAll('.main-verse'))).toEqual(mainBlocksBefore);
		expect(root.querySelectorAll('.parallel-verse')).toHaveLength(2);

		// Attaching the same counterparts again must not duplicate blocks.
		attachParallelResults(root, verses, [verse(16, 'RST'), verse(17, 'RST')], options());
		expect(root.querySelectorAll('.parallel-verse')).toHaveLength(2);
	});

	it('toggles only the affected row selection', () => {
		const root = container();
		const verses = [verse(16), verse(17), verse(18)];
		renderResultsList(root, verses, options({ multiSelectMode: true, isSelected: () => false }), 0);

		const blocksBefore = Array.from(root.querySelectorAll('.verse-block'));
		updateVerseSelection(root, verses[1]!, true);

		const blocksAfter = Array.from(root.querySelectorAll('.verse-block'));
		expect(blocksAfter).toEqual(blocksBefore);
		expect(blocksAfter.map((block) => block.classList.contains('checked'))).toEqual([
			false,
			true,
			false,
		]);
		expect(blocksAfter[1]?.querySelector('.verse-checkbox')?.classList.contains('checked')).toBe(
			true
		);

		updateVerseSelection(root, verses[1]!, false);
		expect(
			Array.from(root.querySelectorAll('.verse-block')).map((block) =>
				block.classList.contains('checked')
			)
		).toEqual([false, false, false]);
	});

	it('updates the selection count without replacing focused action controls', () => {
		const root = container();
		const oldCopy = vi.fn();
		const copy = vi.fn();
		renderMultiSelectBar(root, 1, vi.fn(), vi.fn(), oldCopy);
		const buttons = Array.from(root.querySelectorAll('button'));
		buttons[1]!.focus();
		renderMultiSelectBar(root, 2, vi.fn(), vi.fn(), copy);
		expect(Array.from(root.querySelectorAll('button'))).toEqual(buttons);
		expect(document.activeElement).toBe(buttons[1]);
		expect(root.querySelector('.multiselect-count')?.textContent).toBe('2 verses selected');
		buttons[1]!.click();
		expect(copy).toHaveBeenCalledTimes(1);
		expect(oldCopy).not.toHaveBeenCalled();
		renderMultiSelectBar(root, 0, vi.fn(), vi.fn(), copy);
		expect(buttons[1]!.disabled).toBe(true);
		expect(buttons[2]!.disabled).toBe(true);
	});

	it('scrolls the active row immediately for arrow-key navigation', () => {
		const root = container();
		const verses = [verse(16), verse(17)];
		renderResultsList(root, verses, options(), -1);

		updateSelection(root, 1);

		const rows = resultRows(root);
		expect(rows[1]?.classList.contains('selected')).toBe(true);
		expect(rows[0]?.classList.contains('selected')).toBe(false);
		expect(scrollIntoView).toHaveBeenCalledWith({
			behavior: 'auto',
			block: 'nearest',
		});
	});
});
