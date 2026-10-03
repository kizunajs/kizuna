// Builds the editor a host renders over MCP Apps: one HTML file with its
// script, styles and font inlined, since a host serves a view as one document.
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'tsdown';

const root = fileURLToPath(new URL('..', import.meta.url));
const scratch = `${root}dist/view-build`;
const output = `${root}dist/views/document.html`;

await build({
    config: false,
    entry: {
        document: `${root}src/view/main.tsx`,
    },
    outDir: scratch,
    platform: 'browser',
    format: 'iife',
    target: 'es2022',
    minify: true,
    dts: false,
    clean: true,
    tsconfig: `${root}tsconfig.json`,
    define: {
        'process.env.NODE_ENV': JSON.stringify('production'),
    },
    deps: {
        alwaysBundle: [/.*/],
        onlyBundle: false,
    },
    logLevel: 'warn',
});

const script = await readFile(`${scratch}/document.iife.js`, 'utf8');
const font = await readFile(`${root}src/view/fonts/plus-jakarta-sans-latin.woff2`);
const styles = (await readFile(`${root}src/view/view.css`, 'utf8')).replace('__PLUS_JAKARTA_SANS__', font.toString('base64'));

// The server swaps the placeholder for the site's address when it serves the page.
const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Kizuna CMS</title>
<style>${styles}</style>
<script id="kizuna-cms-config" type="application/json">"__KIZUNA_CMS_VIEW_CONFIG__"</script>
</head>
<body>
<div id="root"></div>
<script>${script.replaceAll('</script', '<\\/script')}</script>
</body>
</html>
`;

await mkdir(`${root}dist/views`, {
    recursive: true,
});
await writeFile(output, page);
await rm(scratch, {
    recursive: true,
    force: true,
});
console.log(`Built the editor: dist/views/document.html (${Math.round(page.length / 1024)} kB)`);
