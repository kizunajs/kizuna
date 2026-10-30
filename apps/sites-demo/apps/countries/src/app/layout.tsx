import type { Metadata } from 'next';
import { KizunaPreview } from '@kizunajs/cms/next';
import kizuna from '@kizunajs-demo/sites-content/config';
import { Footer, Header, type HeaderLink } from '@kizunajs-demo/sites-ui';

export async function generateMetadata(): Promise<Metadata> {
    const site = await kizuna.content.site.get();
    return {
        title: {
            default: site.label,
            template: `%s | ${site.label}`,
        },
        icons: {
            icon: site.icon,
        },
    };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
    const site = await kizuna.content.site.get();
    const links: HeaderLink[] = [
        {
            label: 'Shops',
            href: '/offices',
        },
    ];
    if (site.key === 'uk') {
        links.unshift({
            label: 'Events',
            href: '/events',
        });
    }
    return (
        <html lang={site.locales?.[0] ?? 'en'}>
            <body>
                <Header label={site.label} icon={site.icon} links={links} />
                {children}
                <Footer companyName={site.companyName} />
                <KizunaPreview content={kizuna.content} />
            </body>
        </html>
    );
}
