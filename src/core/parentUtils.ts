import type { SyncTreeNode } from './SyncTree';

/** Resolve the parent Zotero key for a node.
 * Collections use `parentCollection`.
 * Items prefer `parentItem` then first `data.collections` entry.
 */
export function resolveParentKey(node: SyncTreeNode): string | null {
  if ('parentCollection' in node) {
    return node.parentCollection || null;
  }
  if ('data' in node) {
    return node.data.parentItem ?? node.data.collections?.[0] ?? null;
  }
  return null;
}
