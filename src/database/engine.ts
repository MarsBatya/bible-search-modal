import { requestUrl, Notice, Vault } from 'obsidian';
import initSqlJs from 'sql.js';
import { DatabaseInstance } from '../types';
import { getWasmBinary } from './wasm-loader';
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
	private isInitializing = false;
	private initPromise: Promise<void> | null = null;

	constructor(vault: Vault) {
		this.vault = vault;
		this.pluginDataDir = '.obsidian/plugins/bible-search-modal/';
	}

	/**
	 * Initialize sql.js library
	 */
	async initSqlJs(): Promise<void> {
		if (this.sqlJs) {
			debug('[SQL.JS] Already initialized, skipping');
			return;
		}

		debug('[SQL.JS] Starting initialization...');

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
			console.error('[SQL.JS] Failed to initialize sql.js:', error);
			console.error('[SQL.JS] Error details:', {
				message: String(error),
				stack: error instanceof Error ? error.stack : undefined,
			});
			throw new Error('Failed to initialize database engine: ' + String(error));
		}
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
		// Return cached promise if already loading
		const existing = this.loadingPromises.get(translation);
		if (existing) {
			return existing;
		}

		// Create loading promise and cache it
		const loadPromise = this.loadDbInternal(translation);
		this.loadingPromises.set(translation, loadPromise);

		// Clean up promise cache when done
		loadPromise.finally(() => {
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
			const data = new Uint8Array(fileData as ArrayBuffer);
			debug(`[DB] Loaded ${translation} database file: ${data.byteLength} bytes`);

			const db = new sqlJs.Database(data);
			debug(`[DB] Successfully created ${translation} database instance`);

			const instance: DatabaseInstance = {
				db,
				translation,
				isLoaded: true,
			};

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

			// Save to vault
			const fileName = translation === 'KJV' ? 'KJV+.sqlite3' : 'RST+.sqlite3';
			const filePath = `${this.pluginDataDir}${fileName}`;

			// Ensure directory exists
			debug(`[DB] Creating plugin directory: ${this.pluginDataDir}`);
			await this.vault.adapter.mkdir(this.pluginDataDir);

			// Save the binary data
			debug(`[DB] Saving ${translation} database to: ${filePath}`);
			await this.vault.adapter.writeBinary(filePath, arrayBuffer);

			// Initialize database
			debug(`[DB] Initializing ${translation} database with SQL.JS`);
			const db = new sqlJs.Database(new Uint8Array(arrayBuffer));
			debug(`[DB] Successfully created ${translation} database instance`);

			const instance: DatabaseInstance = {
				db,
				translation,
				isLoaded: true,
			};

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

		// Get loading promise
		const loadPromise = this.loadingPromises.get(translation);
		if (loadPromise) {
			// Wait for the loading promise with timeout
			let timer: ReturnType<typeof setTimeout>;
			try {
				return await Promise.race([
					loadPromise,
					new Promise<null>((_, reject) => {
						timer = setTimeout(() => reject(new Error(`Database load timeout: ${translation}`)), timeoutMs);
					}),
				]);
			} finally {
				clearTimeout(timer!);
			}
		}

		// Not cached and not loading, return null
		return null;
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
