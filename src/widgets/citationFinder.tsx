/*  src/widgets/citationFinder.tsx  */
import './citationFinder.css';
import {
        renderWidget,
        usePlugin,
        useRunAsync,
        useTracker,
        useAPIEventListener,
        AppEvents,
        type WidgetLocation,
} from '@remnote/plugin-sdk';
import * as React from 'react';
import { powerupCodes } from '../constants/constants';
import { fetchZoteroBibliography, fetchZoteroCitation } from '../services/citationHelpers';

interface ZoteroItem {
        id: string;
        key: string;
        title: string;
}

const HOTKEYS = ['down', 'up', 'enter', 'tab'];

function CitationFinderWidget() {
	const plugin = usePlugin();

	/* floating-widget context (needed only for close) */
	const ctx = useRunAsync(
		async () => await plugin.widget.getWidgetContext<WidgetLocation.FloatingWidget>(),
		[]
	);
        const wid = ctx?.floatingWidgetId;

        React.useEffect(() => {
                if (!wid) return;
                plugin.window.stealKeys(wid, HOTKEYS);
                return () => {
                        plugin.window.releaseKeys(wid, HOTKEYS);
                };
        }, [wid]);

	/* citation vs bibliography mode (set by the command) */
	const mode = useRunAsync(async () => {
		const m = (await plugin.storage.getSession('citationFinderMode')) as string | undefined;
		return m === 'bib' ? 'bib' : 'citation';
	}, []);

        /* search */
        const [query, setQuery] = React.useState('');
        const [selIdx, setSel] = React.useState(0);
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
					if (key && title)
						out.push({ id: r._id, key: String(key), title: title.trim() });
				}
				return out;
			},
                        [query]
                ) ?? [];

        React.useEffect(() => {
                setSel((i) => Math.min(i, results.length - 1));
        }, [results.length]);

        useAPIEventListener(AppEvents.StealKeyEvent, wid, ({ key }) => {
                if (key === 'down') setSel((i) => Math.min(i + 1, results.length - 1));
                if (key === 'up') setSel((i) => Math.max(i - 1, 0));
                if (key === 'enter' || key === 'tab') choose(selIdx);
        });

	/* click → insert & close */
        async function choose(i: number) {
                const sel = results[i];
                if (!sel) return;

                wid && plugin.window.closeFloatingWidget(wid);

                const txt =
                        mode === 'bib'
                                ? await fetchZoteroBibliography(plugin, sel.key)
                                : await fetchZoteroCitation(plugin, sel.key);

                if (txt) await plugin.editor.insertPlainText(txt);
        }

	/* UI */
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
                                                        className={`citation-finder-item ${selIdx === idx ? 'selected' : ''}`}
                                                        onClick={() => choose(idx)}
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
