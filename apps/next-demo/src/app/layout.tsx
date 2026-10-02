import { KizunaPreview } from '@kizunajs/cms/next';
import { Footer } from '../components/Footer';

export const metadata = {
    title: 'Kizuna Next.js Demo',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <body
                style={{
                    margin: 0,
                    fontFamily: 'system-ui',
                }}>
                {children}
                <Footer />
                <KizunaPreview apiPath="/cms-api" basePath="/" signInPath="/login" />
            </body>
        </html>
    );
}
