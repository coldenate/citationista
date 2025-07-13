import type { RNPlugin } from '@remnote/plugin-sdk';
import { LogType, logMessage } from '../utils/logging';

/**
 * Maps RemNote tag identifiers → icon basenames (no theme suffix).
 */
const iconTagMap: Record<string, string> = {
	/* ─── Zotero helpers ─── */
	collection: 'collection',
	'zotero-collection': 'collection',
	coolPool: 'collection',
        'zotero-unfiled-items': 'unfiled',
        'zotero-synced-library': 'library',
        'zotero-library-sync': 'library',
        'zotero-item': 'document',
	zitem: 'document',

	/* ─── Zotero Connector power‑ups ─── */
	'zotero-connector-annotation': 'note-annotation',
	'artwork-zotero-connector': 'artwork',
	'attachment-zotero-connector': 'attachment-file',
	'audiorecording-zotero-connector': 'audio-recording',
	'bill-zotero-connector': 'bill',
	'blogpost-zotero-connector': 'blog-post',
	'book-zotero-connector': 'book',
	'booksection-zotero-connector': 'book-section',
	'case-zotero-connector': 'case',
	'computerprogram-zotero-connector': 'computer-program',
	'conferencepaper-zotero-connector': 'conference-paper',
	'dataset-zotero-connector': 'dataset',
	'dictionaryentry-zotero-connector': 'dictionary-entry',
	'document-zotero-connector': 'document',
	'email-zotero-connector': 'email',
	'encyclopediaarticle-zotero-connector': 'encyclopedia-article',
	'film-zotero-connector': 'film',
	'forumpost-zotero-connector': 'forum-post',
	'hearing-zotero-connector': 'hearing',
	'instantmessage-zotero-connector': 'instant-message',
	'interview-zotero-connector': 'interview',
	'journalarticle-zotero-connector': 'journal-article',
	'letter-zotero-connector': 'letter',
	'magazinearticle-zotero-connector': 'magazine-article',
	'manuscript-zotero-connector': 'manuscript',
	'map-zotero-connector': 'map',
	'newspaperarticle-zotero-connector': 'newspaper-article',
	'note-zotero-connector': 'note',
	'patent-zotero-connector': 'patent',
	'podcast-zotero-connector': 'podcast',
	'preprint-zotero-connector': 'preprint',
	'presentation-zotero-connector': 'presentation',
	'radiobroadcast-zotero-connector': 'radio-broadcast',
	'report-zotero-connector': 'report',
	'standard-zotero-connector': 'standard',
	'statute-zotero-connector': 'statute',
	'thesis-zotero-connector': 'thesis',
	'tvbroadcast-zotero-connector': 'tv-broadcast',
	'videorecording-zotero-connector': 'video-recording',
	'webpage-zotero-connector': 'webpage',
};

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
        const bullet = `${both(tag, '.rn-rem-bullet')}, ${both(tag, '.rn-document-bullet')}`;

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
		'https://raw.githubusercontent.com/coldenate/zotero-remnote-connector/refs/heads/main/public/icons/flat-icons';
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
		`[Zotero Connector‑Icons] injecting ${css.length} chars`,
		LogType.Debug,
		false
	);
	await plugin.app.registerCSS('zotero-connector-icons', css);
}
