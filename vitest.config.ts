import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { dirname, resolve } from 'node:path';

const configDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	resolve: {
		alias: {
			obsidian: resolve(configDir, 'tests/obsidian.ts'),
		},
	},
	test: {
		globals: true,
		environment: 'node',
		include: ['tests/**/*.test.ts'],
		exclude: ['node_modules', 'dist'],
		testTimeout: 30000,
		hookTimeout: 30000,
	},
});
