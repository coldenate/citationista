import type { RNPlugin } from '@remnote/plugin-sdk';

/**
 * Map a power-up tag to the basename of an icon (without the `-dark.svg` / `-light.svg` suffix).
 */
export const iconTagMap: Record<string, string> = {
	// ──────────────────────── Zotero helpers ────────────────────────
	collection: 'collection',
	'zotero-collection': 'collection',
	coolPool: 'collection',
	'zotero-unfiled-items': 'unfiled',
	'zotero-synced-library': 'library', // Use `library-group` if you prefer
	'zotero-item': 'document',
	zitem: 'document',

	// ───────────────────── Citationista power-ups ────────────────────
	'citationista-annotation': 'note-annotation',
	'citationista-artwork': 'artwork',
	'citationista-attachment': 'attachment-file',
	'citationista-audioRecording': 'audio-recording',
	'citationista-bill': 'bill',
	'citationista-blogPost': 'blog-post',
	'citationista-book': 'book',
	'citationista-bookSection': 'book-section',
	'citationista-case': 'case',
	'citationista-computerProgram': 'computer-program',
	'citationista-conferencePaper': 'conference-paper',
	'citationista-dataset': 'dataset',
	'citationista-dictionaryEntry': 'dictionary-entry',
	'citationista-document': 'document',
	'citationista-email': 'email',
	'citationista-encyclopediaArticle': 'encyclopedia-article',
	'citationista-film': 'film',
	'citationista-forumPost': 'forum-post',
	'citationista-hearing': 'hearing',
	'citationista-instantMessage': 'instant-message',
	'citationista-interview': 'interview',
	'citationista-journalArticle': 'journal-article',
	'citationista-letter': 'letter',
	'citationista-magazineArticle': 'magazine-article',
	'citationista-manuscript': 'manuscript',
	'citationista-map': 'map',
	'citationista-newspaperArticle': 'newspaper-article',
	'citationista-note': 'note',
	'citationista-patent': 'patent',
	'citationista-podcast': 'podcast',
	'citationista-preprint': 'preprint',
	'citationista-presentation': 'presentation',
	'citationista-radioBroadcast': 'radio-broadcast',
	'citationista-report': 'report',
	'citationista-standard': 'standard',
	'citationista-statute': 'statute',
	'citationista-thesis': 'thesis',
	'citationista-tvBroadcast': 'tv-broadcast',
	'citationista-videoRecording': 'video-recording',
	'citationista-webpage': 'webpage',
};

/**
 * Base URL for the flat icon set (no trailing slash).
 */
const ICON_BASE_URL =
	'https://raw.githubusercontent.com/coldenate/citationista/main/public/icons/flat-icons';

/**
 * Build the dark / light CSS rules for one tag.
 */
function buildRule(tag: string, base: string): string {
	const dark = `${ICON_BASE_URL}/${base}-dark.svg`;
	const light = `${ICON_BASE_URL}/${base}-light.svg`;

	return `
/* ${tag} */
[data-rem-tags~="${tag}"] .rem-bullet__core { display: none; }

[data-rem-tags~="${tag}"] .perfect-circle__inner {
  background-image: url('${dark}');
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
}

@media (prefers-color-scheme: light) {
  [data-rem-tags~="${tag}"] .perfect-circle__inner {
    background-image: url('${light}');
  }
}`;
}

/**
 * Generate the full stylesheet.
 */
export function generateIconCSS(): string {
	return [
		'/* Citationista icon overrides */',
		...Object.entries(iconTagMap).map(([tag, base]) => buildRule(tag, base)),
	].join('\n');
}

/**
 * Register the generated CSS with RemNote.
 */
export async function registerIconCSS(plugin: RNPlugin) {
	const css = generateIconCSS();
	console.debug('Registering Citationista icon CSS (length %d)', css.length);
	await plugin.app.registerCSS('citationista-icons', css);
}
