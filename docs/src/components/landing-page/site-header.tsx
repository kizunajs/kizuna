'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type MouseEvent } from 'react';
import { ArrowUpRight, ChevronRight, Menu, X } from 'lucide-react';
import Logo from '@/icons/Logo.svg';
import GithubIcon from '@/icons/Github.svg';
import { ButtonLink } from '@/components/ui/button';
import { SearchButton } from './search-button';
import { npmUrl } from '@/lib/site';
import styles from './site-header.module.css';

type NavigationItem = {
    label: string;
    href: string;
};

const GITHUB_URL = 'https://github.com/kizunajs/kizuna';

const navigation: NavigationItem[] = [
    {
        label: 'Docs',
        href: '/docs',
    },
    {
        label: 'Reference',
        href: '/docs/reference',
    },
    {
        label: 'Playground',
        href: '/playground',
    },
    {
        label: 'About',
        href: '/about',
    },
    {
        label: 'FAQ',
        href: '/faq',
    },
    {
        label: 'Releases',
        href: `${GITHUB_URL}/releases`,
    },
];

const menuExtras: NavigationItem[] = [
    {
        label: 'GitHub',
        href: GITHUB_URL,
    },
    {
        label: 'npm',
        href: npmUrl,
    },
];

function isExternal(item: NavigationItem) {
    return item.href.startsWith('http');
}

function isWithin(pathname: string, prefix: string) {
    return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * `/docs/reference` sits inside both Docs and Reference, so the item with the
 * longest matching href is the one marked current.
 */
function currentItem(pathname: string) {
    let current: NavigationItem | undefined;
    for (const item of navigation) {
        if (isExternal(item) || !isWithin(pathname, item.href)) continue;
        if (!current || item.href.length > current.href.length) current = item;
    }
    return current;
}

export function SiteHeader() {
    const pathname = usePathname();
    const [scrolled, setScrolled] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const [pendingHref, setPendingHref] = useState<string | null>(null);

    useEffect(() => {
        const update = () => setScrolled(window.scrollY > 4);
        update();
        window.addEventListener('scroll', update, {
            passive: true,
        });
        return () => window.removeEventListener('scroll', update);
    }, []);

    useEffect(() => {
        setMenuOpen(false);
        setPendingHref(null);
    }, [pathname]);

    function isActive(item: NavigationItem) {
        return pendingHref ? pendingHref === item.href : currentItem(pathname) === item;
    }

    function followLink(event: MouseEvent, href: string) {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
        setPendingHref(href);
    }

    useEffect(() => {
        if (!menuOpen) return;

        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setMenuOpen(false);
        };
        const closeOnDesktop = (event: MediaQueryListEvent) => {
            if (event.matches) setMenuOpen(false);
        };
        const desktop = window.matchMedia('(min-width: 768px)');
        const root = document.documentElement;
        root.style.overflow = 'hidden';
        window.addEventListener('keydown', closeOnEscape);
        desktop.addEventListener('change', closeOnDesktop);
        return () => {
            root.style.overflow = '';
            window.removeEventListener('keydown', closeOnEscape);
            desktop.removeEventListener('change', closeOnDesktop);
        };
    }, [menuOpen]);

    return (
        <header className={styles.header} data-scrolled={scrolled ? '' : undefined}>
            <div className={styles.inner}>
                <div className={styles.start}>
                    <Link href="/" className={styles.logoLink} aria-label="Kizuna home">
                        <Logo className={styles.logo} />
                    </Link>

                    <nav className={styles.nav} aria-label="Main">
                        {navigation.map((item) =>
                            isExternal(item) ? (
                                <a key={item.label} href={item.href} className={styles.link} target="_blank" rel="noreferrer">
                                    {item.label}
                                    <ArrowUpRight className={styles.externalIcon} aria-hidden />
                                </a>
                            ) : (
                                <Link
                                    key={item.label}
                                    href={item.href}
                                    className={styles.link}
                                    aria-current={isActive(item) ? 'page' : undefined}
                                    onClick={(event) => followLink(event, item.href)}>
                                    {item.label}
                                </Link>
                            )
                        )}
                    </nav>
                </div>

                <div className={styles.end}>
                    <SearchButton />

                    <a href={GITHUB_URL} className={styles.iconButton} target="_blank" rel="noreferrer" aria-label="Kizuna on GitHub">
                        <GithubIcon className={styles.githubIcon} />
                    </a>

                    <ButtonLink href="/docs/quickstart" size="small" className={styles.cta}>
                        Get started
                    </ButtonLink>

                    <button
                        type="button"
                        className={clsx(styles.iconButton, styles.menuButton)}
                        aria-expanded={menuOpen}
                        aria-controls="site-menu"
                        aria-label={menuOpen ? 'Close menu' : 'Open menu'}
                        onClick={() => setMenuOpen((open) => !open)}>
                        {menuOpen ? <X className={styles.toggleIcon} aria-hidden /> : <Menu className={styles.toggleIcon} aria-hidden />}
                    </button>
                </div>
            </div>

            <div className={styles.menuLayer} data-open={menuOpen ? '' : undefined} inert={!menuOpen}>
                <div className={styles.scrim} aria-hidden onClick={() => setMenuOpen(false)} />
                <div id="site-menu" className={styles.menu}>
                    <nav className={styles.menuGroup} aria-label="Main">
                        {navigation
                            .filter((item) => !isExternal(item))
                            .map((item) => (
                                <Link
                                    key={item.label}
                                    href={item.href}
                                    className={styles.menuLink}
                                    aria-current={currentItem(pathname) === item ? 'page' : undefined}
                                    onClick={() => setMenuOpen(false)}>
                                    {item.label}
                                    <ChevronRight className={styles.menuIcon} aria-hidden />
                                </Link>
                            ))}
                    </nav>
                    <div className={styles.menuGroup}>
                        {[...navigation, ...menuExtras].filter(isExternal).map((item) => (
                            <a key={item.label} href={item.href} className={styles.menuLink} target="_blank" rel="noreferrer">
                                {item.label}
                                <ArrowUpRight className={styles.menuIcon} aria-hidden />
                            </a>
                        ))}
                    </div>
                    <ButtonLink href="/docs/quickstart" className={styles.menuCta} onClick={() => setMenuOpen(false)}>
                        Get started
                    </ButtonLink>
                </div>
            </div>
        </header>
    );
}
