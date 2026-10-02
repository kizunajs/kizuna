import { cms } from './cms';

export default async function SpringPage() {
    const page = await cms.pages.springPage.get();
    const { hero } = await cms.pages.springPage.get();
    return (
        <main>
            <div dangerouslySetInnerHTML={{ __html: page.hero.heading }} />
            <div dangerouslySetInnerHTML={{ __html: hero.body }} />
            <p>{page.hero.heading}</p>
        </main>
    );
}
