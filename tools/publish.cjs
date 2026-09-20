/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable no-undef */

const { execSync } = require('node:child_process');
const { readdirSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const { version } = require('../package.json');

const packagesDirectory = join(__dirname, '..', 'packages');

const publishedPackages = () =>
    readdirSync(packagesDirectory)
        .map((directory) => join(packagesDirectory, directory, 'package.json'))
        .flatMap((manifest) => {
            const { name, private: isPrivate } = JSON.parse(readFileSync(manifest, 'utf8'));
            return isPrivate ? [] : [name];
        });

const prerelease = version.includes('-') ? version.split('-')[1].split('.')[0] : undefined;
const tag = prerelease ?? 'latest';
const provenance = process.env.CI ? ' --provenance' : ''; // attestation needs the OIDC token a CI run has

console.log(`Publishing ${version} under the "${tag}" tag`);
execSync(`pnpm -r publish --no-git-checks${provenance} --tag ${tag}`, { stdio: 'inherit' });

if (prerelease) {
    for (const name of publishedPackages()) {
        console.log(`Pointing ${name} latest at ${version}`);
        execSync(`npm dist-tag add ${name}@${version} latest`, { stdio: 'inherit' }); // npm only stamps `latest` on a first publish
    }
}
