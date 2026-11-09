// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SearchResult, Verse } from '../src/types';
import { verseKey } from '../src/utils/verse-key';
import { installObsidianDomHelpers } from './dom';

const { coordinateMock, searchMock, parallelMock } = vi.hoisted(() => ({
	coordinateMock: vi.fn(),
	searchMock: vi.fn(),
	parallelMock: vi.fn(),
}));

vi.mock('obsidian', () => ({
	Modal: class {
		modalEl = document.createElement('div');
		contentEl = document.createElement('div');
		shouldRestoreSelection = true;
		constructor(public app: unknown) {
			this.modalEl.appendChild(this.contentEl);
			document.body.appendChild(this.modalEl);
		}
		close(): void {
			(this as unknown as { onClose?: () => void }).onClose?.();
		}
	},
	Notice: vi.fn(),
	setIcon: vi.fn(),
}));

vi.mock('../src/search/coordinator', () => ({
	coordinateSearch: (...args: unknown[]) => coordinateMock(...args),
	MissingDatabaseError: class MissingDatabaseError extends Error {},
}));
vi.mock('../src/search/engine', () => ({ search: searchMock, getParallelVerses: parallelMock }));

import { BibleSearchModal } from '../src/ui/modal';

function verse(
	number: number,
	overrides: Partial<Verse> = {}
): Verse {
	return {
		book_number: 430,
		book_name_short: 'John',
		book_name_long: 'John',
		chapter: 3,
		verse: number,
		text: `Verse ${number}`,
		translation: 'KJV',
		...overrides,
	};
}

function keyEvent(key: string): KeyboardEvent {
	return { key, preventDefault: vi.fn() } as unknown as KeyboardEvent;
}

async function settle(): Promise<void> {
	for (let index = 0; index < 20; index++) await Promise.resolve();
}

interface FakePluginOptions {
	lastQuery?: string;
	translation?: 'Auto' | 'KJV' | 'RST';
	showParallel?: boolean;
}

function createPlugin(options: FakePluginOptions = {}) {
	const session = {
		translation: options.translation ?? ('Auto' as const),
		showParallel: options.showParallel ?? false,
	};
	return {
		settings: {
			showParallelByDefault: session.showParallel,
			highlightMatches: false,
			verseFormat: '{text}',
			groupAdjacentVerses: false,
		},
		getDbEngine: () => ({
			ensureDb: vi.fn().mockResolvedValue({ isLoaded: true }),
			getDb: vi.fn(),
		}),
		getLastSearchQuery: () => options.lastQuery ?? '',
		setLastSearchQuery: vi.fn(),
		getTranslationSelection: () => session.translation,
		setTranslationSelection: vi.fn((selection: typeof session.translation) => {
			session.translation = selection;
		}),
		getShowParallel: () => session.showParallel,
		setShowParallel: vi.fn((show: boolean) => {
			session.showParallel = show;
		}),
		isRecentlyInserted: () => false,
		markRecentlyInserted: vi.fn(),
		getDatabaseStatus: () => ({ state: 'not-configured' }),
		isDatabaseDownloadConfigured: () => false,
		importDatabaseFromPicker: vi.fn().mockResolvedValue(false),
		downloadDatabase: vi.fn().mockResolvedValue(undefined),
		retryDatabase: vi.fn().mockResolvedValue(undefined),
		onDatabaseStatusChange: vi.fn(() => () => undefined),
	};
}

function createModal(plugin: ReturnType<typeof createPlugin>): BibleSearchModal {
	const app = { workspace: { activeEditor: null } };
	const modal = new BibleSearchModal(app as never, plugin as never);
	modal.onOpen();
	return modal;
}

function primaryResult(overrides: Partial<SearchResult> = {}): SearchResult {
	return {
		results: [verse(16)],
		sourceDb: 'KJV',
		query: 'John 3:16',
		isAddressSearch: true,
		...overrides,
	};
}

describe('modal phase 5 interaction', () => {
	beforeAll(() => installObsidianDomHelpers());

	beforeEach(() => {
		document.body.textContent = '';
		Element.prototype.scrollIntoView = vi.fn();
		coordinateMock.mockReset();
		searchMock.mockReset();
		parallelMock.mockReset();
	});

	afterEach(() => {
		document.body.textContent = '';
	});

	it('navigates from the primary to the parallel verse with arrow keys', async () => {
		const primary = verse(16);
		const parallel = verse(16, { translation: 'RST', book_name_short: 'Ин' });
		coordinateMock.mockImplementation(
			(
				_query: string,
				_selection: unknown,
				_show: boolean,
				_provider: unknown,
				_isCurrent: () => boolean,
				onPrimary: (result: SearchResult) => void
			) => {
				onPrimary(primaryResult({ results: [primary], parallelResults: [parallel] }));
				return Promise.resolve();
			}
		);

		const modal = createModal(createPlugin({ lastQuery: 'John 3:16' }));
		await settle();

		const input = modal['searchInput'];
		modal['handleKeyDown'](keyEvent('ArrowDown'));
		expect(input.getAttribute('aria-activedescendant')).toBe('bible-search-result-0-main');
		expect(
			modal['resultsContainer'].querySelector('[data-block-column="main"]')?.getAttribute(
				'aria-selected'
			)
		).toBe('true');

		modal['handleKeyDown'](keyEvent('ArrowDown'));
		expect(input.getAttribute('aria-activedescendant')).toBe('bible-search-result-0-parallel');
		expect(
			modal['resultsContainer'].querySelector('[data-block-column="parallel"]')?.getAttribute(
				'aria-selected'
			)
		).toBe('true');

		const insert = vi
			.spyOn(modal as never, 'insertVerse' as never)
			.mockImplementation(() => undefined);
		modal['handleKeyDown'](keyEvent('Enter'));
		expect(insert).toHaveBeenCalledWith(parallel);
		modal.onClose();
	});

	it('opens a structured chapter and restores results, selection, and scroll', async () => {
		const first = verse(16);
		const second = verse(17);
		const calls: Array<{ query: string; selection: string; showParallel: boolean; options: any }> = [];
		coordinateMock.mockImplementation(
			(
				query: string,
				selection: string,
				showParallel: boolean,
				_provider: unknown,
				_isCurrent: () => boolean,
				onPrimary: (result: SearchResult) => void,
				_onParallel: unknown,
				_getCurrent: unknown,
				options: any
			) => {
				calls.push({ query, selection, showParallel, options });
				if (calls.length === 1) {
					onPrimary(
						primaryResult({
							results: [first, second],
							query,
							isAddressSearch: false,
						})
					);
				} else {
					onPrimary(
						primaryResult({
							results: [first],
							query,
							isAddressSearch: true,
						})
					);
				}
				return Promise.resolve();
			}
		);

		const plugin = createPlugin({ lastQuery: 'grace' });
		const modal = createModal(plugin);
		await settle();

		modal['toggleMultiSelectMode']();
		modal['selectedIndex'] = 1;
		modal['activeColumn'] = 'main';
		modal['selectedVerseKeys'].add(verseKey(second));
		modal['updateResultsSelection']();
		const resultsContainer = modal['resultsContainer'];
		resultsContainer.scrollTop = 180;

		await modal['expandToChapter'](first);

		expect(calls[1]?.options.reference).toEqual({
			book_number: 430,
			chapter: 3,
			translation: 'KJV',
			book_name_short: 'John',
		});
		expect(calls[1]?.selection).toBe('KJV');
		expect(document.activeElement).toBe(modal['searchInput']);
		modal['toggleMultiSelectMode']();
		expect(modal['navigationContainer'].classList.contains('is-hidden')).toBe(false);
		expect(modal['backToResultsButton']?.textContent).toBe('Back to results');

		modal['backToResultsButton']!.click();
		await settle();

		expect(modal['searchInput'].value).toBe('grace');
		expect(modal['currentResults']).toEqual([first, second]);
		expect(modal['selectedIndex']).toBe(1);
		expect(modal['activeColumn']).toBe('main');
		expect(modal['selectedVerseKeys'].has(verseKey(second))).toBe(true);
		expect(modal['multiSelectMode']).toBe(true);
		expect(modal['multiSelectToggleButton'].getAttribute('aria-pressed')).toBe('true');
		expect(resultsContainer.querySelectorAll('input[type="checkbox"]:checked')).toHaveLength(1);
		expect(modal['searchInput'].getAttribute('aria-activedescendant')).toBe(
			'bible-search-result-1-main'
		);
		expect(resultsContainer.scrollTop).toBe(180);
		expect(modal['navigationContainer'].classList.contains('is-hidden')).toBe(true);
		expect(
			modal['resultsContainer'].querySelectorAll('.bible-verse-result')
		).toHaveLength(2);
		expect(
			modal.contentEl.querySelector<HTMLInputElement>('input[type="radio"][value="Auto"]')
				?.checked
		).toBe(true);
		modal.onClose();
	});

	it('preserves the structured chapter and back target after database setup', async () => {
		coordinateMock.mockImplementation((
			_query: string, _selection: unknown, _show: boolean, _provider: unknown,
			_isCurrent: () => boolean, onPrimary: (result: SearchResult) => void
		) => {
			onPrimary(primaryResult());
			return Promise.resolve();
		});
		const modal = createModal(createPlugin({ lastQuery: 'grace' }));
		await settle();
		await modal['expandToChapter'](verse(16, { book_name_short: 'Unparseable' }));
		const navigation = modal['navigation'];
		modal['retrySearchAfterSetup']();
		await settle();
		expect(coordinateMock.mock.lastCall?.[8]).toEqual({ reference: navigation?.reference });
		expect(modal['navigation']).toBe(navigation);
		modal.onClose();
	});

	it('resumes missing counterparts on Back and ignores enrichment after another search', async () => {
		coordinateMock.mockImplementation((
			_query: string, _selection: unknown, _show: boolean, _provider: unknown,
			_isCurrent: () => boolean, onPrimary: (result: SearchResult) => void
		) => {
			onPrimary(primaryResult());
			return Promise.resolve();
		});
		const parallel = verse(16, { translation: 'RST' });
		parallelMock.mockReturnValue([parallel]);
		const modal = createModal(createPlugin({ lastQuery: 'grace', showParallel: true }));
		await settle();
		await modal['expandToChapter'](verse(16));
		modal['backToResultsButton']!.click();
		await settle();
		expect(modal['parallelResults']).toEqual([parallel]);
		expect(modal['resultsContainer'].querySelectorAll('.parallel-verse')).toHaveLength(1);

		// A new search must invalidate the asynchronous enrichment on Back.
		modal['parallelResults'] = undefined;
		await modal['expandToChapter'](verse(16));
		parallelMock.mockClear();
		modal['backToResultsButton']!.click();
		modal['handleSearch']('faith', true);
		await settle();
		expect(parallelMock).not.toHaveBeenCalled();
		expect(modal['parallelResults']).toBeUndefined();
		modal.onClose();
	});

	it('re-queries immediately when the parallel control changes', async () => {
		coordinateMock.mockResolvedValue(undefined);
		const plugin = createPlugin({ lastQuery: 'grace', showParallel: false });
		coordinateMock.mockImplementation(
			(
				_query: string,
				_selection: unknown,
				_show: boolean,
				_provider: unknown,
				_isCurrent: () => boolean,
				onPrimary: (result: SearchResult) => void
			) => {
				onPrimary(primaryResult({ results: [verse(16)], isAddressSearch: false }));
				return Promise.resolve();
			}
		);
		const modal = createModal(plugin);
		await settle();
		coordinateMock.mockClear();

		modal.setShowParallel(true);
		await settle();

		expect(plugin.setShowParallel).toHaveBeenCalledWith(true);
		expect(coordinateMock).toHaveBeenCalledOnce();
		expect(coordinateMock.mock.calls[0]?.[2]).toBe(true);
		modal.onClose();
	});
});
