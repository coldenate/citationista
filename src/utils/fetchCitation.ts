import type { RNPlugin } from '@remnote/plugin-sdk';
import { isDebugMode } from '..';
import { WIKIPEDIA_API_HEADERS, WIKIPEDIA_API_URL } from '../constants/constants';
import { LogType, logMessage } from '../utils/logging';

export async function fetchCitation(citationURL: string, plugin: RNPlugin) {
	const debugMode = await isDebugMode(plugin);
	try {
		const response = await fetch(`${WIKIPEDIA_API_URL}${encodeURIComponent(citationURL)}`, {
			method: 'GET',
			headers: WIKIPEDIA_API_HEADERS,
			redirect: 'follow',
		});

		if (!response.ok && debugMode) {
			await logMessage(
				plugin,
				`Failed to fetch citation for ${citationURL}`,
				LogType.Error,
				false
			);
			return null;
		}

		return response.text();
	} catch (_error) {
		await logMessage(
			plugin,
			`Failed to fetch citation for ${citationURL}`,
			LogType.Error,
			false
		);
		return null;
	}
}
