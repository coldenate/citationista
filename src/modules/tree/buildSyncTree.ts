import { SyncTree } from '../models/interfaces';

export function buildSyncTree(data: unknown): SyncTree {
  // TODO: extract real logic
  return {
    rootCollections: [],
    orphans: [],
    lookup: {},
  };
}
