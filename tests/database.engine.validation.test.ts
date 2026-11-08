import { beforeAll, describe, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';

const { requestUrlMock, getWasmBinaryMock } = vi.hoisted(() => ({
	requestUrlMock: vi.fn(),
	getWasmBinaryMock: vi.fn(),
}));

vi.mock('obsidian', () => ({
	Notice: vi.fn(),
	requestUrl: requestUrlMock,
}));

vi.mock('../src/database/wasm-loader', () => ({
	getWasmBinary: getWasmBinaryMock,
}));

import { DatabaseEngine } from '../src/database/engine';

describe('DatabaseEngine downloaded database validation', () => {
	let SQL: initSqlJs.SqlJsStatic;
	let validDbBytes: Uint8Array;
	let wasmBytes: ArrayBuffer;

	beforeAll(async () => {
		SQL = await initSqlJs();
		const db = new SQL.Database();
		db.run('CREATE TABLE books (book_number INTEGER PRIMARY KEY, short_name TEXT, long_name TEXT)');
		db.run('CREATE TABLE verses (book_number INTEGER, chapter INTEGER, verse INTEGER, text TEXT)');
		db.run('CREATE TABLE info (name TEXT, value TEXT)');
		const insertBook = db.prepare('INSERT INTO books VALUES (?, ?, ?)');
		for (let book = 1; book <= 66; book++) {
			insertBook.run([book, `B${book}`, `Book ${book}`]);
		}
		insertBook.free();
		db.run("INSERT INTO verses VALUES (1, 1, 1, 'In the beginning')");
		validDbBytes = db.export();
		db.close();

		const wasmModule = await import('node:fs/promises');
		const wasmBuffer = await wasmModule.readFile('node_modules/sql.js/dist/sql-wasm.wasm');
		wasmBytes = wasmBuffer.buffer.slice(
			wasmBuffer.byteOffset,
			wasmBuffer.byteOffset + wasmBuffer.byteLength
		);
		getWasmBinaryMock.mockResolvedValue(wasmBytes);
	});

	function makeEngine(initialFile?: Uint8Array) {
		const files = new Map<string, ArrayBuffer>();
		if (initialFile) {
			files.set('config/plugins/bible-search-modal/KJV+.sqlite3', initialFile.slice().buffer);
		}
		const adapter = {
			readBinary: vi.fn(async (path: string) => {
				const data = files.get(path);
				if (!data) throw new Error('File not found');
				return data;
			}),
			mkdir: vi.fn(async () => undefined),
			writeBinary: vi.fn(async (path: string, data: ArrayBuffer) => {
				files.set(path, data.slice(0));
			}),
		};
		const vault = { configDir: 'config', adapter } as never;
		return { engine: new DatabaseEngine(vault), adapter, files };
	}

	it('rejects an invalid download without changing cache or the active database', async () => {
		const { engine, adapter, files } = makeEngine(validDbBytes);
		const active = await engine.loadDb('KJV');
		const cachedBytes = files.get('config/plugins/bible-search-modal/KJV+.sqlite3')?.slice(0);
		requestUrlMock.mockResolvedValueOnce({ arrayBuffer: new TextEncoder().encode('not sqlite').buffer });

		await expect(engine.fetchDb('KJV', 'https://example.test/bad.sqlite3')).rejects.toThrow(
			'Failed to download KJV database'
		);

		expect(adapter.writeBinary).not.toHaveBeenCalled();
		expect(files.get('config/plugins/bible-search-modal/KJV+.sqlite3')).toEqual(cachedBytes);
		expect(engine.getDb('KJV')).toBe(active);
		active?.db.close();
	});

	it('rejects an incomplete Bible schema before writing it to cache', async () => {
		const incompleteDb = new SQL.Database();
		incompleteDb.run('CREATE TABLE books (book_number INTEGER, short_name TEXT, long_name TEXT)');
		incompleteDb.run('CREATE TABLE verses (book_number INTEGER, chapter INTEGER, verse INTEGER)');
		const invalidBytes = incompleteDb.export();
		incompleteDb.close();
		const { engine, adapter } = makeEngine();
		requestUrlMock.mockResolvedValueOnce({ arrayBuffer: invalidBytes.buffer });

		await expect(engine.fetchDb('KJV', 'https://example.test/incomplete.sqlite3')).rejects.toThrow(
			'Missing required books or verses columns'
		);

		expect(adapter.writeBinary).not.toHaveBeenCalled();
	});

	it('loads only cached databases that pass validation', async () => {
		const { engine } = makeEngine(new TextEncoder().encode('not sqlite'));

		await expect(engine.loadDb('KJV')).resolves.toBeNull();
		expect(engine.getDb('KJV')).toBeUndefined();
	});

	it('closes the superseded instance after a successful replacement', async () => {
		const { engine } = makeEngine(validDbBytes);
		const old = await engine.loadDb('KJV');
		const close = vi.spyOn(old!.db, 'close');
		requestUrlMock.mockResolvedValueOnce({ arrayBuffer: validDbBytes.slice().buffer });
		const replacement = await engine.fetchDb('KJV', 'https://example.test/replacement.sqlite3');
		expect(engine.getDb('KJV')).toBe(replacement);
		expect(replacement).not.toBe(old);
		expect(close).toHaveBeenCalledOnce();
		expect(old?.isLoaded).toBe(false);
		engine.dispose();
		expect(replacement.isLoaded).toBe(false);
	});

	it('does not publish a database after disposal during a pending read', async () => {
		const { engine, adapter } = makeEngine(validDbBytes);
		let finishRead!: (data: ArrayBuffer) => void;
		adapter.readBinary.mockImplementationOnce(() => new Promise<ArrayBuffer>((resolve) => { finishRead = resolve; }));
		const loading = engine.loadDb('KJV');
		await vi.waitFor(() => expect(adapter.readBinary).toHaveBeenCalledOnce());
		engine.dispose();
		finishRead(validDbBytes.slice().buffer);
		await expect(loading).rejects.toThrow('disposed');
		expect(engine.getDb('KJV')).toBeUndefined();
	});

	it('reuses an installation completed ahead of a queued load', async () => {
		const { engine, adapter } = makeEngine();
		requestUrlMock.mockResolvedValueOnce({ arrayBuffer: validDbBytes.slice().buffer });
		const installing = engine.fetchDb('KJV', 'https://example.test/bible.sqlite3');
		const loading = engine.loadDb('KJV');
		const installed = await installing;
		expect(await loading).toBe(installed);
		expect(adapter.readBinary).not.toHaveBeenCalled();
		engine.dispose();
	});

	it.each(['mkdir', 'writeBinary'] as const)('closes temporary instances when %s fails', async (method) => {
		const { engine, adapter } = makeEngine(validDbBytes);
		const original = await engine.loadDb('KJV');
		const create = vi.spyOn(engine, 'createValidatedInstance' as never);
		adapter[method].mockRejectedValueOnce(new Error('write failure'));
		requestUrlMock.mockResolvedValueOnce({ arrayBuffer: validDbBytes.slice().buffer });
		await expect(engine.fetchDb('KJV', 'https://example.test/bible.sqlite3')).rejects.toThrow('write failure');
		const temporary = create.mock.results[0]?.value as NonNullable<typeof original>;
		expect(() => temporary.db.exec('SELECT 1')).toThrow();
		expect(engine.getDb('KJV')).toBe(original);
		expect(original?.db.exec('SELECT 1')).toHaveLength(1);
		engine.dispose();
	});

	it('closes a temporary download disposed during its write', async () => {
		const { engine, adapter } = makeEngine();
		let finishWrite!: () => void;
		adapter.writeBinary.mockImplementationOnce(() => new Promise<void>((resolve) => { finishWrite = resolve; }));
		const create = vi.spyOn(engine, 'createValidatedInstance' as never);
		requestUrlMock.mockResolvedValueOnce({ arrayBuffer: validDbBytes.slice().buffer });
		const installing = engine.fetchDb('KJV', 'https://example.test/bible.sqlite3');
		await vi.waitFor(() => expect(adapter.writeBinary).toHaveBeenCalledOnce());
		engine.dispose();
		finishWrite();
		await expect(installing).rejects.toThrow('disposed');
		const temporary = create.mock.results[0]?.value as { db: initSqlJs.Database };
		expect(() => temporary.db.exec('SELECT 1')).toThrow();
		expect(engine.getDb('KJV')).toBeUndefined();
	});
});
