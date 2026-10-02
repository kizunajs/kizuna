import { cms } from './cms';

export default async function FrontPage() {
    const page = await cms.pages.frontPage.get();
    const { hero } = await cms.pages.frontPage.get();
    return (
        <main>
            <div dangerouslySetInnerHTML={{ __html: page.hero.heading }} />
            <div dangerouslySetInnerHTML={{ __html: hero.body }} />
            <p>{page.hero.heading}</p>
        </main>
    );
}
