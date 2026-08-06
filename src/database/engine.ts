import { requestUrl, Notice, Vault } from 'obsidian';
import initSqlJs from 'sql.js';
import { DatabaseInstance } from '../types';
import { getWasmBinary } from './wasm-loader';

/**
 * Database Engine for managing sql.js SQLite instances
 */
export class DatabaseEngine {
	private sqlJs: any = null;
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
			console.log('[SQL.JS] Already initialized, skipping');
			return;
		}

		console.log('[SQL.JS] Starting initialization...');

		try {
			// Get the embedded WASM binary
			console.log('[SQL.JS] Loading embedded WASM binary...');
			let wasmBinary: ArrayBuffer | undefined;

			try {
				wasmBinary = await getWasmBinary();
				console.log('[SQL.JS] Successfully obtained WASM binary from embedded data');
			} catch (e) {
				console.error('[SQL.JS] Failed to load embedded WASM:', e);
				throw e;
			}

			const initOptions: any = {
				wasmBinary,
			};

			console.log('[SQL.JS] Calling initSqlJs with wasmBinary option');
			this.sqlJs = await initSqlJs(initOptions);
			console.log('[SQL.JS] Successfully initialized sql.js');
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
		if (!this.sqlJs) {
			await this.initSqlJs();
		}

		const fileName = translation === 'KJV' ? 'KJV+.sqlite3' : 'RST+.sqlite3';
		const filePath = `${this.pluginDataDir}${fileName}`;

		try {
			console.log(`[DB] Loading ${translation} database from cache: ${filePath}`);

			// Load as binary data
			const fileData = await this.vault.adapter.readBinary(filePath);

			// Create Uint8Array from ArrayBuffer
			const data = new Uint8Array(fileData as ArrayBuffer);
			console.log(`[DB] Loaded ${translation} database file: ${data.byteLength} bytes`);

			const db = new this.sqlJs.Database(data);
			console.log(`[DB] Successfully created ${translation} database instance`);

			const instance: DatabaseInstance = {
				db,
				translation,
				isLoaded: true,
			};

			this.databases.set(translation, instance);

			console.log(`Loaded ${translation} database from cache`);
			return instance;
		} catch (error) {
			console.log(`${translation} database not found in cache:`, String(error));
			return null;
		}
	}

	/**
	 * Download and cache database from URL
	 */
	async fetchDb(translation: 'KJV' | 'RST', url: string): Promise<DatabaseInstance> {
		console.log(`[DB] Starting download for ${translation} from URL:`, url);

		if (!this.sqlJs) {
			console.log(`[DB] SQL.JS not initialized, initializing...`);
			await this.initSqlJs();
		}

		try {
			new Notice(`Downloading ${translation} database...`);
			console.log(`[DB] Fetching ${translation} database from URL...`);

			const response = await requestUrl({
				url,
				method: 'GET',
			});

			console.log(`[DB] Received response, arrayBuffer size:`, response.arrayBuffer?.byteLength);

			if (!response.arrayBuffer) {
				throw new Error('No data received from server');
			}

			const arrayBuffer = response.arrayBuffer;
			console.log(`[DB] Downloaded ${translation} database: ${arrayBuffer.byteLength} bytes`);

			// Save to vault
			const fileName = translation === 'KJV' ? 'KJV+.sqlite3' : 'RST+.sqlite3';
			const filePath = `${this.pluginDataDir}${fileName}`;

			// Ensure directory exists
			console.log(`[DB] Creating plugin directory: ${this.pluginDataDir}`);
			await this.vault.adapter.mkdir(this.pluginDataDir);

			// Save the binary data
			console.log(`[DB] Saving ${translation} database to: ${filePath}`);
			await this.vault.adapter.writeBinary(filePath, arrayBuffer);

			// Initialize database
			console.log(`[DB] Initializing ${translation} database with SQL.JS`);
			const db = new this.sqlJs.Database(new Uint8Array(arrayBuffer));
			console.log(`[DB] Successfully created ${translation} database instance`);

			const instance: DatabaseInstance = {
				db,
				translation,
				isLoaded: true,
			};

			this.databases.set(translation, instance);

			new Notice(`${translation} database downloaded and cached successfully`);
			console.log(`[DB] Successfully downloaded and cached ${translation} database`);

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
	 * Check if database is loaded
	 */
	isDbLoaded(translation: 'KJV' | 'RST'): boolean {
		const db = this.databases.get(translation);
		return db?.isLoaded ?? false;
	}

	/**
	 * Get both databases
	 */
	getDatabases(): DatabaseInstance[] {
		return Array.from(this.databases.values());
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
			return Promise.race([
				loadPromise,
				new Promise<null>((_, reject) =>
					setTimeout(() => reject(new Error(`Database load timeout: ${translation}`)), timeoutMs)
				),
			]);
		}

		// Not cached and not loading, return null
		return null;
	}

	/**
	 * Clear all cached databases
	 */
	async clearCache(): Promise<void> {
		try {
			await this.vault.adapter.rmdir(this.pluginDataDir, true);
			this.databases.clear();
			console.log('Cleared database cache');
		} catch (error) {
			console.error('Failed to clear cache:', error);
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
