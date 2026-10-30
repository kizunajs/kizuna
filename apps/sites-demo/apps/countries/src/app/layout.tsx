import type { Metadata } from 'next';
import { KizunaPreview } from '@kizunajs/cms/next';
import kizuna from '@kizunajs-demo/sites-content/config';
import { sites } from '@kizunajs-demo/sites-content';
import { Footer, Header, type HeaderLink } from '@kizunajs-demo/sites-ui';
import '@kizunajs-demo/sites-ui/globals.css';
import { wordsOf } from '../lib/words';
import { localeOf } from '../lib/locale';
import { pathIn } from '../lib/languages';

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
    const locale = await localeOf();
    const said = wordsOf(content.site, locale);
    const links: HeaderLink[] = [
        {
            label: said.journal,
            href: pathIn(locale, '/journal'),
        },
        {
            label: said.shops,
            href: pathIn(locale, '/offices'),
        },
    ];
    if (content.site === 'uk') {
        links.unshift({
            label: said.events,
            href: pathIn(locale, '/events'),
        });
    }
    return (
        <html lang={locale}>
            <body>
                <Header label={site.label} icon={site.icon} home={pathIn(locale, '/')} links={links} />
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
                            href: pathIn(locale, '/privacy'),
                        },
                    ]}
                />
                <KizunaPreview content={kizuna.content} />
            </body>
        </html>
    );
}
