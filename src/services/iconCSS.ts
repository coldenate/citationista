import type { RNPlugin } from '@remnote/plugin-sdk';
import { iconTagMap } from '../constants/iconTagMap';
import { LogType, logMessage } from '../utils/logging';

/**
 * iconTagMap moved to `constants/iconTagMap.ts`.
 * It maps RemNote tag identifiers → icon basenames.
 */

/*───────────────────────────────────────────────────────────────────────────*/
/* Utility helpers                                                          */
/*───────────────────────────────────────────────────────────────────────────*/

/** Build a CSS block. */
function rule(sel: string, decl: Record<string, string>): string {
	const body = Object.entries(decl)
		.map(([p, v]) => `  ${p}: ${v};`)
		.join('\n');
	return `${sel} {\n${body}\n}\n`;
}

/** Shortcut: selectors that should apply in *both* expanded & collapsed. */
function both(tag: string, inner: string): string {
	return `[data-rem-tags~="${tag}"] ${inner}, .rem-container--collapsed[data-rem-tags~="${tag}"] ${inner}`;
}

/*───────────────────────────────────────────────────────────────────────────*/
/* Per‑tag CSS generator                                                    */
/*───────────────────────────────────────────────────────────────────────────*/
function iconCSS(tag: string, base: string, url: string): string {
	const dark = `${url}/${base}-dark.svg`;
	const light = `${url}/${base}-light.svg`;

	// Elements we touch ------------------------------------------------------
	const coreRing = `${both(tag, '.rem-bullet__core')}, ${both(tag, '.rem-bullet__ring')}`;
	const inner = both(tag, '.perfect-circle__inner');
	const bullet = both(tag, '.rn-rem-bullet');

	let css = '';

	/* 1️⃣  Hide default ring / core so only our icon shows */
	css += rule(coreRing, { display: 'none' });

	/* 2️⃣  Keep bullet size consistent (override only the scale) */
	css += rule(bullet, {
		'--perfect-circle-scale': '10', // force scale(1)
	});

	/* 3️⃣  Dark‑theme icon */
	const bgDecl = {
		'background-image': `url("${dark}")`,
		'background-repeat': 'no-repeat',
		'background-position': 'center',
		'background-size': 'contain',
	} as const;
	css += rule(inner, bgDecl);

	/* 4️⃣  Light‑theme override */
	css += `@media (prefers-color-scheme: light) {\n`;
	css += rule(inner, {
		...bgDecl,
		'background-image': `url("${light}")`,
	});
	css += `}\n`;

	return css;
}

/*───────────────────────────────────────────────────────────────────────────*/
/* Build complete stylesheet                                               */
/*───────────────────────────────────────────────────────────────────────────*/
function buildCSS(): string {
	const base =
		'https://raw.githubusercontent.com/coldenate/zotero-remnote-connector/refs/heads/main/public/icons/';
	let css = '/* Zotero Connector icon overrides */\n';
	for (const [tag, file] of Object.entries(iconTagMap)) css += iconCSS(tag, file, base);
	return css;
}

/*───────────────────────────────────────────────────────────────────────────*/
/* RemNote plugin entry                                                    */
/*───────────────────────────────────────────────────────────────────────────*/
export async function registerIconCSS(plugin: RNPlugin): Promise<void> {
	const css = buildCSS();
	await logMessage(
		plugin,
		`[Zotero Connector-Icons] injecting ${css.length} chars`,
		LogType.Debug,
		false
	);
	await plugin.app.registerCSS('zotero-connector-icons', css);
}
