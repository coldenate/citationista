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
import { powerupCodes } from '../constants/constants';
import { fetchZoteroBibliography, fetchZoteroCitation } from '../services/citationHelpers';
import { useSyncWidgetPositionWithCaret } from './hooks';

interface ZoteroItem {
id: string;
key: string;
title: string;
}

function CitationFinderWidget() {
const plugin = usePlugin();

const ctx = useRunAsync(
async () => await plugin.widget.getWidgetContext<WidgetLocation.FloatingWidget>(),
[]
);

const mode = useRunAsync(async () => {
const m = (await plugin.storage.getSession('citationFinderMode')) as string | undefined;
return m === 'bib' ? 'bib' : 'citation';
}, []);

const [query, setQuery] = React.useState('');
const results =
useTracker(
async (rp) => {
if (!query.trim()) return [] as ZoteroItem[];

const token = await rp.richText.text(query).value();
const remHits = await rp.search.search(token, undefined, {
numResults: 50,
});

const out: ZoteroItem[] = [];
for (const r of remHits) {
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

const floatingWidgetId = ctx?.floatingWidgetId;
const hidden = results.length === 0 && query.length === 0;

useSyncWidgetPositionWithCaret(floatingWidgetId, hidden);

const [selectedIdx, setSelectedIdx] = React.useState(0);

React.useEffect(() => {
const keys = ['ArrowDown', 'ArrowUp', 'Enter', 'Escape'];
if (!floatingWidgetId) return;
if (!hidden) {
plugin.window.stealKeys(floatingWidgetId, keys);
} else {
plugin.window.releaseKeys(floatingWidgetId, keys);
}
}, [hidden, floatingWidgetId, plugin]);

useAPIEventListener(AppEvents.StealKeyEvent, floatingWidgetId, ({ key }) => {
if (key === 'ArrowDown') setSelectedIdx((i) => Math.min(i + 1, results.length - 1));
else if (key === 'ArrowUp') setSelectedIdx((i) => Math.max(i - 1, 0));
else if (key === 'Enter') confirmSelection();
else if (key === 'Escape')
floatingWidgetId && plugin.window.closeFloatingWidget(floatingWidgetId);
});

React.useEffect(() => {
if (!hidden) setSelectedIdx(0);
}, [hidden]);

async function confirmSelection() {
const sel = results[selectedIdx];
if (!sel) return;

const text =
mode === 'bib'
? await fetchZoteroBibliography(plugin, sel.key)
: await fetchZoteroCitation(plugin, sel.key);

if (text) await plugin.editor.insertPlainText(text);
floatingWidgetId && (await plugin.window.closeFloatingWidget(floatingWidgetId));
}

return (
<div id="citation-finder-root" className={hidden ? 'hidden' : ''}>
<input
className="citation-finder-input"
value={query}
onChange={(e) => setQuery(e.target.value)}
placeholder="Search Zotero items…"
/>
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
onKeyDown={(e) => {
if (e.key === 'Enter' || e.key === ' ') {
setSelectedIdx(idx);
confirmSelection();
}
}}
tabIndex={0}
style={{
width: '100%',
textAlign: 'left',
background: 'none',
border: 'none',
padding: 0,
}}
>
{it.title}
</button>
))}
</div>
</div>
);
}

renderWidget(CitationFinderWidget);
