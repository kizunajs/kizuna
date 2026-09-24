/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable no-undef */

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const rootPackage = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = rootPackage.version;

const packagesDirectory = path.join(root, 'packages');

for (const name of fs.readdirSync(packagesDirectory)) {
    const packageJsonPath = path.join(packagesDirectory, name, 'package.json');

    if (!fs.existsSync(packageJsonPath)) {
        continue;
    }

    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    packageJson.version = version;
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
}

const npmLink = /https:\/\/www\.npmjs\.com\/package\/kizunajs\/v\/[^)]+/;

for (const readme of ['README.md', path.join('packages', 'core', 'README.md')]) {
    const readmePath = path.join(root, readme);
    const contents = fs.readFileSync(readmePath, 'utf8');
    fs.writeFileSync(readmePath, contents.replace(npmLink, `https://www.npmjs.com/package/kizunajs/v/${version}`));
}

const sitePath = path.join(root, 'docs', 'src', 'lib', 'site.ts');
const site = fs.readFileSync(sitePath, 'utf8');
fs.writeFileSync(
    sitePath,
    site.replace(/export const npmUrl = '[^']*';/, `export const npmUrl = 'https://www.npmjs.com/package/kizunajs/v/${version}';`)
);

console.log(`Synced version ${version} to all packages`);
