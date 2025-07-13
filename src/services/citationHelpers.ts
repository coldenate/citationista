import { BuiltInPowerupCodes, type Rem, type RNPlugin } from '@remnote/plugin-sdk';
import { WIKIPEDIA_API_HEADERS, WIKIPEDIA_API_URL } from '../constants/constants';
import { LogType, logMessage } from '../utils/logging';

export async function extractSourceUrls(plugin: RNPlugin, rem: Rem): Promise<string[]> {
	const sources = await rem.getSources();
	const urls: string[] = [];

	for (const source of sources) {
		const md = await plugin.richText.toMarkdown(
			await source.getPowerupPropertyAsRichText(BuiltInPowerupCodes.Link, 'URL')
		);

		// works for `[label](url)` *and* bare `https://…`
		const linkMatch = /\((https?:\/\/[^)]+)\)/.exec(md);
		const candidate = linkMatch ? linkMatch[1] : md.trim();

		if (isValidUrl(candidate)) {
			urls.push(candidate);
		} else {
			await logMessage(
				plugin,
				`Source ${source._id.slice(0, 8)}: extracted string is not a URL → “${candidate}”`,
				LogType.Debug,
				false
			);
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

async function getLibraryInfo(plugin: RNPlugin) {
	const apiKey = await plugin.settings.getSetting('zotero-api-key');
	const userId = await plugin.settings.getSetting('zotero-user-id');
	const libSetting = await plugin.settings.getSetting('zotero-library-id');

	if (!apiKey || !userId) throw new Error('Zotero credentials not set');

	let libraryId = String(userId);
	let libraryType: 'users' | 'groups' = 'users';

	if (typeof libSetting === 'string' && libSetting.includes(':')) {
		const [type, id] = libSetting.split(':');
		libraryType = type === 'group' ? 'groups' : 'users';
		libraryId = id;
	}
	return { apiKey: String(apiKey), libraryId, libraryType };
}
/**
 * Take an array of URLs, translate them with Wikimedia Citoid, push each item
 * into the configured Zotero library, and return the new item keys.
 */
export async function sendUrlsToZotero(plugin: RNPlugin, urls: string[]): Promise<string[]> {
	const { apiKey, libraryId, libraryType } = await getLibraryInfo(plugin);
	const itemKeys: string[] = [];

	for (const url of urls) {
		try {
			/* ── 1 ▸ translate URL → Zotero JSON via Citoid ───────────────────── */
			const citoidRes = await fetch(
				`https://en.wikipedia.org/api/rest_v1/data/citation/zotero/${encodeURIComponent(
					url
				)}`
			);
			if (!citoidRes.ok) {
				await logMessage(
					plugin,
					`Citoid ${citoidRes.status} for ${url}`,
					LogType.Warning,
					false
				);
				continue;
			}

			// Citoid returns an *array*; grab the first element
			const citoidData = await citoidRes.json();
			const item = Array.isArray(citoidData) ? citoidData[0] : citoidData;
			if (!item) {
				await logMessage(
					plugin,
					`Citoid returned empty payload for ${url}`,
					LogType.Warning,
					false
				);
				continue;
			}

			/* ── 2 ▸ POST into Zotero library ─────────────────────────────────── */
			const postRes = await fetch(
				`https://api.zotero.org/${libraryType}/${libraryId}/items`,
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'Zotero-API-Key': apiKey,
					},
					body: JSON.stringify([item]), // one-item array per API spec
				}
			);

			if (!postRes.ok) {
				const txt = await postRes.text(); // surface Zotero’s error msg
				await logMessage(
					plugin,
					`Zotero POST ${postRes.status}: ${txt}`,
					LogType.Error,
					false
				);
				continue;
			}

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

/* ────────────────────────────────────────────────────────────────────────── */
/* 3 ▸  Formatting helpers (unchanged API)                                  */
/* ────────────────────────────────────────────────────────────────────────── */

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
		headers: {
			...Object.fromEntries(WIKIPEDIA_API_HEADERS.entries()),
			Accept: `text/x-bibliography; style=${style}; locale=en-US`,
		},
	});
	return res.ok ? res.text() : null;
}
