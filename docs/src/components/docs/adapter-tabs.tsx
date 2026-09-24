'use client';

import { Tab, Tabs } from 'fumadocs-ui/components/tabs';
import { CodeWindow } from '@/components/code/code-window';
import { InstallTabs } from './install-tabs';
import styles from './adapter-tabs.module.css';

interface AdapterTabsProps {
    functionName: string;
    adapters?: Array<string | { label: string; package: string }>;
    showInstall?: boolean;
}

const adapterPackages: Record<string, string> = {
    Express: '@kizunajs/express',
    Fastify: '@kizunajs/fastify',
    Hono: '@kizunajs/hono',
    'Next.js': '@kizunajs/next',
};

function resolveAdapter(adapter: string | { label: string; package: string }) {
    if (typeof adapter === 'string') {
        return {
            label: adapter,
            package: adapterPackages[adapter],
        };
    }
    return adapter;
}

export function AdapterTabs({ functionName, adapters = ['Express', 'Fastify', 'Hono', 'Next.js'], showInstall = true }: AdapterTabsProps) {
    const resolved = adapters.map(resolveAdapter);
    return (
        <Tabs groupId="adapter" items={resolved.map((adapter) => adapter.label)}>
            {resolved.map((adapter) => (
                <Tab key={adapter.label} value={adapter.label}>
                    {showInstall ? (
                        <div className={styles.install}>
                            <InstallTabs packageName={adapter.package} />
                            <CodeWindow lang="ts" code={`import { ${functionName} } from '${adapter.package}';`} />
                        </div>
                    ) : (
                        <CodeWindow lang="ts" code={`import { ${functionName} } from '${adapter.package}';`} />
                    )}
                </Tab>
            ))}
        </Tabs>
    );
}
