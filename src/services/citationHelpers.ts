import { BuiltInPowerupCodes, type Rem, type RNPlugin } from '@remnote/plugin-sdk';
import { WIKIPEDIA_API_HEADERS, WIKIPEDIA_API_URL } from '../constants/constants';
import { LogType, logMessage } from '../utils/logging';

/* ──────────────────────────────────────────────────────────────────── */
/*  Small util: choose Zotero base URL                                 */
/* ──────────────────────────────────────────────────────────────────── */
function zoteroBase(): string {
    return process.env.NODE_ENV === 'development' ? '/zotero' : 'https://api.zotero.org';
}

/* ──────────────────────────────────────────────────────────────────── */
/*  0 ▸ helper: current credentials + primary library info             */
/* ──────────────────────────────────────────────────────────────────── */
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

    return {
        apiKey: String(apiKey),
        primaryLibId: libraryId,
        primaryLibType: libraryType,
        userId: String(userId),
    };
}

export async function extractSourceUrls(plugin: RNPlugin, rem: Rem): Promise<string[]> {
    const sources = await rem.getSources();
    const urls: string[] = [];

    for (const source of sources) {
        const md = await plugin.richText.toMarkdown(
            await source.getPowerupPropertyAsRichText(BuiltInPowerupCodes.Link, 'URL')
        );

        const linkMatch = /(https?:\/\/[^)]+)/.exec(md);
        const candidate = linkMatch ? linkMatch[1] : md.trim();

        try {
            new URL(candidate);
            urls.push(candidate);
        } catch {
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

/**
 * Take an array of URLs, translate them with Wikimedia Citoid, push each item
 * into the configured Zotero library, and return the new item keys.
 */
export async function sendUrlsToZotero(plugin: RNPlugin, urls: string[]): Promise<string[]> {
        const { apiKey, primaryLibId, primaryLibType } = await getLibraryInfo(plugin);
        const itemKeys: string[] = [];

	for (const url of urls) {
		await logMessage(plugin, `▶ Translating ${url}`, LogType.Debug, false);

		/* 1 ▸ translate with Citoid */
		const citoidRes = await fetch(
			`https://en.wikipedia.org/api/rest_v1/data/citation/zotero/${encodeURIComponent(url)}`
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

		const citoidPayload = await citoidRes.json();
		const item = Array.isArray(citoidPayload) ? citoidPayload[0] : citoidPayload;

		if (!item) {
			await logMessage(plugin, `Citoid empty payload for ${url}`, LogType.Warning, false);
			continue;
		}

                /* 2 ▸ POST to Zotero */
                await logMessage(plugin, `⤴ Pushing item to Zotero`, LogType.Debug, false);

                const postRes = await fetch(`${zoteroBase()}/${primaryLibType}/${primaryLibId}/items`, {
                        method: 'POST',
                        headers: {
                                'Content-Type': 'application/json',
                                'Zotero-API-Key': apiKey,
                                'Zotero-API-Version': '3',
                        },
                        body: JSON.stringify([item]),
                });

		const bodyText = await postRes.text(); // we’ll need this for logging

		if (!postRes.ok) {
			await logMessage(
				plugin,
				`Zotero POST ${postRes.status}: ${bodyText}`,
				LogType.Error,
				false
			);
			continue;
		}

		/* 3 ▸ extract the new itemKey – real success payload is an object */
		try {
			const data = JSON.parse(bodyText);

			// Success envelope can be "success" (old) or "successful" (newer docs)
			const successObj = data.successful ?? data.success ?? data;

			const firstKeyObj = Object.values(successObj)[0] as any;
			const key = firstKeyObj?.key;

			if (key) {
				itemKeys.push(key);
				await logMessage(plugin, `✓ Added item ${key}`, LogType.Debug, false);
			} else {
				await logMessage(
					plugin,
					`Zotero response parsed but no key found: ${bodyText}`,
					LogType.Warning,
					false
				);
			}
		} catch (e) {
			await logMessage(
				plugin,
				`Failed to parse Zotero response: ${String(e)}\n${bodyText}`,
				LogType.Error,
				false
			);
		}
	}

	if (!itemKeys.length) {
		await logMessage(
			plugin,
			'No items were added; see warnings/errors above.',
			LogType.Warning,
			false
		);
	}

	return itemKeys;
}
/* ────────────────────────────────────────────────────────────────────────── */
/* 3 ▸  Formatting helpers (unchanged API)                                  */
/* ────────────────────────────────────────────────────────────────────────── */

function stripHtml(html: string): string {
	return html.replace(/<\/?[^>]+(>|$)/g, '').trim();
}

export async function fetchZoteroFormatted(
	plugin: RNPlugin,
	itemKey: string,
	include: 'citation' | 'bib',
	style?: string
): Promise<string | null> {
	const finalStyle =
		style ??
		((await plugin.settings.getSetting('citation-format')) as string | undefined) ??
		'apa';

        const { apiKey, primaryLibId, primaryLibType, userId } = await getLibraryInfo(plugin);

        const primaryUrl =
                `${zoteroBase()}/${primaryLibType}/${primaryLibId}/items/${itemKey}` +
                `?include=${include}&style=${finalStyle}&linkwrap=0`;

        const primary = await tryFetchFormatted(plugin, primaryUrl, apiKey);
        if (primary) return primary;

        if (primaryLibType === 'groups') {
                const userUrl =
                        `${zoteroBase()}/users/${userId}/items/${itemKey}` +
                        `?include=${include}&style=${finalStyle}&linkwrap=0`;

                const personal = await tryFetchFormatted(plugin, userUrl, apiKey);
                if (personal) return personal;
        }

        return null;
}

async function tryFetchFormatted(
        plugin: RNPlugin,
        url: string,
        apiKey: string
): Promise<string | null> {
        let res: Response;
        try {
                res = await fetch(url, {
                        headers: { 'Zotero-API-Key': apiKey, Accept: 'application/json' },
                });
        } catch (e) {
                await logMessage(plugin, `Fetch failed for ${url}: ${String(e)}`, LogType.Warning, false);
                return null;
        }

        if (!res.ok) return null;

        const ctype = res.headers.get('content-type') ?? '';
        let rawHtml = '';
        try {
                if (ctype.includes('application/json')) {
                        const json = await res.json();
                        rawHtml = json.citation ?? json.bib ?? '';
                } else {
                        rawHtml = await res.text();
                }
        } catch {
                return null;
        }

        return rawHtml ? stripHtml(rawHtml) : null;
}
export const fetchZoteroCitation = (plugin: RNPlugin, itemKey: string, style?: string) =>
	fetchZoteroFormatted(plugin, itemKey, 'citation', style);

export const fetchZoteroBibliography = (plugin: RNPlugin, itemKey: string, style?: string) =>
	fetchZoteroFormatted(plugin, itemKey, 'bib', style);

export async function fetchWikipediaCitation(
	plugin: RNPlugin,
	url: string,
	style?: string
): Promise<string | null> {
	const finalStyle =
		style ??
		((await plugin.settings.getSetting('citation-format')) as string | undefined) ??
		'apa';
	const res = await fetch(`${WIKIPEDIA_API_URL}${encodeURIComponent(url)}`, {
		headers: {
			...Object.fromEntries(WIKIPEDIA_API_HEADERS.entries()),
			Accept: `text/x-bibliography; style=${finalStyle}; locale=en-US`,
		},
	});
	return res.ok ? res.text() : null;
}

export async function fetchWikipediaBibliography(
	plugin: RNPlugin,
	url: string,
	style?: string
): Promise<string | null> {
	const finalStyle =
		style ??
		((await plugin.settings.getSetting('citation-format')) as string | undefined) ??
		'apa';
	const res = await fetch(`${WIKIPEDIA_API_URL}${encodeURIComponent(url)}`, {
		headers: {
			...Object.fromEntries(WIKIPEDIA_API_HEADERS.entries()),
			Accept: `text/x-bibliography; style=${finalStyle}; locale=en-US`,
		},
	});
	return res.ok ? res.text() : null;
}
