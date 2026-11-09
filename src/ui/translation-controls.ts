import type { TranslationSelection } from '../types';

export type TranslationControls = {
	/** Reflect a selection made outside the control (restore/back navigation). */
	setSelection(selection: TranslationSelection): void;
	/** Reflect a parallel-display change made outside the control. */
	setShowParallel(show: boolean): void;
};

export interface TranslationControlsOptions {
	selection: TranslationSelection;
	showParallel: boolean;
	onSelectionChange(selection: TranslationSelection): void;
	onParallelChange(show: boolean): void;
}

const TRANSLATION_OPTIONS: TranslationSelection[] = ['Auto', 'KJV', 'RST'];
let groupCounter = 0;

/**
 * Translation source and parallel-display controls shown inside the search
 * modal. Uses real radio/checkbox inputs so the controls are keyboard
 * reachable and announced with their labels; the labels are styled as a
 * segmented control. Values are session overrides owned by the plugin, not
 * saved settings.
 */
export function createTranslationControls(
	container: HTMLElement,
	options: TranslationControlsOptions
): TranslationControls {
	const controls = container.createDiv({ cls: 'bible-search-controls' });

	const group = controls.createEl('fieldset', { cls: 'bible-search-translation-group' });
	group.createEl('legend', {
		cls: 'bible-search-controls-legend',
		text: 'Translation',
	});

	const name = `bible-search-translation-${++groupCounter}`;
	const inputs = new Map<TranslationSelection, HTMLInputElement>();
	const labels = new Map<TranslationSelection, HTMLLabelElement>();

	for (const selection of TRANSLATION_OPTIONS) {
		const label = group.createEl('label', { cls: 'bible-search-translation-option' });
		const input = label.createEl('input', {
			cls: 'bible-search-translation-input',
			attr: { type: 'radio', name, value: selection },
		});
		input.checked = selection === options.selection;
		input.addEventListener('change', () => {
			if (!input.checked) return;
			syncSelection(selection);
			options.onSelectionChange(selection);
		});
		label.createSpan({
			cls: 'bible-search-controls-text',
			text: selection,
		});
		inputs.set(selection, input);
		labels.set(selection, label);
	}

	const syncSelection = (selection: TranslationSelection): void => {
		for (const [value, label] of labels) {
			label.classList.toggle('is-selected', value === selection);
		}
	};
	syncSelection(options.selection);

	const parallelLabel = controls.createEl('label', {
		cls: 'bible-search-parallel-option',
	});
	const parallelInput = parallelLabel.createEl('input', {
		cls: 'bible-search-parallel-input',
		attr: { type: 'checkbox' },
	});
	parallelInput.checked = options.showParallel;
	parallelInput.addEventListener('change', () => {
		options.onParallelChange(parallelInput.checked);
	});
	parallelLabel.createSpan({
		cls: 'bible-search-controls-text',
		text: 'Parallel translation',
	});

	return {
		setSelection(selection: TranslationSelection): void {
			const input = inputs.get(selection);
			if (input) input.checked = true;
			syncSelection(selection);
		},
		setShowParallel(show: boolean): void {
			parallelInput.checked = show;
		},
	};
}
