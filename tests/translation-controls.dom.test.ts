// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTranslationControls } from '../src/ui/translation-controls';
import { installObsidianDomHelpers } from './dom';

describe('translation controls', () => {
	beforeAll(() => installObsidianDomHelpers());

	beforeEach(() => {
		document.body.textContent = '';
	});

	it('renders real radio/checkbox controls with accessible labels', () => {
		const root = document.createElement('div');
		createTranslationControls(root, {
			selection: 'KJV',
			showParallel: true,
			onSelectionChange: vi.fn(),
			onParallelChange: vi.fn(),
		});

		expect(root.querySelectorAll('fieldset legend')[0]?.textContent).toBe('Translation');
		const radios = Array.from(root.querySelectorAll<HTMLInputElement>('input[type="radio"]'));
		expect(radios.map((input) => input.value)).toEqual(['Auto', 'KJV', 'RST']);
		expect(radios.find((input) => input.checked)?.value).toBe('KJV');
		expect(root.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(true);
		expect(root.textContent).toContain('Parallel translation');
	});

	it('reports changes and reflects external state updates', () => {
		const onSelectionChange = vi.fn();
		const onParallelChange = vi.fn();
		const root = document.createElement('div');
		const controls = createTranslationControls(root, {
			selection: 'Auto',
			showParallel: false,
			onSelectionChange,
			onParallelChange,
		});

		const rst = Array.from(
			root.querySelectorAll<HTMLInputElement>('input[type="radio"]')
		).find((input) => input.value === 'RST')!;
		rst.checked = true;
		rst.dispatchEvent(new Event('change'));
		expect(onSelectionChange).toHaveBeenCalledWith('RST');

		const parallel = root.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
		parallel.checked = true;
		parallel.dispatchEvent(new Event('change'));
		expect(onParallelChange).toHaveBeenCalledWith(true);

		controls.setSelection('KJV');
		expect(
			Array.from(root.querySelectorAll<HTMLInputElement>('input[type="radio"]'))
				.find((input) => input.checked)?.value
		).toBe('KJV');
		controls.setShowParallel(true);
		expect(root.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(true);
	});
});
