import { KizunaPreview } from '@kizunajs/cms/next';

export default function NotFound() {
    return (
        <main
            style={{
                padding: '2rem',
                maxWidth: '40rem',
                margin: '0 auto',
            }}>
            <h1>Not found</h1>
            <p>There is nothing here yet.</p>
            <KizunaPreview apiPath="/cms-api" basePath="/" signInPath="/login" />
        </main>
    );
}
