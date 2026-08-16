import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import { globalIgnores, defineConfig } from 'eslint/config';

export default defineConfig(
	globalIgnores([
		'node_modules',
		'dist',
		'esbuild.config.mjs',
		'version-bump.mjs',
		'versions.json',
		'main.js',
		'package.json',
		'package-lock.json',
		'tsconfig.json',
	]),
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: ['eslint.config.mts', 'manifest.json'],
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.json'],
			},
		},
	},
	...obsidianmd.configs.recommended,
	{
		// tests/ and vitest.config.ts run under Node/Vitest, not inside
		// Obsidian - the obsidianmd rules above encode constraints of the
		// actual plugin runtime (no console.log, no Node built-ins,
		// sentence-case UI text, settings-tab patterns) that don't apply to
		// test code. Type-safety rules are also relaxed here: test helpers
		// (particularly test-utils.ts's assertion helpers) legitimately
		// take loosely-typed input to validate arbitrary shapes.
		files: ['tests/**/*.ts', 'vitest.config.ts'],
		languageOptions: {
			globals: {
				...globals.node,
			},
		},
		rules: {
			'no-console': 'off',
			'obsidianmd/rule-custom-message': 'off',
			'obsidianmd/ui/sentence-case': 'off',
			'obsidianmd/no-nodejs-modules': 'off',
			'obsidianmd/prefer-create-el': 'off',
			'obsidianmd/settings-tab/prefer-setting-definitions': 'off',
			'@typescript-eslint/no-explicit-any': 'off',
			'@typescript-eslint/no-unsafe-member-access': 'off',
			'@typescript-eslint/no-unsafe-call': 'off',
			'@typescript-eslint/no-unsafe-assignment': 'off',
			'@typescript-eslint/no-unsafe-argument': 'off',
			'@typescript-eslint/no-unsafe-return': 'off',
			'@typescript-eslint/restrict-template-expressions': 'off',
		},
	},
);
