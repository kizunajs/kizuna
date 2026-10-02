import kizuna from '@kizuna-config';

export async function Footer() {
    const site = await kizuna.content.globals.site.get();

    return (
        <footer
            style={{
                maxWidth: '56rem',
                margin: '4rem auto 0',
                padding: '2rem',
                borderTop: '1px solid #e5e5e5',
                color: '#555',
                fontSize: '0.9rem',
            }}>
            <p>{site.footerText}</p>
            <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>
        </footer>
    );
}
