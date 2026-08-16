// @ts-ignore - This import will be replaced by esbuild with a data URL
import WASM_DATA_URL from 'sql.js/dist/sql-wasm.wasm';
import { debug } from '../utils/logger';

let cachedWasmBinary: ArrayBuffer | null = null;

/**
 * Load WASM binary from embedded data URL
 */
export async function getWasmBinary(): Promise<ArrayBuffer> {
	if (cachedWasmBinary) {
		return cachedWasmBinary;
	}

	debug('Loading WASM from embedded data URL');
	debug('Data URL length:', WASM_DATA_URL.length);

	try {
		const response = await fetch(WASM_DATA_URL);
		cachedWasmBinary = await response.arrayBuffer();
		debug('Successfully loaded WASM binary, size:', cachedWasmBinary.byteLength);
		return cachedWasmBinary;
	} catch (error) {
		console.error('Failed to load WASM from data URL:', error);
		throw new Error('Failed to load WASM binary: ' + String(error));
	}
}
