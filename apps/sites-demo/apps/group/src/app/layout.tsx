import type { Metadata } from 'next';
import { KizunaPreview } from '@kizunajs/cms/next';
import kizuna from '@kizunajs-demo/sites-content/config';
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
    const navigation = await kizuna.content.of(['group']).globals.navigation.get();
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
                    links={navigation.footer.map((link) => ({
                        label: link.label ?? '',
                        href: link.href,
                    }))}
                />
                <KizunaPreview content={kizuna.content} />
            </body>
        </html>
    );
}
