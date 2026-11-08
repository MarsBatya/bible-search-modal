import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Verse } from '../src/types';

const { searchMock, renderResultsListMock } = vi.hoisted(() => ({
	searchMock: vi.fn(),
	renderResultsListMock: vi.fn(),
}));

class FakeElement {
	value = '';
	classList = { add: vi.fn(), toggle: vi.fn() };
	empty = vi.fn();
	addClass = vi.fn();
	removeClass = vi.fn();
	createDiv(): FakeElement { return new FakeElement(); }
	createEl(): FakeElement { return new FakeElement(); }
	addEventListener = vi.fn();
	focus = vi.fn();
	select = vi.fn();
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
	updateSelection: vi.fn(),
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

function createModal(): BibleSearchModal {
	const plugin = {
		settings: { showParallelByDefault: false, highlightMatches: false },
		getDbEngine: () => ({ ensureDb: vi.fn().mockResolvedValue({ isLoaded: true }), getDb: vi.fn() }),
		getLastSearchQuery: () => '',
		setLastSearchQuery: vi.fn(),
		isRecentlyInserted: () => false,
	};
	const app = { workspace: { activeEditor: null } };
	const modal = new BibleSearchModal(app as never, plugin as never);
	modal.onOpen();
	return modal;
}

async function settle(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
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
});
