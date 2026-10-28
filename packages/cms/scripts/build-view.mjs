// Builds the editor a host renders over MCP Apps, and the admin and its sign-in
// screen the CMS serves itself: each one HTML file with its script, styles and font inlined, since a
// host serves a view as one document.
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'tsdown';

const root = fileURLToPath(new URL('..', import.meta.url));
const scratch = `${root}dist/view-build`;

const page = async ({ name, entry, stylesheets, title = 'Kizuna CMS' }) => {
    await build({
        config: false,
        entry: {
            [name]: `${root}${entry}`,
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

    const script = await readFile(`${scratch}/${name}.iife.js`, 'utf8');
    const font = await readFile(`${root}src/view/fonts/plus-jakarta-sans-latin.woff2`);
    const styles = (await Promise.all(stylesheets.map((stylesheet) => readFile(`${root}${stylesheet}`, 'utf8'))))
        .join('\n')
        .replace('__PLUS_JAKARTA_SANS__', font.toString('base64'));

    // The server swaps the placeholder for the site's address when it serves the page.
    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
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
    await writeFile(`${root}dist/views/${name}.html`, html);
    await rm(scratch, {
        recursive: true,
        force: true,
    });
    console.log(`Built dist/views/${name}.html (${Math.round(html.length / 1024)} kB)`);
};

await page({
    name: 'document',
    entry: 'src/view/main.tsx',
    stylesheets: ['src/view/view.css'],
});
await page({
    name: 'admin',
    entry: 'src/admin/main.tsx',
    stylesheets: ['src/view/view.css', 'src/admin/admin.css'],
});
await page({
    name: 'sign-in',
    entry: 'src/admin/sign-in-main.tsx',
    stylesheets: ['src/view/view.css', 'src/admin/sign-in.css'],
    title: 'Sign in · Kizuna CMS',
});
