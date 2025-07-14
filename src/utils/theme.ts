import { AppEvents, type RNPlugin } from '@remnote/plugin-sdk';
import { registerIconCSS } from '../services/iconCSS';

export function detectDarkMode(): boolean {
  if (typeof document !== 'undefined' && document.body) {
    const bodyClasses = document.body.className.split(' ');
    if (bodyClasses.includes('dark')) return true;
    if (bodyClasses.includes('light')) return false;
  }

  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return true;
  }

  console.warn(
    'Dark mode detection failed. Defaulting to dark mode.',
    'Consider checking your system settings.',
    "Or use the 'auto-switch-theme' setting in the plugin."
  );
  return true;
}

function citationFinderThemeCSS(dark: boolean): string {
  if (dark) {
    return `#citation-finder-root{background:#2b2b2b;border:1px solid #555;color:#ddd;box-shadow:0 2px 12px rgba(0,0,0,0.5);}\n` +
           `#citation-finder-input{background:#1f1f1f;border:1px solid #555;color:#ddd;}`;
  }
  return `#citation-finder-root{background:#fff;border:1px solid #e0e0e0;color:#222;box-shadow:0 2px 12px rgba(0,0,0,0.08);}\n` +
         `#citation-finder-input{background:#fff;border:1px solid #ccc;color:#222;}`;
}

export async function applyTheme(plugin: RNPlugin, dark: boolean): Promise<void> {
  await registerIconCSS(plugin, dark);
  await plugin.app.registerCSS('citation-finder-theme', citationFinderThemeCSS(dark));
}

export function setupThemeDetection(plugin: RNPlugin): void {
  plugin.event.addListener(AppEvents.setDarkMode, undefined, (dark: boolean) => {
    applyTheme(plugin, dark).catch(() => {});
  });
}
