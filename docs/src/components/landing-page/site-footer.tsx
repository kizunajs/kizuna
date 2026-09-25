import Link from 'next/link';
import Logo from '@/icons/Logo.svg';
import { npmUrl } from '@/lib/site';
import styles from './site-footer.module.css';

const columns = [
    {
        title: 'Docs',
        links: [
            {
                label: 'Quickstart',
                href: '/docs/quickstart',
            },
            {
                label: 'Routes',
                href: '/docs/routes',
            },
            {
                label: 'Authentication',
                href: '/docs/authentication',
            },
            {
                label: 'Jobs',
                href: '/docs/jobs',
            },
        ],
    },
    {
        title: 'Generate',
        links: [
            {
                label: 'OpenAPI',
                href: '/docs/openapi',
            },
            {
                label: 'Swift client',
                href: '/docs/clients/swift',
            },
            {
                label: 'Kotlin client',
                href: '/docs/clients/kotlin',
            },
            {
                label: 'MCP endpoint',
                href: '/docs/mcp',
            },
        ],
    },
    {
        title: 'Project',
        links: [
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
                href: 'https://github.com/kizunajs/kizuna/releases',
            },
            {
                label: 'GitHub',
                href: 'https://github.com/kizunajs/kizuna',
            },
            {
                label: 'npm',
                href: npmUrl,
            },
        ],
    },
];

export function SiteFooter() {
    return (
        <footer className={styles.footer}>
            <div className={styles.card}>
                <div className={styles.brand}>
                    <Logo className={styles.logo} />
                    <p className={styles.tagline}>A framework for building fully typed REST APIs in TypeScript.</p>
                    <p className={styles.meta}>Open source under the MIT License.</p>
                </div>

                <nav className={styles.columns} aria-label="Footer">
                    {columns.map((column) => (
                        <div key={column.title}>
                            <p className={styles.columnTitle}>{column.title}</p>
                            <ul className={styles.list}>
                                {column.links.map((link) => (
                                    <li key={link.label}>
                                        {link.href.startsWith('http') ? (
                                            <a href={link.href} className={styles.link} target="_blank" rel="noreferrer">
                                                {link.label}
                                            </a>
                                        ) : (
                                            <Link href={link.href} className={styles.link}>
                                                {link.label}
                                            </Link>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </nav>
            </div>
        </footer>
    );
}
