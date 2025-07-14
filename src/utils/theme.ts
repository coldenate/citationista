export function detectDarkMode(): boolean {
    if (document && document.body) {
        const classes = document.body.className.split(' ');
        if (classes.includes('dark')) return true;
        if (classes.includes('light')) return false;
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

import { AppEvents, type RNPlugin } from '@remnote/plugin-sdk';

export function setupThemeDetection(plugin: RNPlugin, handler: () => void): void {
    plugin.event.addListener(AppEvents.setDarkMode, undefined, handler);
}
