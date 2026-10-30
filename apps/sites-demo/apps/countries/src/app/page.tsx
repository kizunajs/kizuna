import kizuna from '@kizunajs-demo/sites-content/config';

export default async function FrontPage() {
    const page = await kizuna.content.of(['uk', 'norway']).pages.frontPage.get();
    return (
        <main>
            <h1>{page.heading}</h1>
            <p>{page.intro}</p>
        </main>
    );
}
