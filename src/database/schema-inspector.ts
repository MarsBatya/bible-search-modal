import { DatabaseInstance } from '../types';

/**
 * Inspect database schema to diagnose column mismatches
 */
export function inspectDatabaseSchema(dbInstance: DatabaseInstance): void {
	console.log(`[SCHEMA] Inspecting ${dbInstance.translation} database...`);

	try {
		// Get all tables
		const tablesStmt = dbInstance.db.prepare(
			"SELECT name FROM sqlite_master WHERE type='table'"
		);

		const tables: string[] = [];
		while (tablesStmt.step()) {
			const row = tablesStmt.getAsObject() as any;
			tables.push(row.name);
		}
		tablesStmt.free();

		console.log(`[SCHEMA] Tables found:`, tables);

		// Inspect each table
		for (const table of tables) {
			try {
				const infoStmt = dbInstance.db.prepare(`PRAGMA table_info(${table})`);
				const columns: any[] = [];

				while (infoStmt.step()) {
					const row = infoStmt.getAsObject() as any;
					columns.push({
						name: row.name,
						type: row.type,
					});
				}
				infoStmt.free();

				console.log(`[SCHEMA] Table "${table}" columns:`, columns);

				// Get row count
				const countStmt = dbInstance.db.prepare(`SELECT COUNT(*) as count FROM ${table}`);
				if (countStmt.step()) {
					const row = countStmt.getAsObject() as any;
					console.log(`[SCHEMA] Table "${table}" row count:`, row.count);
				}
				countStmt.free();

				// Sample first row
				try {
					const sampleStmt = dbInstance.db.prepare(`SELECT * FROM ${table} LIMIT 1`);
					if (sampleStmt.step()) {
						const row = sampleStmt.getAsObject() as any;
						console.log(`[SCHEMA] Table "${table}" sample row:`, row);
					}
					sampleStmt.free();
				} catch (e) {
					console.log(`[SCHEMA] Could not get sample row from "${table}":`, String(e));
				}
			} catch (error) {
				console.error(`[SCHEMA] Error inspecting table "${table}":`, error);
			}
		}
	} catch (error) {
		console.error('[SCHEMA] Failed to inspect database:', error);
	}
}
