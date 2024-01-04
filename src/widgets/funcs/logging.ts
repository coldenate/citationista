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
 * Logs a message with the specified type and emits it to the console.
 * If isToast is true, it also displays the message as a toast.
 *
 * @param plugin - The ReactRNPlugin or RNPlugin instance.
 * @param message - The message to be logged.
 * @param type - The type of the log message.
 * @param consoleEmitType - The type of console emit (warn, info, error, log). Default is 'log'.
 * @param isToast - Indicates whether to display the message as a toast. Default is false.
 */
export async function logMessage({
	plugin,
	message,
	type,
	consoleEmitType = 'log',
	isToast,
}: {
	plugin: ReactRNPlugin | RNPlugin;
	message: any[] | string;
	type: LogType;
	consoleEmitType?: 'warn' | 'info' | 'error' | 'log';
	isToast: boolean;
}) {
	const baseplateIdentifier = `${logTypeToEmoji[type].emoji} emitted from ${plugin.id}`;
	switch (consoleEmitType) {
		case 'warn':
			console.warn(baseplateIdentifier, message);
			break;
		case 'info':
			console.info(baseplateIdentifier, message);
			break;
		case 'error':
			console.error(baseplateIdentifier, message);
			break;
		default:
			console.log(baseplateIdentifier, message);
			break;
	}
	const debugMode = await plugin.storage.getSession('debugMode');
	if (isToast) {
		await plugin.app.toast(`${logTypeToEmoji[type].emoji} ${message}`);
	}
}
