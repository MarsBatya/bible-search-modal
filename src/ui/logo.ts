/**
 * Renders the plugin's logo (open book, cross on the left page, magnifying
 * glass over the right) into `container` as an inline SVG.
 *
 * Built with the DOM API (createSvg) rather than assigning innerHTML - same
 * reasoning as results-view.ts: keeps everything going through Obsidian's
 * own element helpers instead of raw markup injection.
 *
 * Uses `currentColor` for its stroke so it inherits color from CSS (see
 * `.bible-search-logo` in styles.css), matching the current theme/accent
 * instead of being hardcoded.
 */
export function renderLogo(container: HTMLElement, size: number): SVGSVGElement {
	return container.createSvg(
		'svg',
		{
			cls: 'bible-search-logo',
			attr: {
				viewBox: '-1 -2 27 27',
				width: size,
				height: size,
				'aria-hidden': 'true',
			},
		},
		(svg) => {
			svg.createSvg('defs', {}, (defs) => {
				defs.createSvg(
					'mask',
					{
						attr: {
							id: 'bible-search-logo-lens-cutout',
							maskUnits: 'userSpaceOnUse',
							x: '-1',
							y: '-2',
							width: '27',
							height: '27',
						},
					},
					(mask) => {
						mask.createSvg('rect', {
							attr: { x: '-1', y: '-2', width: '27', height: '27', fill: 'white' },
						});
						mask.createSvg('circle', { attr: { cx: '18.6', cy: '7.1', r: '5.6', fill: 'black' } });
					},
				);
			});

			svg.createSvg(
				'g',
				{
					attr: {
						fill: 'none',
						stroke: 'currentColor',
						'stroke-width': '1.6',
						'stroke-linecap': 'round',
						'stroke-linejoin': 'round',
					},
				},
				(g) => {
					// Open book, with a hole masked out where the lens sits
					g.createSvg('g', { attr: { mask: 'url(#bible-search-logo-lens-cutout)' } }, (book) => {
						book.createSvg('path', { attr: { d: 'M12 7v14' } });
						book.createSvg('path', {
							attr: {
								d: 'M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z',
							},
						});
						// Cross embedded on the left-hand page
						book.createSvg('path', { attr: { d: 'M7 6.5v9' } });
						book.createSvg('path', { attr: { d: 'M4.3 9.5h5.4' } });
					});

					// Magnifying glass overlapping the top-right corner
					g.createSvg('g', { attr: { transform: 'translate(12,0.5) scale(0.6)' } }, (lens) => {
						lens.createSvg('circle', { attr: { cx: '11', cy: '11', r: '8' } });
						lens.createSvg('path', { attr: { d: 'm21 21-4.3-4.3' } });
					});
				},
			);
		},
	);
}
