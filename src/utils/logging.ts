import type { ReactRNPlugin, RNPlugin } from '@remnote/plugin-sdk';

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

// Type for messages that can be logged
type LogMessage = string | Error | unknown[];

// Type for additional parameters that can be logged
type LogParams = Record<string, unknown> | unknown[] | string | number | boolean | null | undefined;

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
	message: LogMessage,
	type: LogType,
	isToast: boolean = true,
	params?: LogParams
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
				// Changed: Preserve stack trace if message is an Error instance
				if (message instanceof Error) {
					console.error(baseplateIdentifier, message.stack, params);
				} else {
					console.error(baseplateIdentifier, message, params);
				}
				break;
			default:
				console.log(baseplateIdentifier, message, params);
				break;
		}
	}
	if (isToast && debugMode) {
		// Convert message to string for toast display
		const toastMessage =
			message instanceof Error
				? message.message
				: Array.isArray(message)
					? message.join(' ')
					: String(message);
		await plugin.app.toast(`${logTypeToEmoji[type].emoji} ${toastMessage}`);
	}
}
