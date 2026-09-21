#!/usr/bin/env node
/**
 * Scaffold a view module: `pnpm --filter @web-plugins/views new <name>`.
 *
 * Vite picks the folder up on its own (any directory with an `index.html` is an
 * entry), so this only writes files — there is no registry to edit.
 */
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const raw = process.argv[2];
if (!raw) {
  console.error('usage: pnpm --filter @web-plugins/views new <module-name>');
  process.exit(1);
}

const name = raw
  .toLowerCase()
  .replace(/[^a-z0-9-]/g, '-')
  .replace(/^-+|-+$/g, '');
if (!name) {
  console.error(`"${raw}" leaves nothing usable as a folder name`);
  process.exit(1);
}

const dir = join(root, name);
if (existsSync(dir)) {
  console.error(`${name}/ already exists`);
  process.exit(1);
}

const Pascal = name
  .split('-')
  .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
  .join('');

const title = Pascal.replace(/([a-z])([A-Z])/g, '$1 $2');

const files = {
  'index.html': `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>${title}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
`,

  'main.tsx': `import { mount } from '../shared/mount';
import { ${Pascal}, type ${Pascal}View } from './${Pascal}';

mount<${Pascal}View>(${Pascal});
`,

  [`${Pascal}.tsx`]: `import type { ModuleProps } from '../shared/mount';
import { Body, ConfigPreview, Header, Screen, Stack } from '../shared/ui';

/** \`view\` for the \`${name}\` template. Mirror your template's schema here. */
export interface ${Pascal}View {
  headline?: string;
}

export function ${Pascal}({ view, client }: ModuleProps<${Pascal}View>) {
  return (
    <Screen>
      <Header title={view.headline ?? '${title}'} onClose={() => void client.close()} />
      <Body>
        <Stack>
          <p class="muted">Config for this widget:</p>
          <ConfigPreview value={view} />
        </Stack>
      </Body>
    </Screen>
  );
}
`,
};

mkdirSync(dir, { recursive: true });
for (const [file, contents] of Object.entries(files)) {
  writeFileSync(join(dir, file), contents);
}

console.log(`Created ${name}/ with ${Object.keys(files).join(', ')}

Next:
  1. add a template in apps/server/src/db/templates.ts with src: viewUrl('${name}')
  2. pnpm db:seed, then create a widget from it in the panel

Dev URL: http://localhost:5175/${name}/`);
