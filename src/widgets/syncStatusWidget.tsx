import './syncStatusWidget.css';
import { type Rem, renderWidget, usePlugin } from '@remnote/plugin-sdk';
import { useCallback, useEffect, useState } from 'react';
import { markAbortRequested } from '../services/pluginIO';
import { ZoteroSyncManager } from '../drivers/remnote/ZoteroSyncManager';
import { LogType, logMessage } from '../utils/logging';

interface LibraryEntry {
	name: string;
	progress: number;
}

interface SyncStatus {
	isActive: boolean;
	progress: number;
	lastSyncTime?: Date;
	libraryName?: string;
	libraries?: LibraryEntry[];
}

function SyncStatusWidget() {
	const plugin = usePlugin();
	const [syncStatus, setSyncStatus] = useState<SyncStatus>({
		isActive: false,
		progress: 0,
		libraries: [],
	});
	const [isProcessing, setIsProcessing] = useState(false);

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
	}, [plugin]);

	const getLibraryName = useCallback(
		async (key: string): Promise<string> => {
			const libraryRemMap = (await plugin.storage.getSynced('libraryRemMap')) as
				| Record<string, string>
				| undefined;
			const remId = libraryRemMap?.[key];
			if (remId) {
				const rem = await plugin.rem.findOne(remId);
				const text = await rem?.text;
				if (text) {
					return (Array.isArray(text) ? text.join('') : String(text)) || key;
				}
			}
			return key;
		},
		[plugin]
	);

	const updateSyncStatus = useCallback(async () => {
		try {
			const multi = await plugin.settings.getSetting('sync-multiple-libraries');

			const progress = ((await plugin.storage.getSession('syncProgress')) as number) || 0;
			const isActive = ((await plugin.storage.getSession('syncing')) as boolean) || false;

			if (multi) {
				const progressMap = (await plugin.storage.getSession('multiLibraryProgress')) as
					| Record<string, { progress: number; name: string }>
					| undefined;
				const libraries: LibraryEntry[] = [];
				if (progressMap) {
					for (const [key, val] of Object.entries(progressMap)) {
						const name = val.name || (await getLibraryName(key));
						libraries.push({ name, progress: val.progress });
					}
				}

				const lastSyncString = await plugin.storage.getSynced('lastSyncTime');
				const lastSyncTime = lastSyncString
					? new Date(lastSyncString as string)
					: undefined;

				setSyncStatus({
					isActive,
					progress,
					lastSyncTime,
					libraries,
				});
				return;
			}

			const libraryRem = await getCurrentLibraryRem();
			if (!libraryRem) {
				setSyncStatus({
					isActive: false,
					progress: 0,
					libraries: [],
				});
				return;
			}

			const libraryText = libraryRem.text;
			const libraryName = (libraryText?.[0] as string) || 'Zotero Library';

			const lastSyncString = await plugin.storage.getSynced('lastSyncTime');
			const lastSyncTime = lastSyncString ? new Date(lastSyncString as string) : undefined;

			setSyncStatus({
				isActive,
				progress,
				lastSyncTime,
				libraryName,
			});
		} catch (error) {
			await logMessage(
				plugin,
				'Error updating sync status',
				LogType.Error,
				false,
				String(error)
			);
		}
	}, [getCurrentLibraryRem, plugin, getLibraryName]);

	const handleSyncNow = async () => {
		if (isProcessing) return;

		setIsProcessing(true);
		try {
			const syncManager = new ZoteroSyncManager(plugin);
			await syncManager.sync();

			await plugin.storage.setSynced('lastSyncTime', new Date().toISOString());
			await updateSyncStatus();
		} catch (error) {
			await logMessage(plugin, 'Sync failed', LogType.Error, false, String(error));
			const message = error instanceof Error ? error.message : 'Unknown error';
			await plugin.app.toast('Sync failed: ' + message);
		} finally {
			setIsProcessing(false);
		}
	};

	const handleAbortSync = async () => {
		try {
			await markAbortRequested(plugin);
			await plugin.app.toast('Sync abort requested');
			await updateSyncStatus();
		} catch (error) {
			await logMessage(plugin, 'Error aborting sync', LogType.Error, false, String(error));
		}
	};

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

	useEffect(() => {
		updateSyncStatus();

		const interval = setInterval(updateSyncStatus, 50);

		return () => clearInterval(interval);
	}, [updateSyncStatus]);

	const progressPercentage = Math.min(100, Math.max(0, syncStatus.progress * 100));

	useEffect(() => {
		console.log('Sync Status:', {
			isActive: syncStatus.isActive,
			progress: syncStatus.progress,
			progressPercentage,
			rawProgress: syncStatus.progress,
		});
	}, [syncStatus.progress, syncStatus.isActive, progressPercentage]);

	return (
		<div id="sync-status-root">
			<div
				style={{
					position: 'absolute',
					bottom: 0,
					left: '50%',
					transform: 'translateX(-50%)',
					pointerEvents: 'none',
					width: '100%',
					height: '100%',
					display: 'flex',
					justifyContent: 'center',
					alignItems: 'flex-end',
				}}
			>
				<div className="pointer-events-auto sync-status-card">
					<div>
						<div className="sync-status-info-banner">
							<span className="sync-status-info-icon">ℹ</span>
							<span className="sync-status-info-text">
								It is recommended to collapse all Rem in this file to make syncing
								faster
							</span>
						</div>
						<div className="sync-status-btn-col">
							<button
								type="button"
								onClick={handleSyncNow}
								disabled={isProcessing || syncStatus.isActive}
								className={`sync-action-btn${
									isProcessing || syncStatus.isActive ? ' disabled' : ''
								}`}
							>
								Sync Now
							</button>
							<button
								type="button"
								onClick={handleAbortSync}
								disabled={!syncStatus.isActive}
								className={`abort-action-btn${!syncStatus.isActive ? ' disabled' : ''}`}
							>
								Abort
							</button>
						</div>
					</div>
					<div className="flex-1">
						{progressPercentage > 0 && (
							<div className="w-full rounded-full h-2 overflow-hidden mb-2 sync-status-progress-bg">
								<div
									className="sync-status-progress-bar"
									style={{ width: `${progressPercentage}%` }}
								></div>
							</div>
						)}

						<hr className="sync-status-divider" />
						<div className="text-xs mt-1 flex justify-between sync-status-info">
							<span>{syncStatus.isActive ? 'Syncing...' : 'Ready'}</span>
							<span>{Math.round(progressPercentage)}%</span>
						</div>
						{syncStatus.lastSyncTime && (
							<>
								<hr className="sync-status-divider" />
								<p className="text-xs mt-1 sync-status-info">
									Last synced: {formatLastSync(syncStatus.lastSyncTime)}
								</p>
							</>
						)}
						{syncStatus.libraries && syncStatus.libraries.length > 0 ? (
							<>
								<hr className="sync-status-divider" />
								<div className="sync-status-library-list mt-1 text-xs">
									{syncStatus.libraries.map((lib) => (
										<div key={lib.name} className="sync-status-library-item">
											<span>{lib.name}</span>
											<span>
												{Math.round(
													Math.min(100, Math.max(0, lib.progress * 100))
												)}
												%
											</span>
										</div>
									))}
								</div>
							</>
						) : (
							syncStatus.libraryName && (
								<>
									<hr className="sync-status-divider" />
									<p className="text-xs mt-1 font-medium sync-status-library">
										{syncStatus.libraryName}
									</p>
								</>
							)
						)}
					</div>
				</div>
			</div>
		</div>
	);
}

renderWidget(SyncStatusWidget);
