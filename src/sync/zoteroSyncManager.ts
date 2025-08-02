/** Coordinates syncing between Zotero and RemNote. */
import type { RNPlugin } from '@remnote/plugin-sdk';

import { fetchLibraries, ZoteroAPI, type ZoteroLibraryInfo } from '../api/zotero';
import {
	ensureSpecificLibraryRemExists,
	ensureUnfiledItemsRemExists,
	ensureZoteroLibraryRemExists,
} from '../services/ensureUIPrettyZoteroRemExist';
import { checkAbortFlag } from '../services/pluginIO';
import type { ZoteroCollection, ZoteroItem } from '../types/types';
import { loadStoredEdits, startProgrammaticEdits } from '../utils/editTracker';
import { LogType, logMessage } from '../utils/logging';
import { ChangeDetector } from './changeDetector';
import { HydrationPipeline } from './HydrationPipeline';
import { ZoteroPropertyHydrator } from './propertyHydrator';
import { RemExecutor } from './RemExecutor';
import { planRemOperations } from './RemPlanner';
import { SyncTree } from './SyncTree';
import { release, tryAcquire } from './syncLock';
import { TreeBuilder } from './treeBuilder';

interface SyncState {
	syncing: boolean;
	progress: number;
	startTime?: string;
	multiLibraryProgress?: Record<string, { progress: number; name: string }>;
}

export class ZoteroSyncManager {
	private plugin: RNPlugin;
	private api: ZoteroAPI;
	private treeBuilder: TreeBuilder;
	private changeDetector: ChangeDetector;
	private propertyHydrator: ZoteroPropertyHydrator;
	private syncState: SyncState = {
		syncing: false,
		progress: 0,
	};

	constructor(plugin: RNPlugin) {
		this.plugin = plugin;
		this.api = new ZoteroAPI(plugin);
		this.treeBuilder = new TreeBuilder(plugin);
		this.changeDetector = new ChangeDetector();
		this.propertyHydrator = new ZoteroPropertyHydrator(plugin);
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
					await this.syncLibrary(lib, true);
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

			await this.syncLibrary(library);
			await logMessage(this.plugin, 'Sync complete!', LogType.Info, true);
		} finally {
			release();
		}
	}

	private async syncLibrary(library: ZoteroLibraryInfo, isMulti: boolean = false): Promise<void> {
		const key = `${library.type}:${library.id}`;
		await this.plugin.storage.setSynced('syncedLibraryId', key);

		if (!isMulti) {
			await this.updateSyncState({
				syncing: true,
				progress: 0,
				startTime: new Date().toISOString(),
			});
		}
		await this.updateProgress(0, key);

		try {
			await ensureZoteroLibraryRemExists(this.plugin);
			await ensureSpecificLibraryRemExists(this.plugin, library);
			await ensureUnfiledItemsRemExists(this.plugin, key);

			if (await this.checkAbort(isMulti)) return;

			await this.updateProgress(0.1, key);

			// Fetch Current Data

			const currentZoteroData = await this.api.fetchLibraryContents(library.type, library.id);

			const localTree = await SyncTree.buildTreeFromRems(this.plugin, library.id);

			// Build an immutable snapshot of that data, preparing for actionable todo/action list

			const remoteTree = SyncTree.build(currentZoteroData);

			// compare previous tree to current tree

			const changes = this.changeDetector.diffTrees(localTree, remoteTree);

			if (!changes) {
				await logMessage(this.plugin, 'No changes detected', LogType.Info, false);
				return;
			}

			// apply those changes to the tree

			const plan = planRemOperations(changes);

			startProgrammaticEdits();
			const touched = await new RemExecutor(this.plugin).run(plan, (p) =>
				this.updateProgress(0.3 * p, key)
			); // 0-30 %

			/* ---------- hydrate (30-90 %) ---------- */
			const baseRaw = await this.plugin.storage.getSynced('beforeUserEdits');
			const baseTree = baseRaw
				? SyncTree.fromSerializable(
						baseRaw as {
							items: ZoteroItem[];
							collections: ZoteroCollection[];
						}
					)
				: undefined;

			const hydrator = new HydrationPipeline(this.plugin);
			await hydrator.run(
				touched,
				baseTree,
				async (f) => this.updateProgress(0.3 + 0.6 * f, key) //   30-90 %
			);

			/* ---------- snapshot for next run ---------- */
			await this.plugin.storage.setSynced('beforeUserEdits', remoteTree.toSerializable());

			await this.updateProgress(1, key);
			await this.plugin.storage.setSynced('lastSyncTime', new Date().toISOString());
			await logMessage(this.plugin, 'Library sync complete', LogType.Info, false);
		} catch (error) {
			await logMessage(this.plugin, error as Error, LogType.Error, false);
		} finally {
			if (!isMulti) {
				await this.cleanupSyncState(false);
			} else {
				// ensure final progress is recorded as complete
				await this.updateProgress(1, key);
			}
		}
	}
}
