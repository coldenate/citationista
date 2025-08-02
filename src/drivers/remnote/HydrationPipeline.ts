/* ------------------------------------------------------------------
 * Phase C  –  “hydrate”
 * – figures out the final JSON for every touched Zotero item
 * – writes the results back to the corresponding Rems
 * – then delegates to the old (rich) ZoteroPropertyHydrator
 * -----------------------------------------------------------------*/

import type { RNPlugin } from '@remnote/plugin-sdk';
import { powerupCodes } from '../../constants/constants';
import type { ChangeSet, Item, SyncTreeNode, ZoteroItemData } from '../../types/types';
import { LogType, logMessage } from '../../utils/logging';
import { ZoteroPropertyHydrator } from './propertyHydrator';
import type { SyncTree } from '../../core/SyncTree';
import { threeWayMerge } from '../../core/threeWayMerge';

export interface TouchedItem {
	/** Zotero key                         */ key: string;
	/** Rem._id of the rem we just created */ remId: string;
	/** The fresh Zotero node (contains data) */
	remoteNode: SyncTreeNode;
}

interface HydrationJob {
	remId: string;
	merged: Partial<ZoteroItemData>;
	remoteNode: SyncTreeNode;
}

export class HydrationPipeline {
	private readonly plugin: RNPlugin;
	private readonly propHydrator: ZoteroPropertyHydrator;
	private readonly CONCURRENCY = 10;

	constructor(plugin: RNPlugin) {
		this.plugin = plugin;
		this.propHydrator = new ZoteroPropertyHydrator(plugin);
	}

	/* ------------------------------------------------------- *
	 *  Public entry point                                     *
	 * ------------------------------------------------------- */
	async run(
		touched: TouchedItem[],
		baseTree: SyncTree | undefined,
		onProgress: (fraction: number) => Promise<void>
	) {
		/* 1 ▸ build jobs (pure JS) */
		const jobs: HydrationJob[] = [];
		for (const { key, remId, remoteNode } of touched) {
			if (!('data' in remoteNode)) continue; // collections – ignore
			const baseNode = baseTree?.get(key);
			const base = baseNode && 'data' in baseNode ? baseNode.data : undefined;
			const local = await this.readLocalFullData(remId);
			const merged = threeWayMerge(local, remoteNode.data, base);
			jobs.push({ remId, merged, remoteNode });
		}

		/* 2 ▸ write title + fullData back in parallel */
		let done = 0;
		for (let i = 0; i < jobs.length; i += this.CONCURRENCY) {
			await Promise.all(
				jobs.slice(i, i + this.CONCURRENCY).map(async (j) => {
					await this.hydrateLight(j);
					done += 1;
					await onProgress(done / jobs.length); // 0 – 1  progress
				})
			);
		}

		/* 3 ▸ delegate rich formatting to your old hydrator  */
		const fakeChangeSet: ChangeSet = {
			newItems: [],
			updatedItems: jobs.map((j) => {
				const item: Item = j.remoteNode as Item;
				item.data = j.merged as ZoteroItemData;
				return item;
			}),
			deletedItems: [],
			movedItems: [],
			newCollections: [],
			updatedCollections: [],
			deletedCollections: [],
			movedCollections: [],
		};

		await this.propHydrator.hydrateItemAndCollectionProperties(fakeChangeSet);
	}

	/* ------------------------------------------------------- *
	 *              helpers (private)                          *
	 * ------------------------------------------------------- */

	/** Reads the JSON we stored last time under Z-Item › fullData */
	private async readLocalFullData(remId: string): Promise<Partial<ZoteroItemData> | undefined> {
		const rem = await this.plugin.rem.findOne(remId);
		const data = await rem?.getPowerupProperty(powerupCodes.ZITEM, 'fullData');
		if (Array.isArray(data) && typeof data[0] === 'string') {
			try {
				return JSON.parse(data[0]);
			} catch {}
		}
		return undefined;
	}

	/** Minimal hydration: title + fullData blob                 */
	private async hydrateLight(job: HydrationJob) {
		try {
			const rem = await this.plugin.rem.findOne(job.remId);
			if (!rem) return;

                        // ① title
                        const title = job.merged.title ?? (job.remoteNode as any).data?.title ?? '';
                        if (title) {
                                await rem.setText([title]);
                        }

                        // ② store metadata
                        await rem.setPowerupProperty(powerupCodes.ZITEM, 'version', [String((job.remoteNode as any).version)]);
                        await rem.setPowerupProperty(powerupCodes.ZITEM, 'fullData', [
                                JSON.stringify(job.merged),
                        ]);
		} catch (err) {
			await logMessage(
				this.plugin,
				`Hydration error for rem ${job.remId}: ${(err as Error).message}`,
				LogType.Error,
				false
			);
		}
	}
}
