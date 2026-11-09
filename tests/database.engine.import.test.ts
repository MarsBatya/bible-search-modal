import { beforeAll, describe, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';
import fs from 'node:fs/promises';

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

import { DatabaseEngine, CANONICAL_DATABASE_FILES } from '../src/database/engine';
import type { DatabaseStatusState } from '../src/database/status';

const DIR = 'config/plugins/bible-search-modal/';

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
	return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function makeAdapter(initial: Record<string, Uint8Array> = {}) {
	const files = new Map<string, ArrayBuffer>();
	for (const [path, bytes] of Object.entries(initial)) files.set(path, toArrayBuffer(bytes));

	const adapter = {
		exists: vi.fn(async (path: string) => files.has(path)),
		readBinary: vi.fn(async (path: string) => {
			const data = files.get(path);
			if (!data) throw new Error('File not found');
			return data.slice(0);
		}),
		mkdir: vi.fn(async () => undefined),
		writeBinary: vi.fn(async (path: string, data: ArrayBuffer) => {
			files.set(path, data.slice(0));
		}),
		rename: vi.fn(async (from: string, to: string) => {
			const data = files.get(from);
			if (!data) throw new Error('File not found');
			files.delete(from);
			files.set(to, data);
		}),
		remove: vi.fn(async (path: string) => {
			files.delete(path);
		}),
	};

	const vault = { configDir: 'config', adapter } as never;
	return { engine: new DatabaseEngine(vault), adapter, files };
}

describe('DatabaseEngine local import and replacement', () => {
	let SQL: initSqlJs.SqlJsStatic;

	beforeAll(async () => {
		SQL = await initSqlJs();
		const wasmModule = await import('node:fs/promises');
		const wasmBuffer = await wasmModule.readFile('node_modules/sql.js/dist/sql-wasm.wasm');
		getWasmBinaryMock.mockResolvedValue(
			wasmBuffer.buffer.slice(
				wasmBuffer.byteOffset,
				wasmBuffer.byteOffset + wasmBuffer.byteLength,
			),
		);
	});

	function validDatabase(verseText: string): Uint8Array {
		const db = new SQL.Database();
		db.run('CREATE TABLE books (book_number INTEGER PRIMARY KEY, short_name TEXT, long_name TEXT)');
		db.run('CREATE TABLE verses (book_number INTEGER, chapter INTEGER, verse INTEGER, text TEXT)');
		db.run('CREATE TABLE info (name TEXT, value TEXT)');
		const insertBook = db.prepare('INSERT INTO books VALUES (?, ?, ?)');
		for (let book = 1; book <= 66; book++) insertBook.run([book, `B${book}`, `Book ${book}`]);
		insertBook.free();
		db.run('INSERT INTO verses VALUES (1, 1, 1, ?)', [verseText]);
		const bytes = db.export();
		db.close();
		return bytes;
	}

	it('imports the supplied .SQlite3 databases under canonical filenames', async () => {
		const { engine, files } = makeAdapter();
		const kjv = new Uint8Array(await fs.readFile('pkg/KJV+.SQlite3'));
		const rst = new Uint8Array(await fs.readFile('pkg/RST+.SQlite3'));

		await engine.importDb('KJV', kjv);
		await engine.importDb('RST', rst);

		expect(engine.getDb('KJV')?.isLoaded).toBe(true);
		expect(engine.getDb('RST')?.isLoaded).toBe(true);
		expect(engine.getStatus('KJV').state).toBe('ready');
		expect(engine.getStatus('RST').state).toBe('ready');
		expect(files.has(`${DIR}${CANONICAL_DATABASE_FILES.KJV}`)).toBe(true);
		expect(files.has(`${DIR}${CANONICAL_DATABASE_FILES.RST}`)).toBe(true);
		engine.dispose();
	});

	it('rejects a malformed import without replacing the active database or file', async () => {
		const originalBytes = validDatabase('In the beginning');
		const { engine, adapter, files } = makeAdapter({
			[`${DIR}${CANONICAL_DATABASE_FILES.KJV}`]: originalBytes,
		});
		const active = await engine.loadDb('KJV');
		const cached = files.get(`${DIR}${CANONICAL_DATABASE_FILES.KJV}`)?.slice(0);

		await expect(
			engine.importDb('KJV', new TextEncoder().encode('not a database')),
		).rejects.toThrow();

		expect(engine.getDb('KJV')).toBe(active);
		expect(files.get(`${DIR}${CANONICAL_DATABASE_FILES.KJV}`)).toEqual(cached);
		expect(adapter.writeBinary).not.toHaveBeenCalled();
		expect(engine.getStatus('KJV').state).toBe('failed');
		engine.dispose();
	});

	it('replaces successfully and closes the superseded instance', async () => {
		const originalBytes = validDatabase('old text');
		const replacementBytes = validDatabase('new text');
		const { engine, adapter, files } = makeAdapter({
			[`${DIR}${CANONICAL_DATABASE_FILES.KJV}`]: originalBytes,
		});
		const original = await engine.loadDb('KJV');
		const close = vi.spyOn(original!.db, 'close');
		requestUrlMock.mockResolvedValueOnce({ arrayBuffer: toArrayBuffer(replacementBytes) });

		const replacement = await engine.fetchDb('KJV', 'https://example.test/bible.sqlite3');

		expect(replacement).not.toBe(original);
		expect(engine.getDb('KJV')).toBe(replacement);
		expect(close).toHaveBeenCalledOnce();
		expect(engine.getStatus('KJV').state).toBe('ready');
		expect(adapter.rename).toHaveBeenCalledWith(
			`${DIR}${CANONICAL_DATABASE_FILES.KJV}`,
			`${DIR}${CANONICAL_DATABASE_FILES.KJV}.bak`,
		);
		expect(files.get(`${DIR}${CANONICAL_DATABASE_FILES.KJV}`)).toEqual(toArrayBuffer(replacementBytes));
		expect(files.has(`${DIR}${CANONICAL_DATABASE_FILES.KJV}.tmp`)).toBe(false);
		expect(files.has(`${DIR}${CANONICAL_DATABASE_FILES.KJV}.bak`)).toBe(false);
		engine.dispose();
	});

	it('rolls back the previous file when the replacement rename fails', async () => {
		const originalBytes = validDatabase('old text');
		const replacementBytes = validDatabase('new text');
		const { engine, adapter, files } = makeAdapter({
			[`${DIR}${CANONICAL_DATABASE_FILES.KJV}`]: originalBytes,
		});
		const original = await engine.loadDb('KJV');
		const cached = files.get(`${DIR}${CANONICAL_DATABASE_FILES.KJV}`)?.slice(0);
		const realRename = adapter.rename.getMockImplementation()!;
		let calls = 0;
		adapter.rename.mockImplementation(async (from: string, to: string) => {
			calls++;
			if (calls === 2) throw new Error('rename failure');
			await realRename(from, to);
		});
		requestUrlMock.mockResolvedValueOnce({ arrayBuffer: toArrayBuffer(replacementBytes) });

		await expect(engine.fetchDb('KJV', 'https://example.test/bible.sqlite3')).rejects.toThrow(
			'rename failure',
		);

		expect(engine.getDb('KJV')).toBe(original);
		expect(files.get(`${DIR}${CANONICAL_DATABASE_FILES.KJV}`)).toEqual(cached);
		expect(files.has(`${DIR}${CANONICAL_DATABASE_FILES.KJV}.tmp`)).toBe(false);
		expect(engine.getStatus('KJV').state).toBe('failed');
		engine.dispose();
	});

	it('keeps the active database when an import write fails', async () => {
		const originalBytes = validDatabase('old text');
		const replacementBytes = validDatabase('new text');
		const { engine, adapter, files } = makeAdapter({
			[`${DIR}${CANONICAL_DATABASE_FILES.KJV}`]: originalBytes,
		});
		const original = await engine.loadDb('KJV');
		const cached = files.get(`${DIR}${CANONICAL_DATABASE_FILES.KJV}`)?.slice(0);
		adapter.writeBinary.mockRejectedValueOnce(new Error('write failure'));

		await expect(engine.importDb('KJV', replacementBytes)).rejects.toThrow('write failure');

		expect(engine.getDb('KJV')).toBe(original);
		expect(files.get(`${DIR}${CANONICAL_DATABASE_FILES.KJV}`)).toEqual(cached);
		expect(engine.getStatus('KJV').state).toBe('failed');
		engine.dispose();
	});

	it('publishes status transitions while importing', async () => {
		const { engine } = makeAdapter();
		const seen: DatabaseStatusState[] = [];
		engine.onStatusChange((translation, status) => {
			if (translation === 'KJV') seen.push(status.state);
		});

		await engine.importDb('KJV', validDatabase('In the beginning'));

		expect(seen).toEqual(['loading', 'ready']);
		engine.dispose();
	});

	it('keeps setup busy during file selection and reading, including cached loads', async () => {
		const { engine } = makeAdapter();
		await engine.importDb('KJV', validDatabase('old'));
		let finishRead!: (data: ArrayBuffer) => void;
		const arrayBuffer = vi.fn(() => new Promise<ArrayBuffer>((resolve) => { finishRead = resolve; }));
		const importing = engine.importLocalFile('KJV', async () => ({ arrayBuffer }) as File);
		await vi.waitFor(() => expect(arrayBuffer).toHaveBeenCalledOnce());
		await engine.loadDb('KJV');
		expect(engine.getStatus('KJV').state).toBe('loading');
		const duplicatePicker = vi.fn();
		expect(await engine.importLocalFile('KJV', duplicatePicker)).toBe(false);
		expect(duplicatePicker).not.toHaveBeenCalled();
		finishRead(toArrayBuffer(validDatabase('new')));
		expect(await importing).toBe(true);
		expect(engine.getStatus('KJV').state).toBe('ready');
		engine.dispose();
	});

	it('restores status on picker cancellation and reports file read failures', async () => {
		const { engine } = makeAdapter();
		expect(await engine.importLocalFile('RST', async () => null)).toBe(false);
		expect(engine.getStatus('RST').state).toBe('not-configured');
		await expect(engine.importLocalFile('RST', async () => ({
			arrayBuffer: async () => { throw new Error('Cannot read selected file'); },
		}) as File)).rejects.toThrow('Cannot read selected file');
		expect(engine.getStatus('RST')).toEqual({ state: 'failed', error: 'Cannot read selected file' });
		engine.dispose();
	});

	it('recovers the backup after both installation and rollback renames fail', async () => {
		const path = `${DIR}${CANONICAL_DATABASE_FILES.KJV}`;
		const original = validDatabase('old');
		const { engine, adapter, files } = makeAdapter({ [path]: original });
		await engine.loadDb('KJV');
		const rename = adapter.rename.getMockImplementation()!;
		adapter.rename
			.mockImplementationOnce(rename)
			.mockRejectedValueOnce(new Error('install failed'))
			.mockRejectedValueOnce(new Error('restore failed'));
		await expect(engine.importDb('KJV', validDatabase('new'))).rejects.toThrow('Previous database preserved');
		expect(files.has(path)).toBe(false);
		expect(files.get(`${path}.bak`)).toEqual(toArrayBuffer(original));
		expect(await engine.loadDb('KJV')).not.toBeNull();
		expect(files.get(path)).toEqual(toArrayBuffer(original));
		engine.dispose();
	});
});
