import { RNPlugin, ReactRNPlugin } from '@remnote/plugin-sdk';

// Define the log types enum
export enum LogType {
	Debug = 'Debug',
	Info = 'Info',
	Warning = 'Warning',
	Error = 'Error',
	Success = 'Success',
	Fatal = 'Fatal',
	Critical = 'Critical',
}

// Define a type for the log type with emoji
type LogTypeInfo = {
	[key in LogType]: { name: key; emoji: string };
};

// Define the log type to emoji mapping
const logTypeToEmoji: LogTypeInfo = {
	Debug: { name: LogType.Debug, emoji: '🐞' },
	Info: { name: LogType.Info, emoji: 'ℹ️' },
	Warning: { name: LogType.Warning, emoji: '⚠️' },
	Error: { name: LogType.Error, emoji: '❌' },
	Success: { name: LogType.Success, emoji: '✅' },
	Fatal: { name: LogType.Fatal, emoji: '💀' },
	Critical: { name: LogType.Critical, emoji: '🚨' },
};


/**
 * Logs a message to the console and displays a toast notification.
 * @param plugin - The plugin object.
 * @param message - The message to be logged.
 * @param type - The type of log message (warn, info, error, log).
 * @param isToast - Whether to display a toast notification.
 * @param params - Additional parameters to be logged.
 */
export async function logMessage(
	plugin: ReactRNPlugin | RNPlugin,
	message: any[] | string,
	type: LogType,
	isToast: boolean = true,
	params?: any
) {
	const debugMode = await plugin.settings.getSetting('debug-mode');
	if (debugMode) {
		const baseplateIdentifier = `${logTypeToEmoji[type].emoji}+📚`;
		const consoleEmitType = type.toLowerCase() as 'warn' | 'info' | 'error' | 'log';
		switch (consoleEmitType) {
			case 'warn':
				console.warn(baseplateIdentifier, message, params);
				break;
			case 'info':
				console.info(baseplateIdentifier, message, params);
				break;
			case 'error':
				console.error(baseplateIdentifier, message, params);
				break;
			default:
				console.log(baseplateIdentifier, message, params);
				break;
		}
	}
	if (isToast) {
		await plugin.app.toast(`${logTypeToEmoji[type].emoji} ${message}`);
	}
}
