import { type Rem, renderWidget, usePlugin } from '@remnote/plugin-sdk';
import { useCallback, useEffect, useState } from 'react';
import { markAbortRequested } from '../services/pluginIO';
import { ZoteroSyncManager } from '../sync/zoteroSyncManager';

interface SyncStatus {
        isActive: boolean;
        progress: number;
        lastSyncTime?: Date;
        libraryName?: string;
        timeRemaining?: number;
}

function SyncStatusWidget() {
	const plugin = usePlugin();
        const [syncStatus, setSyncStatus] = useState<SyncStatus>({
                isActive: false,
                progress: 0,
                timeRemaining: undefined,
        });
	const [isProcessing, setIsProcessing] = useState(false);

        // Get current Zotero library Rem
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
                                setSyncStatus({ isActive: false, progress: 0, timeRemaining: undefined });
                                return;
                        }

                        const progress = ((await plugin.storage.getSession('syncProgress')) as number) || 0;
                        const isActive = ((await plugin.storage.getSession('syncing')) as boolean) || false;
                        const startTime = (await plugin.storage.getSession('syncStartTime')) as string | undefined;
                        let timeRemaining: number | undefined = undefined;
                        if (startTime && progress > 0 && progress < 1) {
                                const start = new Date(startTime).getTime();
                                const elapsed = Date.now() - start;
                                const total = elapsed / progress;
                                timeRemaining = Math.max(total - elapsed, 0);
                        }

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
                                timeRemaining,
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
                       await markAbortRequested(plugin);
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
<div className="fixed left-1/2 -translate-x-1/2 bottom-8 z-50 pointer-events-none">
<div
className="pointer-events-auto rounded-xl shadow-md p-4 flex items-center gap-4 border"
style={{
backgroundColor: 'var(--background-primary)',
borderColor: 'var(--border-primary)',
color: 'var(--text-primary)',
}}
>
                                <button
                                        type="button"
                                        onClick={syncStatus.isActive ? handleAbortSync : handleSyncNow}
className={`w-12 h-12 rounded-full text-white flex items-center justify-center transition-colors ${
syncStatus.isActive
? 'bg-red-600 hover:bg-red-700'
: 'bg-[var(--accent-color)] hover:opacity-80'
}`}
                                        disabled={isProcessing}
                                >
                                        {syncStatus.isActive ? '⏹' : '▶'}
                                </button>
                                <div className="flex-1">
                                       <div
                                               className="w-full rounded-full h-2 overflow-hidden"
                                               style={{ backgroundColor: 'var(--background-secondary)' }}
                                       >
                                                <div
                                                        className="h-2 rounded-full transition-all"
                                                        style={{
                                                                width: `${progressPercentage}%`,
                                                                backgroundColor: 'var(--accent-color)',
                                                        }}
                                                />
                                        </div>
                                        <div className="text-xs text-gray-600 dark:text-gray-400 mt-1 flex justify-between">
                                                <span>{syncStatus.isActive ? 'Syncing...' : 'Ready'}</span>
                                                <span>{Math.round(progressPercentage)}%</span>
                                        </div>
                                        {syncStatus.isActive && syncStatus.timeRemaining !== undefined && (
                                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                                        ~{Math.ceil(syncStatus.timeRemaining / 1000)}s remaining
                                                </p>
                                        )}
                                        {syncStatus.lastSyncTime && (
                                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                                        Last synced: {formatLastSync(syncStatus.lastSyncTime)}
                                                </p>
                                        )}
                                        {syncStatus.libraryName && (
                                                <p className="text-xs text-blue-700 dark:text-blue-300 mt-1 font-medium">
                                                        {syncStatus.libraryName}
                                                </p>
                                        )}
                                </div>
                        </div>
                </div>
        );
}

renderWidget(SyncStatusWidget);
