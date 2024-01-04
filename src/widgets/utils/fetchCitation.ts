import { RNPlugin } from '@remnote/plugin-sdk';
import { LogType, logMessage } from '../funcs/logging';
import { isDebugMode } from '..';
import { WIKIPEDIA_API_URL, WIKIPEDIA_API_HEADERS } from '../constants/wikipediaAPIConstants';

export async function fetchCitation(citationURL: string, plugin: RNPlugin) {
	const debugMode = await isDebugMode(plugin);
	try {
		const response = await fetch(`${WIKIPEDIA_API_URL}${encodeURIComponent(citationURL)}`, {
			method: 'GET',
			headers: WIKIPEDIA_API_HEADERS,
			redirect: 'follow',
		});

		if (!response.ok && debugMode) {
			await logMessage({
				plugin: plugin,
				message: `Failed to fetch citation for ${citationURL}`,
				type: LogType.Error,
				consoleEmitType: 'error',
				isToast: false,
			});
			return null;
		}

		return response.text();
	} catch (error) {
		await logMessage({
			plugin: plugin,
			message: `Failed to fetch citation for ${citationURL}`,
			type: LogType.Error,
			consoleEmitType: 'error',
			isToast: false,
		});

		return null;
	}
}
