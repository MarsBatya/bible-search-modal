import { describe, expect, it, vi } from 'vitest';
import type { DatabaseInstance, SearchResult, Translation, Verse } from '../src/types';

const { searchMock, parallelMock } = vi.hoisted(() => ({ searchMock: vi.fn(), parallelMock: vi.fn() }));
vi.mock('../src/search/engine', () => ({ search: searchMock, getParallelVerses: parallelMock }));

import { coordinateSearch, MissingDatabaseError } from '../src/search/coordinator';

const verse: Verse = {
	book_number: 430, book_name_short: 'John', book_name_long: 'John',
	chapter: 3, verse: 16, text: 'For God so loved', translation: 'KJV',
};
const primaryResult: SearchResult = {
	results: [verse], sourceDb: 'KJV', query: 'John 3:16', isAddressSearch: true,
};

function database(translation: Translation): DatabaseInstance {
	return { translation, isLoaded: true, russianNumbering: translation === 'RST' } as DatabaseInstance;
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => { resolve = done; });
	return { promise, resolve };
}

describe('search coordination', () => {
	it('publishes the primary result without waiting for a counterpart', async () => {
		const counterpart = deferred<DatabaseInstance | null>();
		const ensureDb = vi.fn((translation: Translation) =>
			translation === 'KJV' ? Promise.resolve(database('KJV')) : counterpart.promise);
		searchMock.mockReset().mockResolvedValueOnce(primaryResult);
		parallelMock.mockReset().mockReturnValue([{ ...verse, translation: 'RST' }]);
		const onPrimary = vi.fn();
		const onParallel = vi.fn();
		const pending = coordinateSearch('John 3:16', 'Auto', true, { ensureDb },
			() => true, onPrimary, onParallel);
		await vi.waitFor(() => expect(onPrimary).toHaveBeenCalledOnce());
		expect(onParallel).not.toHaveBeenCalled();
		expect(searchMock.mock.calls[0]?.[3]).toBe(false);
		counterpart.resolve(database('RST'));
		await pending;
		expect(onParallel).toHaveBeenCalledOnce();
		expect(parallelMock).toHaveBeenCalledWith([verse], expect.objectContaining({ translation: 'RST' }));
	});

	it('does not load the counterpart when parallel display is disabled', async () => {
		const ensureDb = vi.fn().mockResolvedValue(database('KJV'));
		searchMock.mockReset().mockResolvedValue(primaryResult);
		await coordinateSearch('John 3:16', 'KJV', false, { ensureDb },
			() => true, vi.fn(), vi.fn());
		expect(ensureDb).toHaveBeenCalledOnce();
		expect(ensureDb).toHaveBeenCalledWith('KJV', 5000);
	});

	it('falls back in Auto mode and reports the actual source', async () => {
		const rst = database('RST');
		const ensureDb = vi.fn((translation: Translation) =>
			Promise.resolve(translation === 'KJV' ? null : rst));
		searchMock.mockReset().mockResolvedValue({ ...primaryResult, sourceDb: 'RST' });
		const onPrimary = vi.fn();
		await coordinateSearch('John 3:16', 'Auto', false, { ensureDb },
			() => true, onPrimary, vi.fn());
		expect(ensureDb.mock.calls.map((call) => call[0])).toEqual(['KJV', 'RST']);
		expect(searchMock.mock.calls[0]?.[5]).toEqual({ translation: 'RST' });
		expect(onPrimary.mock.calls[0]?.[0].sourceDb).toBe('RST');
	});

	it('reports explicit missing databases without switching translations', async () => {
		const ensureDb = vi.fn().mockResolvedValue(null);
		await expect(coordinateSearch('faith', 'RST', false, { ensureDb },
			() => true, vi.fn(), vi.fn())).rejects.toBeInstanceOf(MissingDatabaseError);
		expect(ensureDb).toHaveBeenCalledOnce();
	});

	it('ignores a late counterpart after the request becomes stale', async () => {
		const counterpart = deferred<DatabaseInstance | null>();
		const ensureDb = vi.fn((translation: Translation) =>
			translation === 'KJV' ? Promise.resolve(database('KJV')) : counterpart.promise);
		searchMock.mockReset().mockResolvedValue(primaryResult);
		let current = true;
		const onPrimary = vi.fn();
		const onParallel = vi.fn();
		const pending = coordinateSearch('John 3:16', 'KJV', true, { ensureDb },
			() => current, onPrimary, onParallel);
		await vi.waitFor(() => expect(onPrimary).toHaveBeenCalledOnce());
		current = false;
		counterpart.resolve(database('RST'));
		await pending;
		expect(onParallel).not.toHaveBeenCalled();
		expect(searchMock).toHaveBeenCalledOnce();
	});

	it('enriches pages loaded while the counterpart was pending', async () => {
		const counterpart = deferred<DatabaseInstance | null>();
		const ensureDb = vi.fn((translation: Translation) =>
			translation === 'KJV' ? Promise.resolve(database('KJV')) : counterpart.promise);
		searchMock.mockReset().mockResolvedValue(primaryResult);
		const rows = [verse];
		const onPrimary = vi.fn();
		const onParallel = vi.fn();
		const pending = coordinateSearch('faith', 'Auto', true, { ensureDb },
			() => true, onPrimary, onParallel, () => rows);
		await vi.waitFor(() => expect(onPrimary).toHaveBeenCalledOnce());
		rows.push({ ...verse, verse: 17 });
		counterpart.resolve(database('RST'));
		await pending;
		expect(parallelMock).toHaveBeenLastCalledWith(rows, expect.objectContaining({ translation: 'RST' }));
		expect(onParallel.mock.lastCall?.[0].results).toHaveLength(2);
	});

	it('keeps primary results usable when counterpart loading fails', async () => {
		const ensureDb = vi.fn((translation: Translation) => translation === 'KJV'
			? Promise.resolve(database('KJV')) : Promise.reject(new Error('unavailable')));
		searchMock.mockReset().mockResolvedValue(primaryResult);
		const onPrimary = vi.fn();
		const onParallel = vi.fn();
		await coordinateSearch('faith', 'Auto', true, { ensureDb }, () => true, onPrimary, onParallel);
		expect(onPrimary).toHaveBeenCalledOnce();
		expect(onParallel).not.toHaveBeenCalled();
	});
});
