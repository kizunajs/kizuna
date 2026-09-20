/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable no-undef */

const { execSync } = require('node:child_process');
const { version } = require('../package.json');

const prerelease = version.includes('-') ? version.split('-')[1].split('.')[0] : undefined;
const tag = prerelease ?? 'latest'; // a prerelease never takes `latest`
const provenance = process.env.CI ? ' --provenance' : ''; // attestation needs the OIDC token a CI run has

console.log(`Publishing ${version} under the "${tag}" tag`);
execSync(`pnpm -r publish --no-git-checks${provenance} --tag ${tag}`, { stdio: 'inherit' });
