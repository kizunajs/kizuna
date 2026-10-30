import type { ReactNode } from 'react';
import Link from 'next/link';
import './globals.css';

export const metadata = {
    title: {
        default: 'Fieldfare Travel',
        template: '%s | Fieldfare Travel',
    },
    description: 'Garden day trips from London, with Hagen UK.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
    return (
        <html lang="en">
            <body>
                <div className="page">
                    <header className="masthead">
                        <Link className="brand" href="/">
                            Fieldfare Travel
                        </Link>
                        <nav className="nav" aria-label="Main">
                            <Link href="/">Day trips</Link>
                            <Link href="/team">Your hosts</Link>
                        </nav>
                    </header>
                    {children}
                    <footer className="footer">Shop details and hosts come from Hagen UK, and change when Hagen publishes.</footer>
                </div>
            </body>
        </html>
    );
}
