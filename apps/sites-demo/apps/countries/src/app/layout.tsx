import type { Metadata } from 'next';
import { KizunaPreview } from '@kizunajs/cms/next';
import kizuna from '@kizunajs-demo/sites-content/config';
import { sites } from '@kizunajs-demo/sites-content';
import { Footer, Header, type HeaderLink } from '@kizunajs-demo/sites-ui';
import '@kizunajs-demo/sites-ui/globals.css';
import { words } from '../lib/words';

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
    const content = kizuna.content.of(['uk', 'norway']);
    const site = await kizuna.content.site.get();
    const said = words[content.site];
    const links: HeaderLink[] = [
        {
            label: said.shops,
            href: '/offices',
        },
    ];
    if (content.site === 'uk') {
        links.unshift({
            label: said.events,
            href: '/events',
        });
    }
    return (
        <html lang={site.locales?.[0] ?? 'en'}>
            <body>
                <Header label={site.label} icon={site.icon} links={links} />
                {children}
                <Footer
                    companyName={site.companyName}
                    links={[
                        {
                            label: said.group,
                            href: sites.values.group.url,
                        },
                        {
                            label: said.privacy,
                            href: '/privacy',
                        },
                    ]}
                />
                <KizunaPreview content={kizuna.content} />
            </body>
        </html>
    );
}
