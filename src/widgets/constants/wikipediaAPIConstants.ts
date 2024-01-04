export const WIKIPEDIA_API_URL = 'https://en.wikipedia.org/api/rest_v1/data/citation/bibtex/';
export const WIKIPEDIA_API_HEADERS = new Headers({
	Cookie: 'GeoIP=US:VA:Ashburn:39.05:-77.49:v4; WMF-Last-Access-Global=04-Jan-2024; NetworkProbeLimit=0.001; WMF-Last-Access=04-Jan-2024',
	'Api-User-Agent': 'zotero-integration-plugin-for-remnote-github-citationista',
});
