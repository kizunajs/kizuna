import clsx from 'clsx';
import type { ReactNode } from 'react';
import { DocsMobileNav } from '@/components/docs-shell/docs-mobile-nav';
import { DocsSidebarPanel } from '@/components/docs-shell/docs-sidebar';
import { SiteFooter } from '@/components/landing-page/site-footer';
import { SiteHeader } from '@/components/landing-page/site-header';
import { source } from '@/lib/source';
import styles from './layout.module.css';

export default function Layout({ children }: { children: ReactNode }) {
    return (
        <div className={clsx('kizuna-landing-page', styles.root)}>
            <SiteHeader />
            <DocsMobileNav tree={source.pageTree} />
            <div className={styles.shell}>
                <aside className={styles.sidebar}>
                    <DocsSidebarPanel tree={source.pageTree} />
                </aside>
                <main className={styles.main}>{children}</main>
            </div>
            <SiteFooter />
        </div>
    );
}
