import './citationFinderWidget.css';
import {
  AppEvents,
  renderWidget,
  useAPIEventListener,
  usePlugin,
  useRunAsync,
  WidgetLocation,
} from '@remnote/plugin-sdk';
import * as React from 'react';
import { powerupCodes, POPUP_Y_OFFSET } from '../constants/constants';
import { fetchZoteroCitation, fetchZoteroBibliography } from '../services/citationHelpers';
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

  const items = useRunAsync(async () => {
    const powerup = await plugin.powerup.getPowerupByCode(powerupCodes.ZITEM);
    if (!powerup) return [] as ZoteroItem[];
    const rems = (await powerup.taggedRem()) || [];
    const arr: ZoteroItem[] = [];
    for (const r of rems) {
      if (await r.isPowerup()) continue;
      const key = await r.getPowerupProperty(powerupCodes.ZITEM, 'key');
      const text = await plugin.richText.toMarkdown(await r.text ?? []);
      if (key && text) arr.push({ id: r._id, key: String(key), title: text.trim() });
    }
    return arr;
  }, []);

  const [query, setQuery] = React.useState('');
  const [selectedIdx, setSelectedIdx] = React.useState(0);

  const matches = React.useMemo(() => {
    if (!items) return [] as ZoteroItem[];
    const q = query.toLowerCase();
    return items.filter((it) => it.title.toLowerCase().includes(q));
  }, [items, query]);

  const hidden = matches.length === 0 && query.length === 0;
  const floatingWidgetId = ctx?.floatingWidgetId;
  useSyncWidgetPositionWithCaret(floatingWidgetId, hidden);

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
    if (key === 'ArrowDown') select(1);
    else if (key === 'ArrowUp') select(-1);
    else if (key === 'Enter') confirmSelection();
    else if (key === 'Escape') floatingWidgetId && plugin.window.closeFloatingWidget(floatingWidgetId);
  });

  React.useEffect(() => {
    if (!hidden) setSelectedIdx(0);
  }, [query]);

  function select(delta: number) {
    const newIdx = selectedIdx + delta;
    if (newIdx >= 0 && newIdx < matches.length) setSelectedIdx(newIdx);
  }

  async function confirmSelection() {
    const sel = matches[selectedIdx];
    if (!sel) return;
    const text =
      mode === 'bib'
        ? await fetchZoteroBibliography(plugin, sel.key)
        : await fetchZoteroCitation(plugin, sel.key);
    if (text) {
      await plugin.editor.insertPlainText(text);
    }
    if (floatingWidgetId) await plugin.window.closeFloatingWidget(floatingWidgetId);
  }

  return (
    <div id="citation-finder-root" className={hidden ? 'hidden' : ''}>
      <input
        className="citation-finder-input"
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search Zotero Items..."
      />
      <div className="citation-finder-results">
        {matches.map((it, idx) => (
          <div
            key={it.id}
            className={`citation-finder-item${idx === selectedIdx ? ' selected' : ''}`}
            onMouseEnter={() => setSelectedIdx(idx)}
            onClick={() => {
              setSelectedIdx(idx);
              confirmSelection();
            }}
          >
            {it.title}
          </div>
        ))}
      </div>
    </div>
  );
}

renderWidget(CitationFinderWidget);
