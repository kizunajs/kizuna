'use client';

import { Tab, Tabs } from 'fumadocs-ui/components/tabs';

interface InstallTabsProps {
    packageName?: string;
    /**
     * Packages that belong in `devDependencies`, chained onto the same command
     * so one tab covers both halves of an install.
     */
    devPackageName?: string;
    /**
     * Render `packageName` as a dev-dependency install too.
     */
    dev?: boolean;
}

/**
 * The dist-tag Kizuna packages install from while 2.0 is in prerelease. Set it
 * to an empty string once 2.0.0 is on `latest`.
 */
const DIST_TAG: string = 'beta';

const isKizuna = (name: string) => name === 'kizunajs' || name.startsWith('@kizunajs/');

/**
 * Tags the Kizuna packages in a command and leaves the rest alone, so `express`
 * beside `@kizunajs/express` is still installed from `latest`.
 */
const tagged = (packages: string) =>
    packages
        .split(' ')
        .map((name) => (DIST_TAG !== '' && isKizuna(name) ? `${name}@${DIST_TAG}` : name))
        .join(' ');

const MANAGERS = [
    {
        id: 'pnpm',
        add: 'pnpm add',
        devFlag: '-D ',
    },
    {
        id: 'bun',
        add: 'bun add',
        devFlag: '-d ',
    },
    {
        id: 'npm',
        add: 'npm install',
        devFlag: '--save-dev ',
    },
];

export function InstallTabs({ packageName, devPackageName, dev = false }: InstallTabsProps) {
    return (
        <Tabs groupId="package-manager" items={MANAGERS.map((manager) => manager.id)}>
            {MANAGERS.map((manager) => {
                const commands = [
                    packageName === undefined ? undefined : `${manager.add} ${dev ? manager.devFlag : ''}${tagged(packageName)}`,
                    devPackageName === undefined ? undefined : `${manager.add} ${manager.devFlag}${tagged(devPackageName)}`,
                ].filter((command) => command !== undefined);

                return (
                    <Tab key={manager.id} value={manager.id}>
                        <pre>
                            <code>{commands.join(' && ')}</code>
                        </pre>
                    </Tab>
                );
            })}
        </Tabs>
    );
}
