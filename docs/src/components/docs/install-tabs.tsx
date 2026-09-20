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
                    packageName === undefined ? undefined : `${manager.add} ${dev ? manager.devFlag : ''}${packageName}`,
                    devPackageName === undefined ? undefined : `${manager.add} ${manager.devFlag}${devPackageName}`,
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
