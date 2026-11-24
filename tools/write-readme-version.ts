import { readFileSync, writeFileSync } from 'node:fs';
import { defineAfterBump } from '@kizunajs/release';

const npmLink = /https:\/\/www\.npmjs\.com\/package\/kizunajs\/v\/[^)]+/;

export default defineAfterBump(function writeReadmeVersion({ version }) {
    for (const readme of ['README.md', 'packages/core/README.md']) {
        const contents = readFileSync(readme, 'utf8');
        writeFileSync(readme, contents.replace(npmLink, `https://www.npmjs.com/package/kizunajs/v/${version}`));
    }
});
