import { requestUrl, Notice, Vault } from 'obsidian';
import initSqlJs from 'sql.js';
import { DatabaseInstance, Translation } from '../types';
import { getWasmBinary } from './wasm-loader';
import { getRussianNumbering } from './queries';
import { disposeSearchCorpus } from './corpus';
import { debug } from '../utils/logger';
import type { DatabaseStatus, DatabaseStatusListener } from './status';

/** Canonical on-disk names. Imports are always saved under these. */
export const CANONICAL_DATABASE_FILES: Record<Translation, string> = {
	KJV: 'KJV+.sqlite3',
	RST: 'RST+.sqlite3',
};

/** Name variants understood in the cache, for files copied in case-insensitively. */
function cachedFileNames(translation: Translation): string[] {
	const base = translation === 'KJV' ? 'KJV+' : 'RST+';
	const bases = [base, base.toLowerCase()];
	const extensions = ['.sqlite3', '.SQlite3', '.SQLite3', '.SQLITE3'];
	return bases.flatMap((prefix) => extensions.map((extension) => `${prefix}${extension}`));
}

function isMissingFileError(error: unknown): boolean {
	const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
	return /enoent|not found|no such file|does not exist|cannot find/.test(message);
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/**
 * Database Engine for managing sql.js SQLite instances
 */
export class DatabaseEngine {
	private sqlJs: initSqlJs.SqlJsStatic | null = null;
	private databases: Map<Translation, DatabaseInstance> = new Map();
	private vault: Vault;
	private pluginDataDir: string;

	// Track loading state
	private loadingPromises: Map<Translation, Promise<DatabaseInstance | null>> = new Map();
	private operations: Map<Translation, Promise<unknown>> = new Map();
	private disposed = false;
	private initPromise: Promise<void> | null = null;
	private statuses = new Map<Translation, DatabaseStatus>();
	private statusListeners = new Set<DatabaseStatusListener>();

	/** Open a SQLite file and verify it contains the Bible tables and usable data. */
	private createValidatedInstance(
		sqlJs: initSqlJs.SqlJsStatic,
		translation: 'KJV' | 'RST',
		data: Uint8Array
	): DatabaseInstance {
		const db = new sqlJs.Database(data);
		try {
			const stmt = db.prepare(`
				SELECT
					(SELECT COUNT(*) FROM books) AS book_count,
					(SELECT COUNT(*) FROM verses) AS verse_count,
					(SELECT COUNT(*) FROM pragma_table_info('books') WHERE name IN ('book_number', 'short_name', 'long_name')) AS book_columns,
					(SELECT COUNT(*) FROM pragma_table_info('verses') WHERE name IN ('book_number', 'chapter', 'verse', 'text')) AS verse_columns
			`);
			try {
				if (!stmt.step()) {
					throw new Error('Database validation query returned no result');
				}
				const row = stmt.getAsObject() as Record<string, number>;
				if (row.book_columns !== 3 || row.verse_columns !== 4) {
					throw new Error('Missing required books or verses columns');
				}
				const bookCount = row.book_count ?? 0;
				const verseCount = row.verse_count ?? 0;
				if (bookCount !== 66 || verseCount <= 0) {
					throw new Error(`Expected 66 Bible books and verse data; found ${bookCount} books and ${verseCount} verses`);
				}
			} finally {
				stmt.free();
			}

			return {
				db,
				translation,
				isLoaded: true,
				russianNumbering: getRussianNumbering(db),
			};
		} catch (error) {
			db.close();
			throw error;
		}
	}

	constructor(vault: Vault) {
		this.vault = vault;
		this.pluginDataDir = `${vault.configDir}/plugins/bible-search-modal/`;
	}

	private assertActive(): void {
		if (this.disposed) throw new Error('Database engine has been disposed');
	}

	/** Current availability of a translation's database. */
	getStatus(translation: Translation): DatabaseStatus {
		const status = this.statuses.get(translation);
		if (status) return status;
		const instance = this.databases.get(translation);
		return instance?.isLoaded ? { state: 'ready' } : { state: 'not-configured' };
	}

	/** Alias used by UI/status callers. */
	getDatabaseStatus(translation: Translation): DatabaseStatus {
		return this.getStatus(translation);
	}

	/** Subscribe to database status changes. Returns an unsubscribe function. */
	onStatusChange(listener: DatabaseStatusListener): () => void {
		this.statusListeners.add(listener);
		return () => this.statusListeners.delete(listener);
	}

	private setStatus(translation: Translation, status: DatabaseStatus): void {
		const previous = this.statuses.get(translation);
		if (previous?.state === status.state && previous.error === status.error) return;
		this.statuses.set(translation, status);
		for (const listener of this.statusListeners) {
			try {
				listener(translation, status);
			} catch (error) {
				console.error('Database status listener failed:', error);
			}
		}
	}

	private markFailure(translation: Translation, error: unknown): void {
		if (this.disposed) return;
		this.setStatus(translation, { state: 'failed', error: errorMessage(error) });
	}

	private serialize<T>(translation: Translation, operation: () => Promise<T>): Promise<T> {
		const previous = this.operations.get(translation);
		const running = (async () => {
			if (previous) await previous.catch(() => undefined);
			this.assertActive();
			return operation();
		})();
		this.operations.set(translation, running);
		void running.then(
			() => { if (this.operations.get(translation) === running) this.operations.delete(translation); },
			() => { if (this.operations.get(translation) === running) this.operations.delete(translation); },
		);
		return running;
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		for (const instance of this.databases.values()) {
			disposeSearchCorpus(instance);
			instance.isLoaded = false;
			instance.db.close();
		}
		this.databases.clear();
		this.statusListeners.clear();
		if (engineInstance === this) engineInstance = null;
	}

	/**
	 * Initialize sql.js library
	 */
	async initSqlJs(): Promise<void> {
		this.assertActive();
		if (this.sqlJs) {
			debug('[SQL.JS] Already initialized, skipping');
			return;
		}

		if (this.initPromise) {
			debug('[SQL.JS] Initialization already in progress, waiting...');
			return this.initPromise;
		}

		debug('[SQL.JS] Starting initialization...');

		this.initPromise = (async () => {
			try {
				// Get the embedded WASM binary
				debug('[SQL.JS] Loading embedded WASM binary...');
				let wasmBinary: ArrayBuffer | undefined;

				try {
					wasmBinary = await getWasmBinary();
					debug('[SQL.JS] Successfully obtained WASM binary from embedded data');
				} catch (e) {
					console.error('[SQL.JS] Failed to load embedded WASM:', e);
					throw e;
				}

				const initOptions: initSqlJs.SqlJsConfig = {
					wasmBinary,
				};

				debug('[SQL.JS] Calling initSqlJs with wasmBinary option');
				const sqlJs = await initSqlJs(initOptions);
				this.assertActive();
				this.sqlJs = sqlJs;
				debug('[SQL.JS] Successfully initialized sql.js');
			} catch (error) {
				this.initPromise = null;
				console.error('[SQL.JS] Failed to initialize sql.js:', error);
				console.error('[SQL.JS] Error details:', {
					message: String(error),
					stack: error instanceof Error ? error.stack : undefined,
				});
				throw new Error('Failed to initialize database engine: ' + String(error));
			}
		})();

		return this.initPromise;
	}

	/**
	 * Get the initialized sql.js instance, initializing it first if needed.
	 * initSqlJs() either sets `this.sqlJs` or throws, so this always resolves non-null.
	 */
	private async getSqlJs(): Promise<initSqlJs.SqlJsStatic> {
		if (!this.sqlJs) {
			await this.initSqlJs();
		}
		this.assertActive();
		return this.sqlJs!;
	}

	/**
	 * Load database from cached file in vault
	 * Returns a promise that can be tracked for loading status
	 */
	loadDb(translation: 'KJV' | 'RST'): Promise<DatabaseInstance | null> {
		if (this.disposed) return Promise.reject(new Error('Database engine has been disposed'));
		// Return cached instance if already loaded
		const cached = this.databases.get(translation);
		if (cached?.isLoaded) {
			if (!this.operations.has(translation) && this.getStatus(translation).state === 'failed') {
				return this.serialize(translation, async () => {
					try {
						await this.recoverBackup(translation);
						this.assertActive();
						this.setStatus(translation, { state: 'ready' });
						return cached;
					} catch (error) {
						this.markFailure(translation, error);
						throw error;
					}
				});
			}
			if (!this.operations.has(translation)) this.setStatus(translation, { state: 'ready' });
			return Promise.resolve(cached);
		}

		// Return cached promise if already loading
		const existing = this.loadingPromises.get(translation);
		if (existing) {
			return existing;
		}

		this.setStatus(translation, { state: 'loading' });

		// Create loading promise and cache it
		const loadPromise = this.serialize(translation, () => this.loadDbInternal(translation));
		this.loadingPromises.set(translation, loadPromise);

		// Clean up promise cache when done (fire-and-forget - loadPromise
		// itself is returned below and awaited by callers)
		void loadPromise.then(
			() => { if (this.loadingPromises.get(translation) === loadPromise) this.loadingPromises.delete(translation); },
			() => { if (this.loadingPromises.get(translation) === loadPromise) this.loadingPromises.delete(translation); },
		);

		return loadPromise;
	}

	/**
	 * Find and read an existing cached database. Looks for the canonical name
	 * first, then common casing variants (the bundled sample files use
	 * `KJV+.SQlite3`), so databases copied in by hand keep working.
	 */
	private async readCachedDatabase(translation: Translation): Promise<Uint8Array | null> {
		const adapter = this.vault.adapter;
		const candidates = cachedFileNames(translation);
		let filePath: string | null = null;

		const exists = (adapter as unknown as { exists?: (path: string) => Promise<boolean> }).exists;
		if (typeof exists === 'function') {
			await this.recoverBackup(translation);
			for (const name of candidates) {
				if (await exists.call(adapter, `${this.pluginDataDir}${name}`)) {
					filePath = `${this.pluginDataDir}${name}`;
					break;
				}
			}
			if (!filePath) {
				// Last resort: list the folder and match the canonical filename
				// case-insensitively. This accepts any casing a user copied in.
				const list = (adapter as unknown as {
					list?: (path: string) => Promise<{ files: string[] }>;
				}).list;
				if (typeof list === 'function') {
					try {
						const listing = await list.call(adapter, this.pluginDataDir);
						const canonical = CANONICAL_DATABASE_FILES[translation].toLowerCase();
						const match = listing.files.find(
							(path) => path.split(/[\\/]/).pop()?.toLowerCase() === canonical,
						);
						if (match) filePath = match;
					} catch {
						// Folder may not exist yet.
					}
				}
			}
			if (!filePath) return null;
		} else {
			// Older/minimal adapters without exists(): try the canonical name.
			filePath = `${this.pluginDataDir}${CANONICAL_DATABASE_FILES[translation]}`;
		}

		try {
			const fileData = await adapter.readBinary(filePath);
			return new Uint8Array(fileData);
		} catch (error) {
			if (isMissingFileError(error)) return null;
			throw error;
		}
	}

	/**
	 * Internal database loading logic
	 */
	private async loadDbInternal(translation: 'KJV' | 'RST'): Promise<DatabaseInstance | null> {
		// A preceding installation may have published while this load was queued.
		const cached = this.databases.get(translation);
		if (cached?.isLoaded) {
			this.setStatus(translation, { state: 'ready' });
			return cached;
		}

		let sqlJs: initSqlJs.SqlJsStatic;
		try {
			sqlJs = await this.getSqlJs();
		} catch (error) {
			this.markFailure(translation, error);
			throw error;
		}

		try {
			debug(`[DB] Loading ${translation} database from cache`);
			const data = await this.readCachedDatabase(translation);
			if (!data) {
				debug(`${translation} database not found in cache`);
				this.setStatus(translation, { state: 'not-configured' });
				return null;
			}
			debug(`[DB] Loaded ${translation} database file: ${data.byteLength} bytes`);

			this.assertActive();
			const instance = this.createValidatedInstance(sqlJs, translation, data);
			debug(`[DB] Successfully created and validated ${translation} database instance`);

			if (this.disposed) {
				instance.db.close();
				throw new Error('Database engine has been disposed');
			}
			this.databases.set(translation, instance);
			this.setStatus(translation, { state: 'ready' });

			debug(`Loaded ${translation} database from cache`);
			return instance;
		} catch (error) {
			if (this.disposed) throw error;
			debug(`${translation} database could not be loaded:`, String(error));
			this.markFailure(translation, error);
			return null;
		}
	}

	/**
	 * Download and cache database from URL
	 */
	async fetchDb(translation: 'KJV' | 'RST', url: string): Promise<DatabaseInstance> {
		this.assertActive();
		this.setStatus(translation, { state: 'loading' });
		return this.serialize(translation, async () => {
			try {
				return await this.fetchDbInternal(translation, url);
			} catch (error) {
				this.markFailure(translation, error);
				throw error;
			}
		});
	}

	private async fetchDbInternal(translation: Translation, url: string): Promise<DatabaseInstance> {
		debug(`[DB] Starting download for ${translation} from URL:`, url);

		const sqlJs = await this.getSqlJs();

		try {
			new Notice(`Downloading ${translation} database...`);
			debug(`[DB] Fetching ${translation} database from URL...`);

			const response = await requestUrl({
				url,
				method: 'GET',
			});

			debug(`[DB] Received response, arrayBuffer size:`, response.arrayBuffer?.byteLength);

			if (!response.arrayBuffer) {
				throw new Error('No data received from server');
			}

			const arrayBuffer = response.arrayBuffer;
			debug(`[DB] Downloaded ${translation} database: ${arrayBuffer.byteLength} bytes`);

			// Validation and replacement are shared with local imports.
			const instance = await this.installDatabase(translation, sqlJs, arrayBuffer);

			new Notice(`${translation} database downloaded and cached successfully`);
			debug(`[DB] Successfully downloaded and cached ${translation} database`);

			return instance;
		} catch (error) {
			console.error(`[DB] Failed to download ${translation} database:`, error);
			console.error(`[DB] Error details:`, {
				message: String(error),
				stack: error instanceof Error ? error.stack : undefined,
			});
			throw new Error(`Failed to download ${translation} database: ${errorMessage(error)}`);
		}
	}

	/**
	 * Install a user-selected local SQLite file. Any filename/casing is
	 * accepted - the contents are validated and saved under the canonical
	 * plugin filename.
	 */
	async importDb(
		translation: Translation,
		data: ArrayBuffer | Uint8Array,
	): Promise<DatabaseInstance> {
		this.assertActive();
		this.setStatus(translation, { state: 'loading' });
		return this.serialize(translation, async () => {
			try {
				const arrayBuffer = data instanceof Uint8Array
					? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
					: data;
				const sqlJs = await this.getSqlJs();
				return await this.installDatabase(translation, sqlJs, arrayBuffer);
			} catch (error) {
				this.markFailure(translation, error);
				throw error;
			}
		});
	}

	/** Alias for importDb(), matching the plugin-facing API name. */
	importDatabase(
		translation: Translation,
		data: ArrayBuffer | Uint8Array,
	): Promise<DatabaseInstance> {
		return this.importDb(translation, data);
	}

	/** Keep all setup controls busy from file selection through installation. */
	async importLocalFile(translation: Translation, pickFile: () => Promise<File | null>): Promise<boolean> {
		this.assertActive();
		if (this.getStatus(translation).state === 'loading') return false;
		const previousStatus = this.getStatus(translation);
		this.setStatus(translation, { state: 'loading' });
		return this.serialize(translation, async () => {
			try {
				const file = await pickFile();
				this.assertActive();
				if (!file) {
					this.setStatus(translation, previousStatus);
					return false;
				}
				const data = await file.arrayBuffer();
				await this.installDatabase(translation, await this.getSqlJs(), data);
				return true;
			} catch (error) {
				this.markFailure(translation, error);
				throw error;
			}
		});
	}

	/** Recover an interrupted replacement before loading or installing again. */
	private async recoverBackup(translation: Translation): Promise<void> {
		const adapter = this.vault.adapter;
		const path = `${this.pluginDataDir}${CANONICAL_DATABASE_FILES[translation]}`;
		if (typeof adapter.exists === 'function' && typeof adapter.rename === 'function'
			&& !await adapter.exists(path) && await adapter.exists(`${path}.bak`)) {
			await adapter.rename(`${path}.bak`, path);
		}
	}

	/**
	 * Validate, persist, and publish a database. Validation happens before the
	 * previous file or active instance is touched; persistence uses a temporary
	 * file plus a backup rename so a failed write can be rolled back.
	 */
	private async installDatabase(
		translation: Translation,
		sqlJs: initSqlJs.SqlJsStatic,
		data: ArrayBuffer,
	): Promise<DatabaseInstance> {
		let temporary: DatabaseInstance | undefined;
		try {
			this.assertActive();
			temporary = this.createValidatedInstance(sqlJs, translation, new Uint8Array(data));
			await this.persistDatabaseFile(translation, data);
			this.assertActive();

			const old = this.databases.get(translation);
			this.databases.set(translation, temporary);
			temporary = undefined;
			if (old) {
				disposeSearchCorpus(old);
				old.isLoaded = false;
				old.db.close();
			}
			this.setStatus(translation, { state: 'ready' });
			return this.databases.get(translation)!;
		} finally {
			if (temporary) {
				disposeSearchCorpus(temporary);
				temporary.isLoaded = false;
				temporary.db.close();
			}
		}
	}

	/** Write `data` to the canonical path, preserving the previous file on failure. */
	private async persistDatabaseFile(translation: Translation, data: ArrayBuffer): Promise<void> {
		const adapter = this.vault.adapter;
		const filePath = `${this.pluginDataDir}${CANONICAL_DATABASE_FILES[translation]}`;
		const temporaryPath = `${filePath}.tmp`;
		const backupPath = `${filePath}.bak`;

		debug(`[DB] Creating plugin directory: ${this.pluginDataDir}`);
		await adapter.mkdir(this.pluginDataDir);
		await this.recoverBackup(translation);

		const rename = (adapter as unknown as {
			rename?: (oldPath: string, newPath: string) => Promise<void>;
		}).rename;

		if (typeof rename !== 'function') {
			// Minimal adapters (mostly tests) may not expose rename. Fall back
			// to a direct write, keeping the old bytes for rollback when the
			// adapter can tell us whether a file exists.
			let previous: ArrayBuffer | undefined;
			const exists = (adapter as unknown as { exists?: (path: string) => Promise<boolean> }).exists;
			if (typeof exists === 'function' && await exists.call(adapter, filePath)) {
				previous = await adapter.readBinary(filePath);
			}
			try {
				this.assertActive();
				await adapter.writeBinary(filePath, data);
			} catch (error) {
				if (previous) {
					await adapter.writeBinary(filePath, previous).catch(() => undefined);
				}
				throw error;
			}
			return;
		}

		const exists = (adapter as unknown as { exists?: (path: string) => Promise<boolean> }).exists;
		const hadPrevious = typeof exists === 'function'
			? await exists.call(adapter, filePath)
			: false;

		await this.safeRemove(temporaryPath);
		try {
			debug(`[DB] Writing temporary ${translation} database to: ${temporaryPath}`);
			await adapter.writeBinary(temporaryPath, data);
			this.assertActive();

			let movedAside = false;
			try {
				if (hadPrevious) {
					await this.safeRemove(backupPath);
					await rename.call(adapter, filePath, backupPath);
					movedAside = true;
				}
				await rename.call(adapter, temporaryPath, filePath);
			} catch (error) {
				if (movedAside) {
					try {
						await rename.call(adapter, backupPath, filePath);
					} catch (restoreError) {
						throw new Error(`${errorMessage(error)}. Restore failed: ${errorMessage(restoreError)}. Previous database preserved at ${backupPath}; retry loading to recover it.`);
					}
				}
				throw error;
			}

			if (movedAside) await this.safeRemove(backupPath);
		} finally {
			await this.safeRemove(temporaryPath);
		}
	}

	private async safeRemove(path: string): Promise<void> {
		const adapter = this.vault.adapter;
		const remove = (adapter as unknown as { remove?: (path: string) => Promise<void> }).remove;
		if (typeof remove !== 'function') return;
		try {
			await remove.call(adapter, path);
		} catch {
			// Missing files are fine; cleanup failures are non-fatal.
		}
	}

	/**
	 * Get cached database instance
	 */
	getDb(translation: 'KJV' | 'RST'): DatabaseInstance | undefined {
		if (this.disposed) return undefined;
		return this.databases.get(translation);
	}

	/**
	 * Ensure database is loaded, waiting if necessary
	 * Use this before performing searches to guarantee the DB is ready
	 *
	 * @param translation - 'KJV' or 'RST'
	 * @param timeoutMs - Maximum time to wait (default 30 seconds)
	 * @returns DatabaseInstance if loaded successfully, null if not available
	 * @throws Error if timeout exceeded
	 */
	async ensureDb(translation: 'KJV' | 'RST', timeoutMs = 30000): Promise<DatabaseInstance | null> {
		this.assertActive();
		// If already loaded, return immediately
		const cached = this.databases.get(translation);
		if (cached?.isLoaded) {
			return cached;
		}

		// Get existing loading promise or trigger loading on demand
		const loadPromise = this.loadDb(translation);
		let timer: number;
		try {
			return await Promise.race([
				loadPromise,
				new Promise<null>((_, reject) => {
					timer = window.setTimeout(() => reject(new Error(`Database load timeout: ${translation}`)), timeoutMs);
				}),
			]);
		} finally {
			window.clearTimeout(timer!);
		}
	}
}

// Singleton instance
let engineInstance: DatabaseEngine | null = null;

export function getEngineInstance(vault: Vault): DatabaseEngine {
	if (!engineInstance) {
		engineInstance = new DatabaseEngine(vault);
	}
	return engineInstance;
}
