import type { Metadata } from 'next';
import { KizunaPreview } from '@kizunajs/cms/next';
import kizuna from '@kizunajs-demo/sites-content/config';
import { sites } from '@kizunajs-demo/sites-content';
import { Footer, Header } from '@kizunajs-demo/sites-ui';
import '@kizunajs-demo/sites-ui/globals.css';

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
    return (
        <html lang={site.locales?.[0] ?? 'en'}>
            <body>
                <Header
                    label={site.label}
                    icon={site.icon}
                    links={[
                        {
                            label: 'About',
                            href: '/about',
                        },
                        {
                            label: 'Shops',
                            href: '/offices',
                        },
                        {
                            label: 'Journal',
                            href: '/journal',
                        },
                        {
                            label: 'People',
                            href: '/team',
                        },
                    ]}
                />
                {children}
                <Footer
                    companyName={site.companyName}
                    links={[
                        {
                            label: sites.values.uk.label,
                            href: sites.values.uk.url,
                        },
                        {
                            label: sites.values.norway.label,
                            href: sites.values.norway.url,
                        },
                        {
                            label: 'Privacy policy',
                            href: '/privacy',
                        },
                    ]}
                />
                <KizunaPreview content={kizuna.content} />
            </body>
        </html>
    );
}
