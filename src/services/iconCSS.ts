import type { RNPlugin } from '@remnote/plugin-sdk';

const iconTagMap: Record<string, string> = {
  'zitem': 'book',
  'book-citationista': 'book',
  'dictionaryentry-citationista': 'book',
};

function generateCSS(): string {
  let css = '/* Citationista icon overrides */\n';
  for (const [tag, base] of Object.entries(iconTagMap)) {
    const dark = `icons/${base}-dark.svg`;
    const light = `icons/${base}-light.svg`;
    css += `[data-rem-tags~="${tag}"] .rem-bullet__core {\n`;
    css += `  -webkit-mask: url("${dark}") center/contain no-repeat;\n`;
    css += `  mask: url("${dark}") center/contain no-repeat;\n`;
    css += `  background-color: currentColor;\n`;
    css += `}\n`;
    css += `@media (prefers-color-scheme: light) {\n`;
    css += `  [data-rem-tags~="${tag}"] .rem-bullet__core {\n`;
    css += `    -webkit-mask-image: url("${light}");\n`;
    css += `    mask-image: url("${light}");\n`;
    css += `  }\n`;
    css += `}\n`;
  }
  return css;
}

export async function registerIconCSS(plugin: RNPlugin) {
  const css = generateCSS();
  await plugin.app.registerCSS('citationista-icons', css);
}
