import { type Rem, renderWidget, usePlugin } from '@remnote/plugin-sdk';
import { useCallback, useEffect, useState } from 'react';
import { powerupCodes } from '../constants/constants';
import { markForceStopRequested } from '../services/pluginIO';
import { ZoteroSyncManager } from '../sync/zoteroSyncManager';

interface SyncStatus {
	isActive: boolean;
	progress: number;
	lastSyncTime?: Date;
	libraryName?: string;
}

function SyncStatusWidget() {
	const plugin = usePlugin();
	const [syncStatus, setSyncStatus] = useState<SyncStatus>({
		isActive: false,
		progress: 0,
	});
	const [isProcessing, setIsProcessing] = useState(false);

	// Get current Zotero library Rem with ZOTERO_SYNCED_LIBRARY powerup
	const getCurrentLibraryRem = useCallback(async (): Promise<Rem | null> => {
		const syncedLibraryId = await plugin.storage.getSynced('syncedLibraryId');
		if (!syncedLibraryId) return null;

		const libraryRemMap = (await plugin.storage.getSynced('libraryRemMap')) as
			| Record<string, string>
			| undefined;
		const remId = libraryRemMap?.[syncedLibraryId as string];

		if (remId) {
			const rem = await plugin.rem.findOne(remId);
			return rem || null;
		}

		return null;
	}, [plugin.storage, plugin.rem]);

	// Update sync status from storage
	const updateSyncStatus = useCallback(async () => {
		try {
			const libraryRem = await getCurrentLibraryRem();
			if (!libraryRem) {
				setSyncStatus({ isActive: false, progress: 0 });
				return;
			}

			const progressValue = await libraryRem.getPowerupProperty(
				powerupCodes.ZOTERO_SYNCED_LIBRARY,
				'progress'
			);
			const progress = progressValue?.[0] ? parseFloat(progressValue[0] as string) : 0;

			const isSyncing = await libraryRem.getPowerupProperty(
				powerupCodes.ZOTERO_SYNCED_LIBRARY,
				'syncing'
			);
			const isActive = (isSyncing?.[0] as string) === 'true';

			// Get library name from rem text
			const libraryText = libraryRem.text;
			const libraryName = (libraryText?.[0] as string) || 'Zotero Library';

			// Get last sync time from storage
			const lastSyncString = await plugin.storage.getSynced('lastSyncTime');
			const lastSyncTime = lastSyncString ? new Date(lastSyncString as string) : undefined;

			setSyncStatus({
				isActive,
				progress,
				lastSyncTime,
				libraryName,
			});
		} catch (error) {
			console.error('Error updating sync status:', error);
		}
	}, [getCurrentLibraryRem, plugin.storage]);

	// Handle sync now button
	const handleSyncNow = async () => {
		if (isProcessing) return;

		setIsProcessing(true);
		try {
			const syncManager = new ZoteroSyncManager(plugin);
			await syncManager.sync();

			// Update last sync time
			await plugin.storage.setSynced('lastSyncTime', new Date().toISOString());
			await updateSyncStatus();
		} catch (error) {
			console.error('Sync failed:', error);
			const message = error instanceof Error ? error.message : 'Unknown error';
			await plugin.app.toast('Sync failed: ' + message);
		} finally {
			setIsProcessing(false);
		}
	};

	// Handle abort sync
	const handleAbortSync = async () => {
		try {
			await markForceStopRequested(plugin);
			await plugin.app.toast('Sync abort requested');
			await updateSyncStatus();
		} catch (error) {
			console.error('Error aborting sync:', error);
		}
	};

	// Format last sync time
	const formatLastSync = (date: Date): string => {
		const now = new Date();
		const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));

		if (diffInMinutes < 1) return 'just now';
		if (diffInMinutes === 1) return '1 minute ago';
		if (diffInMinutes < 60) return `${diffInMinutes} minutes ago`;

		const diffInHours = Math.floor(diffInMinutes / 60);
		if (diffInHours === 1) return '1 hour ago';
		if (diffInHours < 24) return `${diffInHours} hours ago`;

		const diffInDays = Math.floor(diffInHours / 24);
		if (diffInDays === 1) return '1 day ago';
		return `${diffInDays} days ago`;
	};

	// Set up polling for sync status updates
	useEffect(() => {
		updateSyncStatus();

		const interval = setInterval(updateSyncStatus, 2000); // Update every 2 seconds

		return () => clearInterval(interval);
	}, [updateSyncStatus]);

	const progressPercentage = Math.min(100, Math.max(0, syncStatus.progress * 100));

	return (
		<div className="fixed left-1/2 -translate-x-1/2 bottom-8 z-50 w-full max-w-md pointer-events-none">
			<div className="pointer-events-auto bg-gradient-to-br from-blue-50/90 to-white/90 dark:from-gray-900/90 dark:to-gray-800/90 rounded-2xl shadow-2xl border border-blue-200 dark:border-blue-700 px-8 py-6 flex flex-col gap-4 animate-fade-in">
				<div className="flex items-center gap-3 mb-2">
					<div className="flex-shrink-0 w-10 h-10 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
						<svg
							className="w-6 h-6 text-blue-600 dark:text-blue-300"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							viewBox="0 0 24 24"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
					</div>
					<div>
						<h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
							Zotero Sync Status
						</h3>
						{syncStatus.libraryName && (
							<p className="text-xs text-blue-700 dark:text-blue-300 font-medium">
								{syncStatus.libraryName}
							</p>
						)}
					</div>
				</div>

				{/* Progress Bar */}
				<div className="mb-2">
					<div className="flex justify-between items-center mb-1">
						<span className="text-xs text-gray-600 dark:text-gray-400">
							{syncStatus.isActive ? 'Syncing...' : 'Ready'}
						</span>
						<span className="text-xs text-gray-600 dark:text-gray-400">
							{Math.round(progressPercentage)}%
						</span>
					</div>
					<div className="w-full bg-blue-100 dark:bg-blue-900 rounded-full h-3 overflow-hidden">
						<div
							className={`h-3 rounded-full transition-all duration-500 ${
								syncStatus.isActive ? 'bg-blue-500 animate-pulse' : 'bg-green-500'
							}`}
							style={{ width: `${progressPercentage}%` }}
						/>
					</div>
				</div>

				{/* Last Sync Info */}
				{syncStatus.lastSyncTime && (
					<div className="mb-2 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
						<svg
							className="w-4 h-4 text-blue-400"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							viewBox="0 0 24 24"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
						<span>Last synced: {formatLastSync(syncStatus.lastSyncTime)}</span>
					</div>
				)}

				{/* Action Buttons */}
				<div className="flex gap-3 mt-2">
					{syncStatus.isActive ? (
						<button
							type="button"
							onClick={handleAbortSync}
							className="flex-1 px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 disabled:bg-red-400 rounded-lg shadow transition-colors focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-2"
							disabled={isProcessing}
						>
							Abort Sync
						</button>
					) : (
						<button
							type="button"
							onClick={handleSyncNow}
							className="flex-1 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-lg shadow transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2"
							disabled={isProcessing}
						>
							{isProcessing ? 'Syncing...' : 'Sync Now'}
						</button>
					)}
				</div>
			</div>
		</div>
	);
}

renderWidget(SyncStatusWidget);
