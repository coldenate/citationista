/** Coordinates syncing between Zotero and RemNote. */
import type { RNPlugin } from '@remnote/plugin-sdk';

import { fetchLibraries, type ZoteroLibraryInfo } from '../../api/zotero';
import { loadStoredEdits } from '../../utils/editTracker';
import { LogType, logMessage } from '../../utils/logging';
import { checkAbortFlag } from '../../services/pluginIO';
import { release, tryAcquire } from './syncLock';
import { syncLibrary as syncLibraryDriver } from './syncLibrary';

interface SyncState {
	syncing: boolean;
	progress: number;
	startTime?: string;
	multiLibraryProgress?: Record<string, { progress: number; name: string }>;
}

export class ZoteroSyncManager {
	private plugin: RNPlugin;
        private syncState: SyncState = {
                syncing: false,
                progress: 0,
        };

        constructor(plugin: RNPlugin) {
                this.plugin = plugin;
                void loadStoredEdits(plugin);
        }

	/**
	 * Centralized method to update sync state and persist to storage
	 */
	private async updateSyncState(updates: Partial<SyncState>): Promise<void> {
		this.syncState = { ...this.syncState, ...updates };

		// Persist all state changes in one batch
		const storageUpdates: Array<
			[string, string | number | boolean | Record<string, { progress: number; name: string }>]
		> = [
			['syncing', this.syncState.syncing],
			['syncProgress', this.syncState.progress],
		];

		if (this.syncState.startTime !== undefined) {
			storageUpdates.push(['syncStartTime', this.syncState.startTime]);
		}

		if (this.syncState.multiLibraryProgress !== undefined) {
			storageUpdates.push(['multiLibraryProgress', this.syncState.multiLibraryProgress]);
		}

		await Promise.all(
			storageUpdates.map(([key, value]) => this.plugin.storage.setSession(key, value))
		);
	}

	/**
	 * Centralized method to get sync state from storage
	 */
	private async getSyncState(): Promise<SyncState> {
		const [syncing, progress, startTime, multiLibraryProgress] = await Promise.all([
			this.plugin.storage.getSession('syncing'),
			this.plugin.storage.getSession('syncProgress'),
			this.plugin.storage.getSession('syncStartTime'),
			this.plugin.storage.getSession('multiLibraryProgress'),
		]);

		return {
			syncing: (syncing as boolean) ?? false,
			progress: (progress as number) ?? 0,
			startTime: startTime as string | undefined,
			multiLibraryProgress: multiLibraryProgress as
				| Record<string, { progress: number; name: string }>
				| undefined,
		};
	}

	/**
	 * Centralized progress update with multi-library support
	 */
	private async updateProgress(value: number, libraryKey?: string): Promise<void> {
		if (this.syncState.multiLibraryProgress && libraryKey) {
			const entry = this.syncState.multiLibraryProgress[libraryKey];
			const prev = entry?.progress ?? 0;
			const next = value < prev ? prev : value;

			this.syncState.multiLibraryProgress[libraryKey] = {
				...(entry || { name: libraryKey }),
				progress: next,
			};

			// Calculate overall progress
			const total = Object.values(this.syncState.multiLibraryProgress).reduce(
				(a, b) => a + b.progress,
				0
			);
			const avg = total / Object.keys(this.syncState.multiLibraryProgress).length;

			await this.updateSyncState({
				progress: avg,
				multiLibraryProgress: this.syncState.multiLibraryProgress,
			});
			return;
		}

		await this.updateSyncState({ progress: value });
	}

	/**
	 * Centralized sync status management
	 */
	private async setSyncingStatus(active: boolean): Promise<void> {
		await this.updateSyncState({ syncing: active });
	}

	/**
	 * Centralized abort checking with cleanup
	 */
	private async checkAbort(isMulti: boolean): Promise<boolean> {
		const stop = await checkAbortFlag(this.plugin);
		if (stop) {
			await this.setSyncingStatus(false);
			await this.updateProgress(0);

			const cleanupUpdates: Partial<SyncState> = {
				startTime: undefined,
			};

			if (isMulti) {
				cleanupUpdates.multiLibraryProgress = undefined;
			}

			await this.updateSyncState(cleanupUpdates);
			await logMessage(this.plugin, 'Sync aborted', LogType.Info, false);
		}
		return stop;
	}

	/**
	 * Initialize multi-library sync state
	 */
	private async initializeMultiLibrarySync(libraries: ZoteroLibraryInfo[]): Promise<void> {
		this.syncState.multiLibraryProgress = {};
		for (const lib of libraries) {
			this.syncState.multiLibraryProgress[`${lib.type}:${lib.id}`] = {
				progress: 0,
				name: lib.name,
			};
		}

		await this.updateSyncState({
			syncing: true,
			progress: 0,
			startTime: new Date().toISOString(),
			multiLibraryProgress: this.syncState.multiLibraryProgress,
		});
	}

	/**
	 * Clean up sync state after completion
	 */
	private async cleanupSyncState(isMulti: boolean): Promise<void> {
		const cleanupUpdates: Partial<SyncState> = {
			syncing: false,
			progress: 0,
			startTime: undefined,
		};

		if (isMulti) {
			cleanupUpdates.multiLibraryProgress = undefined;
		}

		await this.updateSyncState(cleanupUpdates);
	}

	async sync(): Promise<void> {
		// Check for existing incomplete sync
		const existingState = await this.getSyncState();
		if (existingState.syncing) {
			await logMessage(
				this.plugin,
				'Incomplete previous sync detected. Cleaning up.',
				LogType.Warning,
				false
			);
			await this.setSyncingStatus(false);
		}

		if (!tryAcquire()) {
			await logMessage(
				this.plugin,
				'Sync already running; skipping new request.',
				LogType.Info,
				false
			);
			return;
		}

		try {
			const multi = await this.plugin.settings.getSetting('sync-multiple-libraries');

			if (multi) {
				const libs = await fetchLibraries(this.plugin);
				await this.initializeMultiLibrarySync(libs);

				for (const lib of libs) {
                                const key = `${lib.type}:${lib.id}`;
                                await syncLibraryDriver(this.plugin, lib, (p) => this.updateProgress(p, key));
                                if (await this.checkAbort(true)) return;
				}

				await logMessage(this.plugin, 'Sync complete!', LogType.Info, true);
				await this.cleanupSyncState(true);
				return;
			}

			// Single library sync
			const selected = (await this.plugin.settings.getSetting('zotero-library-id')) as
				| string
				| undefined;
			let library: ZoteroLibraryInfo | null = null;

			if (selected) {
				const libs = await fetchLibraries(this.plugin);
				library = libs.find((l) => `${l.type}:${l.id}` === selected) || null;
			} else {
				const libs = await fetchLibraries(this.plugin);
				if (libs.length > 0) {
					library = libs[0];
				}
			}

			if (!library) return;

                        await this.updateSyncState({
                                syncing: true,
                                progress: 0,
                                startTime: new Date().toISOString(),
                        });
                        await syncLibraryDriver(this.plugin, library, (p) => this.updateProgress(p));
                        await logMessage(this.plugin, 'Sync complete!', LogType.Info, true);
                        await this.cleanupSyncState(false);
                } finally {
                        release();
                }
        }
}
