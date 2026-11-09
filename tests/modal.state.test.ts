import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Verse } from '../src/types';

const { searchMock, renderResultsListMock } = vi.hoisted(() => ({
	searchMock: vi.fn(),
	renderResultsListMock: vi.fn(),
}));

class FakeElement {
	value = '';
	text = '';
	attributes = new Map<string, string>();
	classList = { add: vi.fn(), toggle: vi.fn() };
	empty = vi.fn(() => { this.text = ''; });
	addClass = vi.fn();
	removeClass = vi.fn();
	createDiv(): FakeElement { return new FakeElement(); }
	createEl(): FakeElement { return new FakeElement(); }
	querySelector = vi.fn(() => null);
	querySelectorAll = vi.fn(() => []);
	addEventListener = vi.fn();
	focus = vi.fn();
	select = vi.fn();
	setText(value: string): void { this.text = value; }
	setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
	removeAttribute(name: string): void { this.attributes.delete(name); }
}

vi.mock('obsidian', () => ({
	Modal: class {
		modalEl = new FakeElement();
		contentEl = new FakeElement();
		constructor(public app: unknown) {}
		close(): void { (this as { onClose: () => void }).onClose(); }
	},
	Notice: vi.fn(),
}));
vi.mock('../src/search/engine', () => ({ search: searchMock }));
vi.mock('../src/ui/results-view', () => ({
	createSearchInput: () => new FakeElement(),
	createMultiSelectToggle: () => new FakeElement(),
	renderMultiSelectBar: vi.fn(),
	renderResultsList: renderResultsListMock,
	appendResultsList: vi.fn(),
	attachParallelResults: vi.fn(),
	updateSelection: vi.fn(),
	updateVerseSelection: vi.fn(),
	showLoading: vi.fn(),
	showError: vi.fn(),
}));

import { BibleSearchModal } from '../src/ui/modal';
import { showError } from '../src/ui/results-view';

const verse: Verse = {
	book_number: 430, book_name_short: 'John', book_name_long: 'John',
	chapter: 3, verse: 16, text: 'For God so loved', translation: 'KJV',
};
const scheduled: Array<() => void> = [];

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
	return { promise, resolve, reject };
}

function createModal(lastQuery = ''): BibleSearchModal {
	const plugin = {
		settings: { showParallelByDefault: false, highlightMatches: false },
		getDbEngine: () => ({ ensureDb: vi.fn().mockResolvedValue({ isLoaded: true }), getDb: vi.fn() }),
		getLastSearchQuery: () => lastQuery,
		setLastSearchQuery: vi.fn(),
		isRecentlyInserted: () => false,
	};
	const app = { workspace: { activeEditor: null } };
	const modal = new BibleSearchModal(app as never, plugin as never);
	modal.onOpen();
	return modal;
}

async function settle(): Promise<void> {
	for (let index = 0; index < 12; index++) await Promise.resolve();
}

async function flushDebounce(): Promise<void> {
	scheduled.at(-1)?.();
	await settle();
}

describe('modal search state', () => {
	beforeEach(() => {
		scheduled.length = 0;
		vi.stubGlobal('window', {
			setTimeout: (callback: () => void): number => scheduled.push(callback),
			clearTimeout: vi.fn(),
		});
		searchMock.mockReset();
		renderResultsListMock.mockReset();
		vi.mocked(showError).mockClear();
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('clears old results and rejects a click from an obsolete rendered row', async () => {
		searchMock.mockResolvedValue({ results: [verse], sourceDb: 'KJV', query: 'John 3:16', isAddressSearch: true });
		const modal = createModal();
		modal['handleSearch']('John 3:16');
		await flushDebounce();
		await settle();
		expect(renderResultsListMock).toHaveBeenCalled();
		const callbacks = renderResultsListMock.mock.lastCall?.[2] as { onSelect: (verse: Verse) => void };
		const insert = vi.spyOn(modal, 'insertVerse' as never);
		modal['handleSearch']('John 3:17');
		expect(modal['currentResults']).toEqual([]);
		callbacks.onSelect(verse);
		expect(insert).not.toHaveBeenCalled();
		expect(modal['currentResults']).toEqual([]);
		modal.onClose();
	});

	it('ignores a completion after clearing input', async () => {
		const pending = deferred<unknown>();
		searchMock.mockReturnValue(pending.promise);
		const modal = createModal();
		modal['handleSearch']('John 3:16');
		await flushDebounce();
		modal['handleClear']();
		pending.resolve({ results: [verse], sourceDb: 'KJV', query: 'John 3:16', isAddressSearch: true });
		await settle();
		expect(modal['currentResults']).toEqual([]);
		expect(renderResultsListMock).not.toHaveBeenCalled();
		modal.onClose();
	});

	it('ignores a completion after the modal closes', async () => {
		const pending = deferred<unknown>();
		searchMock.mockReturnValue(pending.promise);
		const modal = createModal();
		modal['handleSearch']('John 3:16');
		await flushDebounce();
		modal.onClose();
		pending.resolve({ results: [verse], sourceDb: 'KJV', query: 'John 3:16', isAddressSearch: true });
		await settle();
		expect(modal['currentResults']).toEqual([]);
		expect(renderResultsListMock).not.toHaveBeenCalled();
	});

	it('ignores an obsolete failure after a newer query succeeds', async () => {
		const pending = deferred<unknown>();
		searchMock.mockReturnValueOnce(pending.promise)
			.mockResolvedValueOnce({ results: [verse], sourceDb: 'KJV', isAddressSearch: true });
		const modal = createModal();
		modal['handleSearch']('old');
		await flushDebounce();
		modal['handleSearch']('new');
		await flushDebounce();
		await settle();
		pending.reject(new Error('obsolete failure'));
		await settle();
		expect(showError).not.toHaveBeenCalled();
		expect(modal['currentResults']).toEqual([verse]);
		modal.onClose();
	});

	it('ignores a pagination completion after the same query is resubmitted', async () => {
		const page = deferred<unknown>();
		searchMock
			.mockResolvedValueOnce({ results: [verse], sourceDb: 'KJV', query: 'grace', isAddressSearch: false, isTruncated: true })
			.mockReturnValueOnce(page.promise);
		const modal = createModal();
		modal['handleSearch']('grace');
		await flushDebounce();
		const loading = modal['loadMoreResults']();
		modal['handleSearch']('grace');
		page.resolve({ results: [verse], sourceDb: 'KJV', query: 'grace', isAddressSearch: false });
		await loading;
		expect(modal['currentResults']).toEqual([]);
		modal.onClose();
	});

	it('pins pagination to the displayed source and preserves missing counterpart slots', async () => {
		const rstVerse = { ...verse, translation: 'RST' as const };
		const nextVerse = { ...rstVerse, verse: 17 };
		searchMock.mockResolvedValueOnce({ results: [rstVerse], sourceDb: 'RST', isTruncated: true })
			.mockResolvedValueOnce({ results: [nextVerse], sourceDb: 'RST', parallelResults: [verse] });
		const modal = createModal();
		modal['handleSearch']('faith', true);
		await settle();
		await modal['loadMoreResults']();
		expect(searchMock.mock.lastCall?.[5]).toEqual({ translation: 'RST' });
		expect(modal['parallelResults']).toEqual([undefined, verse]);
		modal.onClose();
	});
});

describe('modal search timing', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.stubGlobal('window', {
			setTimeout,
			clearTimeout,
		});
		searchMock.mockReset().mockResolvedValue({
			results: [verse], sourceDb: 'KJV', query: 'John 3:16', isAddressSearch: true,
		});
		renderResultsListMock.mockReset();
	});
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it('debounces typing for 150 ms and keeps prior rows inactive while busy', async () => {
		const modal = createModal('John 3:16');
		await settle();
		const staleActions = renderResultsListMock.mock.lastCall?.[2] as { onSelect: (verse: Verse) => void };
		const results = modal['resultsContainer'] as unknown as FakeElement;
		results.empty.mockClear();
		modal['handleSearch']('John 3:17');
		expect(results.attributes.get('aria-busy')).toBe('true');
		expect(results.empty).not.toHaveBeenCalled();
		const insert = vi.spyOn(modal, 'insertVerse' as never).mockImplementation(() => undefined);
		staleActions.onSelect(verse);
		expect(insert).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(149);
		expect(searchMock).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(1);
		expect(searchMock).toHaveBeenCalledTimes(2);
		expect(results.attributes.has('aria-busy')).toBe(false);
		modal.onClose();
	});

	it('flushes pending Enter without inserting until a later Enter', async () => {
		const modal = createModal();
		modal['handleSearch']('John 3:16');
		const insert = vi.spyOn(modal, 'insertVerse' as never).mockImplementation(() => undefined);
		const event = { key: 'Enter', preventDefault: vi.fn() } as unknown as KeyboardEvent;
		modal['handleKeyDown'](event);
		await settle();
		expect(searchMock).toHaveBeenCalledOnce();
		expect(insert).not.toHaveBeenCalled();
		modal['handleKeyDown'](event);
		expect(insert).toHaveBeenCalledWith(verse);
		modal.onClose();
	});

	it('runs a restored query immediately and delays the searching indicator', async () => {
		const pending = deferred<unknown>();
		searchMock.mockReturnValue(pending.promise);
		const modal = createModal('John 3:16');
		await settle();
		expect(searchMock).toHaveBeenCalledOnce();
		const status = modal['statusContainer'] as unknown as FakeElement;
		expect(status.text).toBe('');
		await vi.advanceTimersByTimeAsync(149);
		expect(status.text).toBe('');
		await vi.advanceTimersByTimeAsync(1);
		expect(status.text).toBe('Searching…');
		pending.resolve({ results: [verse], sourceDb: 'KJV', query: 'John 3:16', isAddressSearch: true });
		await modal['currentPrimaryPromise'];
		modal.onClose();
	});

	it('debounces rapid edits to only the latest query and searches translation changes immediately', async () => {
		const modal = createModal();
		modal['handleSearch']('old');
		await vi.advanceTimersByTimeAsync(100);
		modal['handleSearch']('new');
		await vi.advanceTimersByTimeAsync(149);
		expect(searchMock).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		expect(searchMock).toHaveBeenCalledOnce();
		expect(searchMock.mock.lastCall?.[0]).toBe('new');
		modal['searchInput'].value = 'new';
		modal.setTranslationSelection('RST');
		await settle();
		expect(searchMock).toHaveBeenCalledTimes(2);
		expect(searchMock.mock.lastCall?.[5]).toEqual({ translation: 'RST' });
		modal.onClose();
	});
});
