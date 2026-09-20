/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable no-undef */

const { execSync } = require('node:child_process');
const { version } = require('../package.json');

// `2.0.0-beta.0` publishes under `beta`, so `npm i kizunajs` keeps
// resolving to the last stable release until the prerelease ends.
const prerelease = version.includes('-') ? version.split('-')[1].split('.')[0] : undefined;
const tag = prerelease ?? 'latest';

console.log(`Publishing ${version} under the "${tag}" tag`);
execSync(`pnpm -r publish --no-git-checks --provenance --tag ${tag}`, { stdio: 'inherit' });
