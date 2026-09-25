import type { Metadata } from 'next';
import clsx from 'clsx';
import { PageHead } from '@/components/landing-page/page-head';
import { Playground } from '@/components/playground/playground';
import styles from '../subpage.module.css';

export const metadata: Metadata = {
    title: 'Playground',
    description: 'Click through a real Kizuna.js API running in your browser, called by the client it generates.',
};

export default function PlaygroundPage() {
    return (
        <div className={clsx(styles.page, styles.tight)}>
            <PageHead
                label="Playground"
                title="Try Kizuna.js in your browser"
                description="Pick a scenario and see the request, the response, and the call in TypeScript, Swift and Kotlin."
            />
            <Playground />
        </div>
    );
}
