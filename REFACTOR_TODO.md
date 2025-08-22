Refactor TODO — Modular Sync Pipeline (aligned with reporefactor.md)

Scope: Break monolithic sync logic into clear modules with focused responsibilities. This list is derived from the analysis in `reporefactor.md` and current code under `src/sync/*` and `src/services/*`.

Key goals

-   [ ] Indexing Module to scan RemNote and return a typed index
-   [ ] Change Computation module (stable now) with future local-edit detection
-   [ ] Merge Processor module encapsulating three-way merge and decisions
-   [ ] RemExecutor module to centralize all RemNote write ops
-   [ ] SyncApplier to apply a `ChangeSet` using RemExecutor
-   [ ] Split `ZoteroSyncManager.syncLibrary` into smaller steps
-   [ ] Single source of truth for setting item/collection content
-   [ ] Modular multi-collection strategy (portal/reference)
-   [ ] Logging and tests

1. Types and shared contracts

-   [x] Add `src/types/syncContracts.ts` with unified node model used by Local/Remote/Shadow:
    -   [x] `type NodeKind = 'item' | 'collection' | 'note' | 'attachment'`
    -   [x] `type GlobalKey = "${libraryKey}:${itemKey}"` used everywhere (nodes, maps, planner, validator, snapshots)
    -   [x] `interface BaseSyncNode { key: GlobalKey; libraryKey: string; itemKey: string; parentKeys: GlobalKey[] }`
    -   [x] `type ZoteroItemCore = Omit<ZoteroItem, 'rem' | 'children' | 'parent'>`
    -   [x] `type ZoteroCollectionCore = Omit<ZoteroCollection, 'rem' | 'children' | 'parent'>`
    -   [x] `type SyncNode = (BaseSyncNode & { kind: 'collection'; contents: ZoteroCollectionCore }) | (BaseSyncNode & { kind: 'item' | 'note' | 'attachment'; contents: ZoteroItemCore })`
    -   [x] `interface LocalSidecar { remId: string; rem?: Rem | null; titleRT?: RichTextInterface; propertyMap?: Record<string, unknown>; lastPluginWriteAt?: number; protectedUntil?: number; }`
    -   [x] `interface RemoteSidecar { etag?: string; }`
    -   [x] `type LocalNode = SyncNode & { sidecar: LocalSidecar }`
    -   [x] `type RemoteNode = SyncNode & { sidecar: RemoteSidecar }`
    -   [x] `type ShadowNode = SyncNode`
    -   [x] `interface IndexResult { nodeByKey: Map<GlobalKey, LocalNode>; childrenByParentKey: Map<GlobalKey, GlobalKey[]>; libraryRem: Rem | null; unfiledRem: Rem | null; libraryKey: string; }`
    -   [x] `type PreparedChangeSet = ChangeSet & { prepared: true }` (optional flag while migrating)
    -   [x] `type LocallyEditedFields = Record<string, Set<string>>` (itemKey → edited fields)
-   [x] Update imports to use these contracts where appropriate (avoid unnecessary re‑exports to reduce coupling)

2. Indexing Module

-   [x] Create `src/modules/tree/RemNoteIndex.ts` with a single public API:
    -   [x] `buildIndex(plugin: RNPlugin, libraryKey: string): Promise<IndexResult>`
    -   [x] Walk ZITEM/Collection Rems → produce `LocalNode` entries with unified `SyncNode` fields + `LocalSidecar`
    -   [x] Use `ensureUIPrettyZoteroRemExist.ts` to resolve `libraryRem`/`unfiledRem`
-   [x] Create `src/modules/tree/ZoteroIndex.ts` that wraps `ZoteroAPI.fetchLibraryData` and returns `Map<string, RemoteNode>` mirroring `SyncNode`
    -   [x] Return `Map<GlobalKey, RemoteNode>`
-   [x] Ensure empty `parentKeys` implies Unfiled placement for items
-   [x] Add unit tests under `src/modules/tree/__tests__/RemNoteIndex.test.ts` and `ZoteroIndex.test.ts`

1. Change Computation (diff)

-   [ ] Move `src/sync/changeDetector.ts` to `src/modules/diff/changeDetector.ts` (keep current API)
-   [ ] Keep detection logic as-is for now (remote vs prev shadow)
-   [ ] Add TODO hooks for Phase 2 local-change detection:
    -   [ ] Compare current RemNote title/note text to `prevData` to infer local edits
    -   [ ] Populate `LocallyEditedFields` for the merge processor
-   [ ] Add tests in `src/modules/diff/__tests__/changeDetector.test.ts`
-   [ ] Add `localChangeDetector.ts`: compute `LocallyEditedFields` by diffing Local vs Shadow, excluding programmatic edits via `editTracker`

4. Merge Processor

-   [ ] Move `src/sync/threeWayMerge.ts` → `src/modules/diff/threeWayMerge.ts`
-   [ ] Move `src/sync/mergeUpdatedItems.ts` → `src/modules/diff/mergeUpdatedItems.ts`
-   [ ] Extend merge entry point to accept optional `locallyEditedFields: LocallyEditedFields`
-   [ ] Ensure merge logs decisions when debug mode is on (field-level: local kept vs remote applied; arrays merged)
-   [ ] Tests: `src/modules/diff/__tests__/threeWayMerge.test.ts` (cover core/non-core/child arrays)

5. RemExecutor (central write ops)

-   [ ] Create `src/modules/executor/RemExecutor.ts` encapsulating RemNote mutations:
    -   [ ] `createCollection(key: string, parent?: Rem): Promise<Rem | null>`
    -   [ ] `createItem(item: Item, parent?: Rem): Promise<Rem | null>` (adds ZITEM + type power-up, sets key)
    -   [ ] `updateRemText(rem: Rem, text: string | RichTextArray): Promise<void>`
    -   [ ] `moveRem(rem: Rem, parent: Rem): Promise<void>`
    -   [ ] `removeRem(rem: Rem): Promise<void>`
    -   [ ] `createPortal(rem: Rem, targetParent: Rem): Promise<void>`
    -   [ ] `createReference(rem: Rem, targetParent: Rem): Promise<void>` (wraps current reference workaround)
    -   [ ] Internal logging + consistent error handling
-   [ ] Add `transaction<T>(fn: (exec: RemExecutor) => Promise<T>): Promise<T>` to group related ops and produce structured logs
-   [ ] Tests: `src/modules/executor/__tests__/RemExecutor.test.ts` (use SDK mocks)

6. SyncApplier (structure changes)

-   [ ] Create `src/modules/tree/SyncApplier.ts`:
    -   [ ] `applyChangeSet(plugin, changeSet: ChangeSet, index: IndexResult, onProgress?: () => Promise<void>)`
    -   [ ] Uses RemExecutor for create/update/delete/membership/reparent
    -   [ ] Deterministic op ordering (planner semantics):
        -   [ ] Creates → collections then items; parent-before-child; breadth-first
        -   [ ] Updates
        -   [ ] Membership ops for items: `attachToParent`/`detachFromParent`
        -   [ ] Reparent collections (parents before children)
        -   [ ] Deletes (items first; then collections deepest-first)
    -   [ ] Deduplicate arrays passed to move to avoid double-processing (e.g., new + moved)
    -   [ ] Extract helpers: `moveCollections`, `moveItems`, `handleMultiCollection` with strategy
    -   [ ] Return a summary `{ createdItems, updatedItems, createdCollections, updatedCollections }` for hydration
-   [ ] Tests: `src/modules/tree/__tests__/SyncApplier.test.ts`
-   [ ] Add `dryRun` mode that logs a plan without mutating; unit-test stable ordering/idempotency

7. Multi-collection strategy

-   [ ] Add `src/modules/tree/multiCollection.ts` with:
    -   [ ] `interface MultiCollectionStrategy { handle(extraParents: Rem[], itemRem: Rem): Promise<void> }`
    -   [ ] `PortalStrategy` and `ReferenceStrategy` implementations delegating to RemExecutor
    -   [ ] Select strategy based on setting `multiple-colections-behavior`
-   [ ] Unit tests for both strategies

8. Hydration ownership

-   [ ] Move `ZoteroPropertyHydrator` to `src/modules/hydration/ZoteroPropertyHydrator.ts`
-   [ ] Make hydrator the single place that sets item/collection text content
-   [ ] Add `MinimalHydrator.setTitles(...)` for Simple Mode, called instead of structural update writing titles
-   [ ] Remove title-setting side effects from structural steps (`TreeBuilder.updateItems`) once parity achieved

9. Split ZoteroSyncManager

-   [ ] Refactor `src/sync/zoteroSyncManager.ts` (`syncLibrary`) into:
    -   [ ] `prepareLibrarySync(library)`
    -   [ ] `fetchAndCompare(library)` → returns `{ currentData, prevData, changes }`
    -   [ ] `merge(changes, prevData, index)`
    -   [ ] `apply(changes, index)` → delegates to SyncApplier
    -   [ ] `hydrate(summary, changes)` → hydrator or minimal hydrator
    -   [ ] `finalize(libraryKey, currentData)` → shadow save + progress reset
-   [ ] Ensure progress/abort checks remain centralized and consistent

9.a Progress reporting (monotonic)

-   [ ] Add `src/modules/progress/ProgressReporter.ts` used by manager + modules:
    -   [ ] Phase weights: Index 10%, Diff 10%, Merge 15%, Apply 35%, Hydrate 25%, Finalize 5%
    -   [ ] Compute units from `PlannedOp[]` (each op = 1 unit; hydration ops weighted)
    -   [ ] Per‑library monotonic updates (never decrease); averaged multi‑library progress
    -   [ ] Keys: session + per‑library; no regression once set

10. Migration from TreeBuilder

-   [ ] Introduce SyncApplier and RemNoteIndex alongside existing `TreeBuilder`
-   [ ] Gate usage with a setting or feature flag (e.g., `use-modular-sync`)
-   [ ] Validate parity in a test library; then remove `TreeBuilder` methods and delete file

11. Logging

-   [ ] Centralize action logs in RemExecutor (create/update/delete/move/portal/reference)
-   [ ] Add optional conflict summaries in Merge Processor when debug is enabled

12. Tests and reliability

-   [ ] Ensure existing tests under `src/modules/**/__tests__` pass
-   [ ] Add coverage for:
    -   [ ] Move de-duplication (new+ moved)
    -   [ ] Unfiled placement fallback
    -   [ ] Portal/reference creation idempotency
    -   [ ] Abort checks during long loops
    -   [ ] Property‑based merge tests (randomized field diffs)
    -   [ ] Integration: create→move→delete idempotency (replay same `ChangeSet` twice does no extra work)
    -   [ ] Throttled hydration tests (batching/chunk size)
    -   [ ] Replay test: executing the same `PlannedOp[]` twice yields no extra mutations
    -   [ ] Membership test: add/remove collection membership without duplicate portals/references
    -   [ ] Validator reachability test: every node reachable from library root; single canonical item Rem
    -   [ ] Local‑edit mask test: edits within `protectedUntil` are ignored by local diff

13. Clean-up and docs

-   [ ] Update imports across codebase to new module locations
-   [ ] Remove dead code and duplicated responsibilities
-   [ ] Add an architecture section in `README.md` with module diagram
-   [ ] Document debug logging switches

14. Action List (Decision Queue)

-   [ ] Module `src/modules/actions/*`:
    -   [ ] `type Action = { id: string; type: string; severity: 'info' | 'warn' | 'error'; entity: { kind: string; key: string }; message: string; apply(): Promise<void>; dismiss(): Promise<void>; }`
    -   [ ] `ActionBus` + persisted queue (session → storage)
    -   [ ] Emit from: merge conflicts without auto‑resolution, write‑back failures, orphaned items, mapping gaps, validator violations
-   [ ] Lightweight UI panel under Home (filters + “Resolve safe fixes”)

15. Zotero write‑back queue

-   [ ] Module `src/modules/writeback/ZoteroWriteback.ts`:
    -   [ ] Batch updates with retry/backoff
    -   [ ] Handle `If-Unmodified-Since-Version` and push conflicts → Action List
    -   [ ] Support notes, tags, titles, collection membership when Local won

16. Validation pass & invariants

-   [ ] `src/modules/validation/Validator.ts` run before/after apply:
    -   [ ] Exactly one canonical ZITEM Rem per item (portals/references allowed)
    -   [ ] No duplicate portals/references under the same parent
    -   [ ] Every item/collection has a valid parent; otherwise attach to Unfiled and emit Action

17. Snapshot manager

-   [ ] `src/modules/snapshots/SnapshotStore.ts` wrapping the shadow copy:
    -   [ ] Schema‑versioned, per‑library; migration hooks
    -   [ ] Continue to keep `fullData` only for audit/debug, not as Local source of truth

18. Minor nits / polish

-   [ ] Migrate setting key: continue reading `multiple-colections-behavior` (typo) but write `multiple-collections-behavior`; migrate silently
-   [ ] Ensure strategy selection uses the new key after migration

Acceptance criteria

-   [ ] Sync works end-to-end with new modules behind a feature flag
-   [ ] Titles/content are written in one place (hydration or minimal hydrator), not during structure updates
-   [ ] No duplicate portals/references for multi-collection items
-   [ ] Logs clearly enumerate actions taken during apply/merge (with debug on)
-   [ ] Unit tests cover merge rules and multi-collection behavior

Phase 2 (after parity)

-   [ ] Implement local-only change detection in diff module
-   [ ] Extend merge to respect `LocallyEditedFields`
-   [ ] Add Zotero write-back functions in `ZoteroAPI` and integrate
