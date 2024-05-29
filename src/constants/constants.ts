export const citationFormats = [
	{
		key: 'BibTeX',
		value: 'BibTeX',
		label: 'BibTeX',
	},
	{ key: 'APA', value: 'apa', label: 'APA' },
	{
		key: 'MLA',
		value: 'mla',
		label: 'MLA',
	},
	{
		key: 'Chicago',
		value: 'chicago',
		label: 'Chicago',
	},
	{
		key: 'Harvard',
		value: 'harvard',
		label: 'Harvard',
	},
	{
		key: 'Vancouver',
		value: 'vancouver',
		label: 'Vancouver',
	},
	{
		key: 'IEEE',
		value: 'ieee',
		label: 'IEEE',
	},
];

export const WIKIPEDIA_API_URL = 'https://en.wikipedia.org/api/rest_v1/data/citation/bibtex/';
export const WIKIPEDIA_API_HEADERS = new Headers({
	Cookie: 'GeoIP=US:VA:Ashburn:39.05:-77.49:v4; WMF-Last-Access-Global=04-Jan-2024; NetworkProbeLimit=0.001; WMF-Last-Access=04-Jan-2024',
	'Api-User-Agent': 'zotero-integration-plugin-for-remnote-github-citationista',
});
// in case they need to contact me, they can find us by the name of the plugin

export const powerupCodes = {
	ZOTERO_SYNCED_LIBRARY: 'zotero-synced-library',
	ZITEM: 'zitem',
	COLLECTION: 'collection',
	ZOTERO_TAG: 'zotero-tag',
	ZOTERO_NOTE: 'zotero-note',
	ZITEM_ATTACHMENT: 'zitem-attachment',
	COOL_POOL: 'coolPool',
};