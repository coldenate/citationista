import type { RNPlugin } from '@remnote/plugin-sdk';

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
	'zotero-item': 'document',
	zitem: 'document',

	/* ─── Citationista power‑ups ─── */
	'citationista-annotation': 'note-annotation',
	'artwork-citationista': 'artwork',
	'attachment-citationista': 'attachment-file',
	'audiorecording-citationista': 'audio-recording',
	'bill-citationista': 'bill',
	'blogpost-citationista': 'blog-post',
	'book-citationista': 'book',
	'booksection-citationista': 'book-section',
	'case-citationista': 'case',
	'computerprogram-citationista': 'computer-program',
	'conferencepaper-citationista': 'conference-paper',
	'dataset-citationista': 'dataset',
	'dictionaryentry-citationista': 'dictionary-entry',
	'document-citationista': 'document',
	'email-citationista': 'email',
	'encyclopediaarticle-citationista': 'encyclopedia-article',
	'film-citationista': 'film',
	'forumpost-citationista': 'forum-post',
	'hearing-citationista': 'hearing',
	'instantmessage-citationista': 'instant-message',
	'interview-citationista': 'interview',
	'journalarticle-citationista': 'journal-article',
	'letter-citationista': 'letter',
	'magazinearticle-citationista': 'magazine-article',
	'manuscript-citationista': 'manuscript',
	'map-citationista': 'map',
	'newspaperarticle-citationista': 'newspaper-article',
	'note-citationista': 'note',
	'patent-citationista': 'patent',
	'podcast-citationista': 'podcast',
	'preprint-citationista': 'preprint',
	'presentation-citationista': 'presentation',
	'radiobroadcast-citationista': 'radio-broadcast',
	'report-citationista': 'report',
	'standard-citationista': 'standard',
	'statute-citationista': 'statute',
	'thesis-citationista': 'thesis',
	'tvbroadcast-citationista': 'tv-broadcast',
	'videorecording-citationista': 'video-recording',
	'webpage-citationista': 'webpage',
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
	const coreRing = both(tag, '.rem-bullet__core') + ', ' + both(tag, '.rem-bullet__ring');
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
		'https://raw.githubusercontent.com/coldenate/citationista/refs/heads/main/public/icons/flat-icons';
	let css = '/* Citationista icon overrides */\n';
	for (const [tag, file] of Object.entries(iconTagMap)) css += iconCSS(tag, file, base);
	return css;
}

/*───────────────────────────────────────────────────────────────────────────*/
/* RemNote plugin entry                                                    */
/*───────────────────────────────────────────────────────────────────────────*/
export async function registerIconCSS(plugin: RNPlugin): Promise<void> {
	const css = buildCSS();
	console.debug('[Citationista‑Icons] injecting', css.length, 'chars');
	await plugin.app.registerCSS('citationista-icons', css);
}
