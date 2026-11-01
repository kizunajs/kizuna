import kizuna from '@kizunajs-demo/sites-content/config';
import { bodyLinkedOf, type BodyText as BodyTextValue } from '@kizunajs-demo/sites-content/body-links';
import { RichText } from '@kizunajs/cms/next';
import { ButtonLink, Callout, Faq, Figure, ImagePair, PlantCard, Prose, PullQuote, RelatedArticle } from '@kizunajs-demo/sites-ui';
import { localeOf } from '../lib/locale';
import { wordsOf } from '../lib/words';

/**
 * The text of an article or a page, with each of its blocks in the site's
 * look and the site's language.
 */
export async function BodyText({ value }: { value: BodyTextValue }) {
    const locale = await localeOf();
    const said = wordsOf(kizuna.content.of(['uk', 'norway']).site, locale);
    const linked = await bodyLinkedOf(value, locale);
    return (
        <Prose>
            <RichText
                value={value}
                blocks={{
                    callout: (block) => <Callout tone={block.tone} label={said[block.tone]} text={block.text} />,
                    pullQuote: (block) => <PullQuote quote={block.quote} person={linked.people.get(block.person)} />,
                    plantCard: (block) => {
                        const plant = linked.plants.get(block.plant);
                        return plant === undefined ? null : (
                            <PlantCard
                                plant={plant}
                                eyebrow={said.fromTheShop}
                                shops={{
                                    href: '/offices',
                                    label: said.findInShops,
                                }}
                            />
                        );
                    },
                    figure: (block) => <Figure image={block.image} caption={block.caption} />,
                    imagePair: (block) => <ImagePair left={block.left} right={block.right} caption={block.caption} />,
                    faq: (block) => <Faq questions={block.questions} />,
                    button: (block) =>
                        block.link.href === null ? null : <ButtonLink href={block.link.href} label={block.link.label ?? block.link.href} />,
                    relatedArticle: (block) => {
                        const article = linked.articles.get(block.article);
                        return article === undefined ? null : <RelatedArticle article={article} eyebrow={said.fromTheJournal} />;
                    },
                }}
            />
        </Prose>
    );
}
