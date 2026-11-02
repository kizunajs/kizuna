import { formatRef, type CmsService } from '@kizunajs/cms';
import { nils } from './seed-content';

const OLD_ADDRESS = '/journal/vinterstell-av-stueplanter';

/**
 * The winter care article's old Norwegian address, from when the journal
 * named articles by their title, which now redirects to the article wherever
 * it is served. Written once.
 */
export const seedRedirects = async (service: CmsService): Promise<void> => {
    if ((await service.redirects.list('norway')).some((redirect) => redirect.from === OLD_ADDRESS)) return;
    const id = (await service.editorItems('articles')).find((item) => item.label === 'Winter care for houseplants')?.id;
    if (id === undefined) return;
    await service.redirects.apply({
        add: [
            {
                site: 'norway',
                locale: 'nb',
                from: OLD_ADDRESS,
                to: {
                    type: 'document',
                    ref: formatRef({
                        type: 'item',
                        collection: 'articles',
                        id,
                    }),
                },
                status: 308,
                origin: 'rename',
                createdBy: nils,
            },
        ],
        live: [],
        touch: [],
    });
};
