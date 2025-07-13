import './citationFinder.css';
import {
    AppEvents,
    renderWidget,
    useAPIEventListener,
    usePlugin,
    useRunAsync,
    useTracker,
    type WidgetLocation,
} from '@remnote/plugin-sdk';
import * as React from 'react';
import { POPUP_Y_OFFSET, powerupCodes } from '../constants/constants';
import { fetchZoteroBibliography, fetchZoteroCitation } from '../services/citationHelpers';
import { useSyncWidgetPositionWithCaret } from './hooks';

interface ZoteroItem {
    id: string;
    key: string;
    title: string;
}

function CitationFinderWidget() {
    const plugin = usePlugin();

    /* ──────────────────────────────────────────
     * floating-widget context & id
     * ────────────────────────────────────────── */
    const ctx = useRunAsync(
        async () => await plugin.widget.getWidgetContext<WidgetLocation.FloatingWidget>(),
        []
    );
    const floatingWidgetId = ctx?.floatingWidgetId;

    /* ──────────────────────────────────────────
     * initial placement – poll until caret appears
     * ────────────────────────────────────────── */
    useRunAsync(async () => {
        if (!floatingWidgetId) return;

        const cached = (await plugin.storage.getSession('citationFinderInitialPos')) as
            | { x: number; y: number }
            | null;
        if (cached) {
            await plugin.window.setFloatingWidgetPosition(floatingWidgetId, {
                top: cached.y + POPUP_Y_OFFSET,
                left: cached.x,
            });
        }

        let tries = 0;
        const id = window.setInterval(async () => {
            const caret = await plugin.editor.getCaretPosition();
            if (caret) {
                await plugin.window.setFloatingWidgetPosition(floatingWidgetId, {
                    top: caret.y + POPUP_Y_OFFSET,
                    left: caret.x,
                });
                window.clearInterval(id);
            }
            if (++tries > 20) window.clearInterval(id);
        }, 100);
    }, [floatingWidgetId]);

    /* keep following the caret once the user resumes typing */
    useSyncWidgetPositionWithCaret(floatingWidgetId, false);

    /* ─────────────────────────────
     * citation vs bibliography mode
     * ───────────────────────────── */
    const mode = useRunAsync(async () => {
        const m = (await plugin.storage.getSession('citationFinderMode')) as string | undefined;
        return m === 'bib' ? 'bib' : 'citation';
    }, []);

    /* ─────────────────────────────
     * incremental search
     * ───────────────────────────── */
    const [query, setQuery] = React.useState('');
    const results =
        useTracker(
            async (rp) => {
                if (!query.trim()) return [] as ZoteroItem[];

                const token = await rp.richText.text(query).value();
                const hits = await rp.search.search(token, undefined, { numResults: 50 });

                const out: ZoteroItem[] = [];
                for (const r of hits) {
                    if (!(await r.hasPowerup(powerupCodes.ZITEM))) continue;
                    const key = await r.getPowerupProperty(powerupCodes.ZITEM, 'key');
                    const title = await rp.richText.toString(r.text ?? []);
                    if (key && title) out.push({ id: r._id, key: String(key), title: title.trim() });
                }
                return out;
            },
            [query]
        ) ?? [];

    /* ─────────────────────────────
     * hot-key handling
     * ───────────────────────────── */
    const STEAL = ['down', 'up', 'enter', 'tab', 'escape', 'ArrowDown', 'ArrowUp'];

    React.useEffect(() => {
        if (!floatingWidgetId) return;
        plugin.window.stealKeys(floatingWidgetId, STEAL);
        return () => {
            plugin.window.releaseKeys(floatingWidgetId, STEAL);
        };
    }, [floatingWidgetId, plugin]);

    const [selectedIdx, setSelectedIdx] = React.useState(0);
    React.useEffect(() => setSelectedIdx(0), []);

    useAPIEventListener(AppEvents.StealKeyEvent, floatingWidgetId, ({ key }) => {
        const k = key.toLowerCase();
        if (k === 'arrowdown' || k === 'down')
            setSelectedIdx((i) => Math.min(i + 1, results.length - 1));
        else if (k === 'arrowup' || k === 'up') setSelectedIdx((i) => Math.max(i - 1, 0));
        else if (k === 'enter' || k === 'tab') confirmSelection();
        else if (k === 'escape') floatingWidgetId && plugin.window.closeFloatingWidget(floatingWidgetId);
    });

    /* ─────────────────────────────
     * insert, close, focus
     * ───────────────────────────── */
    async function confirmSelection() {
        const sel = results[selectedIdx];
        if (!sel) return;

        if (floatingWidgetId) plugin.window.closeFloatingWidget(floatingWidgetId);

        const text =
            mode === 'bib'
                ? await fetchZoteroBibliography(plugin, sel.key)
                : await fetchZoteroCitation(plugin, sel.key);

        if (text) await plugin.editor.insertPlainText(text);
    }

    /* ─────────────────────────────
     * render UI
     * ───────────────────────────── */
    return (
        <div id="citation-finder-root">
            <input
                className="citation-finder-input"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search Zotero items…"
            />

            {results.length > 0 && (
                <div className="citation-finder-results">
                    {results.map((it, idx) => (
                        <button
                            key={it.id}
                            type="button"
                            className={`citation-finder-item${idx === selectedIdx ? ' selected' : ''}`}
                            onMouseEnter={() => setSelectedIdx(idx)}
                            onClick={() => {
                                setSelectedIdx(idx);
                                confirmSelection();
                            }}
                            tabIndex={-1}
                        >
                            {it.title}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

renderWidget(CitationFinderWidget);

