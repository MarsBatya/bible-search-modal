import { requestUrl, Notice, Vault } from 'obsidian';
import initSqlJs from 'sql.js';
import { DatabaseInstance } from '../types';
import { getWasmBinary } from './wasm-loader';
import { getRussianNumbering } from './queries';
import { debug } from '../utils/logger';

/**
 * Database Engine for managing sql.js SQLite instances
 */
export class DatabaseEngine {
	private sqlJs: initSqlJs.SqlJsStatic | null = null;
	private databases: Map<'KJV' | 'RST', DatabaseInstance> = new Map();
	private vault: Vault;
	private pluginDataDir: string;

	// Track loading state
	private loadingPromises: Map<'KJV' | 'RST', Promise<DatabaseInstance | null>> = new Map();
	private initPromise: Promise<void> | null = null;

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

	/**
	 * Initialize sql.js library
	 */
	async initSqlJs(): Promise<void> {
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
				this.sqlJs = await initSqlJs(initOptions);
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
		return this.sqlJs!;
	}

	/**
	 * Load database from cached file in vault
	 * Returns a promise that can be tracked for loading status
	 */
	loadDb(translation: 'KJV' | 'RST'): Promise<DatabaseInstance | null> {
		// Return cached instance if already loaded
		const cached = this.databases.get(translation);
		if (cached?.isLoaded) {
			return Promise.resolve(cached);
		}

		// Return cached promise if already loading
		const existing = this.loadingPromises.get(translation);
		if (existing) {
			return existing;
		}

		// Create loading promise and cache it
		const loadPromise = this.loadDbInternal(translation);
		this.loadingPromises.set(translation, loadPromise);

		// Clean up promise cache when done (fire-and-forget - loadPromise
		// itself is returned below and awaited by callers)
		void loadPromise.finally(() => {
			this.loadingPromises.delete(translation);
		});

		return loadPromise;
	}

	/**
	 * Internal database loading logic
	 */
	private async loadDbInternal(translation: 'KJV' | 'RST'): Promise<DatabaseInstance | null> {
		const sqlJs = await this.getSqlJs();

		const fileName = translation === 'KJV' ? 'KJV+.sqlite3' : 'RST+.sqlite3';
		const filePath = `${this.pluginDataDir}${fileName}`;

		try {
			debug(`[DB] Loading ${translation} database from cache: ${filePath}`);

			// Load as binary data
			const fileData = await this.vault.adapter.readBinary(filePath);

			// Create Uint8Array from ArrayBuffer
			const data = new Uint8Array(fileData);
			debug(`[DB] Loaded ${translation} database file: ${data.byteLength} bytes`);

			const instance = this.createValidatedInstance(sqlJs, translation, data);
			debug(`[DB] Successfully created and validated ${translation} database instance`);

			this.databases.set(translation, instance);

			debug(`Loaded ${translation} database from cache`);
			return instance;
		} catch (error) {
			debug(`${translation} database not found in cache:`, String(error));
			return null;
		}
	}

	/**
	 * Download and cache database from URL
	 */
	async fetchDb(translation: 'KJV' | 'RST', url: string): Promise<DatabaseInstance> {
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

			// Validate the downloaded database before changing either the cache
			// file or the currently active in-memory database.
			debug(`[DB] Validating downloaded ${translation} database`);
			const instance = this.createValidatedInstance(sqlJs, translation, new Uint8Array(arrayBuffer));

			// Save to vault only after validation succeeds.
			const fileName = translation === 'KJV' ? 'KJV+.sqlite3' : 'RST+.sqlite3';
			const filePath = `${this.pluginDataDir}${fileName}`;

			// Ensure directory exists
			debug(`[DB] Creating plugin directory: ${this.pluginDataDir}`);
			await this.vault.adapter.mkdir(this.pluginDataDir);

			// Save the binary data
			debug(`[DB] Saving ${translation} database to: ${filePath}`);
			try {
				await this.vault.adapter.writeBinary(filePath, arrayBuffer);
			} catch (error) {
				instance.db.close();
				throw error;
			}

			this.databases.set(translation, instance);

			new Notice(`${translation} database downloaded and cached successfully`);
			debug(`[DB] Successfully downloaded and cached ${translation} database`);

			return instance;
		} catch (error) {
			console.error(`[DB] Failed to download ${translation} database:`, error);
			console.error(`[DB] Error details:`, {
				message: String(error),
				stack: error instanceof Error ? error.stack : undefined,
			});
			throw new Error(`Failed to download ${translation} database: ${String(error)}`);
		}
	}

	/**
	 * Get cached database instance
	 */
	getDb(translation: 'KJV' | 'RST'): DatabaseInstance | undefined {
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
