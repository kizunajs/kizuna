import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { KizunaPreview } from '@kizunajs/cms/next';
import kizuna from '@kizuna-config';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import './globals.css';

const sans = localFont({
    src: './fonts/plus-jakarta-sans-latin.woff2',
    weight: '200 800',
    variable: '--font-sans',
    display: 'swap',
});

export const metadata: Metadata = {
    title: {
        default: 'Hagen',
        template: '%s | Hagen',
    },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en" className={sans.variable}>
            <body>
                <Header />
                {children}
                <Footer />
                <KizunaPreview content={kizuna.content} />
            </body>
        </html>
    );
}
