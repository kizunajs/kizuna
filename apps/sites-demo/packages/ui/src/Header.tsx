import Link from 'next/link';

export interface HeaderLink {
    label: string;
    href: string;
}

/**
 * The site's name and menu, at the top of every page.
 */
export function Header({ label, icon, links }: { label: string; icon: string; links: HeaderLink[] }) {
    return (
        <header>
            <Link href="/">
                <img src={icon} alt="" width={28} height={28} />
                {label}
            </Link>
            <nav>
                <ul>
                    {links.map((link) => (
                        <li key={link.href}>
                            <a href={link.href}>{link.label}</a>
                        </li>
                    ))}
                </ul>
            </nav>
        </header>
    );
}
