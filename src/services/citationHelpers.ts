import type { Rem, RNPlugin } from '@remnote/plugin-sdk';
import { WIKIPEDIA_API_HEADERS, WIKIPEDIA_API_URL } from '../constants/constants';
import { LogType, logMessage } from '../utils/logging';

export async function extractSourceUrls(plugin: RNPlugin, rem: Rem): Promise<string[]> {
	const sources = await rem.getSources();
	const urls: string[] = [];
	for (const source of sources) {
		const rt = source.text;
		if (!rt) continue;
		const markdown = await plugin.richText.toMarkdown(rt);
		const match = /\(([^)]+)\)/.exec(markdown);
		const url = match ? match[1] : markdown.trim();
		if (isValidUrl(url)) {
			urls.push(url);
		}
	}
	return urls;
}

function isValidUrl(url: string): boolean {
	try {
		new URL(url);
		return true;
	} catch {
		return false;
	}
}

async function getLibraryInfo(
	plugin: RNPlugin
): Promise<{ apiKey: string; libraryId: string; libraryType: 'users' | 'groups' }> {
	const apiKey = await plugin.settings.getSetting('zotero-api-key');
	const userId = await plugin.settings.getSetting('zotero-user-id');
	const librarySetting = await plugin.settings.getSetting('zotero-library-id');
	if (!apiKey || !userId) {
		throw new Error('Zotero credentials not set');
	}
	let libraryId = String(userId);
	let libraryType: 'users' | 'groups' = 'users';
	if (librarySetting && typeof librarySetting === 'string' && librarySetting.includes(':')) {
		const [type, id] = librarySetting.split(':');
		libraryType = type === 'group' ? 'groups' : 'users';
		libraryId = id;
	}
	return { apiKey: String(apiKey), libraryId, libraryType };
}

export async function sendUrlsToZotero(plugin: RNPlugin, urls: string[]): Promise<string[]> {
	const { apiKey, libraryId, libraryType } = await getLibraryInfo(plugin);
	const itemKeys: string[] = [];
	for (const url of urls) {
		try {
			const citoidRes = await fetch(
				`https://en.wikipedia.org/api/rest_v1/data/citation/zotero/${encodeURIComponent(url)}`
			);
			if (!citoidRes.ok) continue;
			const citoidJson = await citoidRes.json();
			const postRes = await fetch(
				`https://api.zotero.org/${libraryType}/${libraryId}/items`,
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'Zotero-API-Key': apiKey,
					},
					body: JSON.stringify([citoidJson]),
				}
			);
			if (!postRes.ok) continue;
			const data = await postRes.json();
			const key = data?.[0]?.key;
			if (key) itemKeys.push(key);
		} catch (err) {
			await logMessage(
				plugin,
				`Failed to send ${url} to Zotero: ${String(err)}`,
				LogType.Error,
				false
			);
		}
	}
	return itemKeys;
}

export async function fetchZoteroFormatted(
	plugin: RNPlugin,
	itemKey: string,
	include: 'citation' | 'bib',
	style = 'apa'
): Promise<string | null> {
	const { apiKey, libraryId, libraryType } = await getLibraryInfo(plugin);
	const res = await fetch(
		`https://api.zotero.org/${libraryType}/${libraryId}/items/${itemKey}?include=${include}&style=${style}`,
		{ headers: { 'Zotero-API-Key': apiKey } }
	);
	return res.ok ? res.text() : null;
}

// thin wrappers so the rest of the code keeps compiling
export const fetchZoteroCitation = (plugin: RNPlugin, itemKey: string, style = 'apa') =>
	fetchZoteroFormatted(plugin, itemKey, 'citation', style);

export const fetchZoteroBibliography = (plugin: RNPlugin, itemKey: string, style = 'apa') =>
	fetchZoteroFormatted(plugin, itemKey, 'bib', style);

export async function fetchWikipediaCitation(url: string, style = 'apa'): Promise<string | null> {
	const res = await fetch(`${WIKIPEDIA_API_URL}${encodeURIComponent(url)}`, {
		headers: {
			...Object.fromEntries(WIKIPEDIA_API_HEADERS.entries()),
			Accept: `text/x-bibliography; style=${style}; locale=en-US`,
		},
	});
	return res.ok ? res.text() : null;
}

export async function fetchWikipediaBibliography(
	url: string,
	style = 'apa'
): Promise<string | null> {
	const res = await fetch(`${WIKIPEDIA_API_URL}${encodeURIComponent(url)}`, {
		headers: new Headers({
			...Object.fromEntries(WIKIPEDIA_API_HEADERS.entries()),
			Accept: `text/x-bibliography; style=${style}; locale=en-US`,
		}),
	});
	return res.ok ? res.text() : null;
}
