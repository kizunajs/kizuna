import { notFound } from 'next/navigation';
import kizuna from '@kizunajs-demo/sites-content/config';
import { TextPage } from '../../components/TextPage';
import { localeOf } from '../../lib/locale';

const read = async () => {
    const content = kizuna.content.of(['uk', 'norway']);
    if (content.site !== 'norway') notFound();
    return content.pages.shopsPage.get({
        locale: await localeOf(),
    });
};

export async function generateMetadata() {
    return {
        title: (await read()).heading,
    };
}

export default async function ShopsPage() {
    return <TextPage eyebrow="Hagen Norge" page={await read()} />;
}
