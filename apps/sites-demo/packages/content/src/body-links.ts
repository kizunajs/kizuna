import type { Output } from '@kizunajs/cms';
import type { Articles } from './articles';
import type { Employees } from './employees';
import type { Products } from './products';

/**
 * The text of an article or a page as a page reads it.
 */
export type BodyText = Output<typeof Articles>['body'];

/**
 * The people, plants and articles a text's blocks name, by id, which the page
 * reads what it shows of them from.
 */
export interface BodyLinked {
    people: ReadonlyMap<string, Output<typeof Employees>>;
    plants: ReadonlyMap<string, Output<typeof Products>>;
    articles: ReadonlyMap<string, Output<typeof Articles>>;
}

/**
 * The people, plants and articles a text's blocks name, read the way the page
 * reads them, so Live Preview shows their drafts.
 */
export const bodyLinkedOf = async (body: BodyText, locale?: string): Promise<BodyLinked> => {
    const people = body.flatMap((node) => (node._type === 'pullQuote' ? [node.person] : []));
    const plants = body.flatMap((node) => (node._type === 'plantCard' ? [node.plant] : []));
    const articles = body.flatMap((node) => (node._type === 'relatedArticle' ? [node.article] : []));
    // The config holds the articles, so it loads once a text renders rather than with this file.
    const { default: kizuna } = await import('../kizuna.cms.config');
    const collections = kizuna.content.collections;
    const [foundPeople, foundPlants, foundArticles] = await Promise.all([
        people.length === 0
            ? []
            : collections.employees.getMany({
                  ids: people,
                  locale,
              }),
        plants.length === 0
            ? []
            : collections.products.getMany({
                  ids: plants,
                  locale,
              }),
        articles.length === 0
            ? []
            : collections.articles.getMany({
                  ids: articles,
                  locale,
              }),
    ]);
    return {
        people: new Map(foundPeople.map((person) => [person.id, person])),
        plants: new Map(foundPlants.map((plant) => [plant.id, plant])),
        articles: new Map(foundArticles.map((article) => [article.id, article])),
    };
};
