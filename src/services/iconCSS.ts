import type { RNPlugin } from '@remnote/plugin-sdk';

const iconTagMap: Record<string, string> = {
	/* top-level Zotero helpers */
	collection: 'collection',
	'zotero-collection': 'collection', // Alternative collection tag
	coolPool: 'collection', // "pool" behaves like a smart collection
	'zotero-unfiled-items': 'unfiled',
	'zotero-synced-library': 'library', // use 'library-group' if you prefer
	'zotero-item': 'document', // Generic zotero item
	zitem: 'document',

	/* Citationista power-ups */
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

function generateCSS(): string {
	const baseURL =
		'https://raw.githubusercontent.com/coldenate/citationista/refs/heads/main/public/icons/flat-icons';
	let css = '/* Citationista icon overrides */\n';
	for (const [tag, base] of Object.entries(iconTagMap)) {
		const dark = `${baseURL}/${base}-dark.svg`;
		const light = `${baseURL}/${base}-light.svg`;

		// Hide the default SVG circle and replace with our custom icon
		css += `[data-rem-tags~="${tag}"] .rem-bullet__core {\n`;
		css += `  display: none;\n`;
		css += `}\n`;
		// Add our custom icon as a background on the bullet container
		css += `[data-rem-tags~="${tag}"] .perfect-circle__inner {\n`;
		css += `  background-image: url("${dark}");\n`;
		css += `  background-size: contain;\n`;
		css += `  background-repeat: no-repeat;\n`;
		css += `  background-position: center;\n`;
		css += `}\n`;

		css += `@media (prefers-color-scheme: light) {\n`;
		css += `  [data-rem-tags~="${tag}"] .perfect-circle__inner {\n`;
		css += `    background-image: url("${light}");\n`;
		css += `    background-size: contain;\n`;
		css += `    background-repeat: no-repeat;\n`;
		css += `    background-position: center;\n`;
		css += `  }\n`;
		css += `}\n`;
	}

	return css;
}

export async function registerIconCSS(plugin: RNPlugin) {
	const css = generateCSS();
	console.log('Registering icon CSS:', css);

	await plugin.app.registerCSS('citationista-icons', css);
}
