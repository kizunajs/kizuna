import { randomUUID } from 'node:crypto';
import { ada, kari, nils, photos, sam, una } from './seed-content';

/**
 * A block the seed puts in a text, named by what editors see: a plant or a
 * person by name, an article by its English title, a photo by its key.
 */
export type SeededBlock =
    | {
          callout: 'tip' | 'warning' | 'note';
          text: string;
      }
    | {
          quote: string;
          by: string;
      }
    | {
          plant: string;
      }
    | {
          figure: keyof typeof photos;
          caption?: string;
      }
    | {
          pair: [keyof typeof photos, keyof typeof photos];
          caption?: string;
      }
    | {
          faq: Array<[question: string, answer: string]>;
      }
    | {
          button: string;
          ref: string;
      }
    | {
          article: string;
      };

/**
 * Blocks for one article or page, in one language, each list put in after
 * the paragraph its number counts to, or at the end of a shorter text. Plain
 * strings among them are more text, written as the seed's markup.
 */
export interface SeededBlocks {
    target:
        | {
              article: string;
          }
        | {
              site: string;
              page: string;
          };
    locale?: string;
    by: string;
    publishedBy: string;
    summary: string;
    after: Record<number, Array<SeededBlock | string>>;
}

export const textBlocks: SeededBlocks[] = [
    {
        target: {
            article: 'How we pack plants for winter delivery',
        },
        by: ada,
        publishedBy: ada,
        summary: 'A quote from Jonas, questions and a plant',
        after: {
            1: [
                {
                    quote: 'If it is too cold to wait at the bus stop without gloves, it is too cold for a calathea in a van.',
                    by: 'Jonas Berg',
                },
                {
                    callout: 'warning',
                    text: 'Below minus five we hold deliveries back. You get an email the evening before with a new day.',
                },
                {
                    pair: ['bostonFern', 'ladyFern'],
                    caption: 'A Boston fern and a lady fern, the two we send most of in winter.',
                },
            ],
            2: [
                {
                    faq: [
                        ['Can I give the wool back?', 'Yes. Hand it to the driver next time, or bring it to a shop, and we use it again.'],
                        [
                            'What if a plant arrives damaged?',
                            'Send a photo to the plant care desk the same day, and we replace it or refund it, whichever you prefer.',
                        ],
                        [
                            'Do you deliver at weekends?',
                            'Not in winter. Plants travel from Tuesday to Thursday, so none spends a weekend in a cold depot.',
                        ],
                    ],
                },
                {
                    plant: 'Boston fern',
                },
                {
                    article: 'Winter care for houseplants',
                },
            ],
        },
    },
    {
        target: {
            article: 'How we pack plants for winter delivery',
        },
        locale: 'nb',
        by: kari,
        publishedBy: nils,
        summary: 'Sitat fra Jonas, spørsmål og en plante',
        after: {
            1: [
                {
                    quote: 'Er det for kaldt til å vente på bussen uten votter, er det for kaldt for en kalatea i en varebil.',
                    by: 'Jonas Berg',
                },
                {
                    callout: 'warning',
                    text: 'Når det er kaldere enn minus fem, venter vi med leveringen. Du får en e-post kvelden før med en ny dag.',
                },
                {
                    pair: ['bostonFern', 'ladyFern'],
                    caption: 'Sverdbregne og skogburkne, de to vi sender flest av om vinteren.',
                },
            ],
            2: [
                {
                    faq: [
                        [
                            'Kan jeg levere tilbake ulla?',
                            'Ja. Gi den til sjåføren neste gang, eller ta den med til en butikk, så bruker vi den igjen.',
                        ],
                        [
                            'Hva om planten kommer skadet fram?',
                            'Send et bilde til planteklinikken samme dag, så erstatter vi planten eller gir deg pengene tilbake.',
                        ],
                        [
                            'Leverer dere i helgene?',
                            'Ikke om vinteren. Plantene reiser fra tirsdag til torsdag, så ingen blir stående en helg på et kaldt lager.',
                        ],
                    ],
                },
                {
                    plant: 'Boston fern',
                },
                {
                    article: 'Winter care for houseplants',
                },
            ],
        },
    },
    {
        target: {
            article: 'Five plants for a dark flat',
        },
        by: sam,
        publishedBy: una,
        summary: 'The five, a photo and a warning for pet owners',
        after: {
            1: [
                {
                    figure: 'osloShop',
                    caption: "A bird's nest fern two metres from a north window, a year after it came home.",
                },
                '## The five',
                "- ZZ plant: waxy leaves that store water, so it forgives a missed week.\n- Cast iron plant: the name says it. It takes a cold hall too.\n- Heartleaf philodendron: trails from a shelf and grows towards whatever light there is.\n- Bird's nest fern: likes the damp of a bathroom.\n- Snake plant: stands upright in a corner and wants water once a month.",
                {
                    callout: 'warning',
                    text: 'The ZZ plant and the snake plant are poisonous to cats and dogs. Stand them where pets cannot chew them.',
                },
                {
                    plant: 'Boston fern',
                },
            ],
            2: [
                {
                    callout: 'tip',
                    text: 'Wipe the leaves with a damp cloth once a month. In a dim room, dust takes a good share of what little light there is.',
                },
                {
                    button: 'Ask the plant care desk',
                    ref: 'page:uk:plantCarePage',
                },
                {
                    article: 'How we pack plants for winter delivery',
                },
            ],
        },
    },
    {
        target: {
            article: 'Five plants for a dark flat',
        },
        locale: 'nb',
        by: kari,
        publishedBy: nils,
        summary: 'De fem, et bilde og en advarsel for dyreeiere',
        after: {
            1: [
                {
                    figure: 'osloShop',
                    caption: 'En redebregne to meter fra et vindu mot nord, et år etter at den kom hjem.',
                },
                '## De fem',
                '- Zamioculcas: voksaktige blader som lagrer vann, så den tilgir en glemt uke.\n- Aspidistra: tåler det meste, også en kald gang.\n- Filodendron: henger fra en hylle og vokser mot det lyset som finnes.\n- Redebregne: liker fuktigheten på badet.\n- Svigermors tunge: står rett opp i et hjørne og vil ha vann en gang i måneden.',
                {
                    callout: 'warning',
                    text: 'Zamioculcas og svigermors tunge er giftige for katter og hunder. Sett dem der dyrene ikke når dem.',
                },
                {
                    plant: 'Boston fern',
                },
            ],
            2: [
                {
                    callout: 'tip',
                    text: 'Tørk av bladene med en fuktig klut en gang i måneden. I et mørkt rom tar støvet mye av det lille lyset som er.',
                },
                {
                    button: 'Spør planteklinikken',
                    ref: 'page:norway:customerServicePage',
                },
                {
                    article: 'How we pack plants for winter delivery',
                },
            ],
        },
    },
    {
        target: {
            site: 'norway',
            page: 'customerServicePage',
        },
        by: kari,
        publishedBy: nils,
        summary: 'Spørsmål og svar, og stengt i jula',
        after: {
            1: [
                {
                    callout: 'note',
                    text: 'Planteklinikken holder stengt fra 24. desember til 1. januar. E-post som kommer da, svarer vi på 2. januar.',
                },
            ],
            2: [
                {
                    faq: [
                        [
                            'Hvor lang tid tar leveringen?',
                            'Neste dag i Oslo, Bergen og Stavanger om du bestiller før klokka 14. Resten av landet får planten på to til tre dager.',
                        ],
                        [
                            'Kan jeg bytte en plante jeg har fått i gave?',
                            'Ja, innen 14 dager, med eller uten kvittering. Ta den med til en av butikkene.',
                        ],
                        [
                            'Hva gjør jeg om planten får gule blader?',
                            'Send et bilde av planten og jorda til hjelp@hagen.example.no. Som regel er det for mye vann, og vi forteller deg hva du kan gjøre.',
                        ],
                    ],
                },
                {
                    quote: 'De fleste plantene vi får bilder av, er ikke syke. De står bare for langt fra vinduet.',
                    by: 'Sigrid Haugen',
                },
                {
                    button: 'Finn nærmeste butikk',
                    ref: 'page:norway:shopsPage',
                },
            ],
        },
    },
    {
        target: {
            site: 'norway',
            page: 'customerServicePage',
        },
        locale: 'en',
        by: ada,
        publishedBy: ada,
        summary: 'Questions and answers, and closed over Christmas',
        after: {
            1: [
                {
                    callout: 'note',
                    text: 'The plant care desk is closed from 24 December to 1 January. We answer emails that arrive then on 2 January.',
                },
            ],
            2: [
                {
                    faq: [
                        [
                            'How long does delivery take?',
                            'The next day in Oslo, Bergen and Stavanger if you order before 14:00. The rest of the country gets the plant in two to three days.',
                        ],
                        [
                            'Can I exchange a plant I was given?',
                            'Yes, within 14 days, with or without a receipt. Bring it to one of the shops.',
                        ],
                        [
                            'What do I do if the leaves turn yellow?',
                            'Send a photo of the plant and the soil to hjelp@hagen.example.no. Most often it is too much water, and we tell you what to do.',
                        ],
                    ],
                },
                {
                    quote: 'Most of the plants we get photos of are not ill. They just stand too far from the window.',
                    by: 'Sigrid Haugen',
                },
                {
                    button: 'Find the nearest shop',
                    ref: 'page:norway:shopsPage',
                },
            ],
        },
    },
    {
        target: {
            site: 'norway',
            page: 'aboutPage',
        },
        by: nils,
        publishedBy: nils,
        summary: 'Ingrid om plantene, og et bilde fra bakgården',
        after: {
            1: [
                {
                    figure: 'bergenShop',
                    caption: 'Bregnene i bakgården i Markveien, der den første butikken lå.',
                },
                {
                    quote: 'Vi selger bare planter vi selv har hatt i stua gjennom en vinter.',
                    by: 'Ingrid Solberg',
                },
            ],
            2: [
                {
                    article: 'Fern week in Oslo and Bergen',
                },
                {
                    button: 'Kontakt kundeservice',
                    ref: 'page:norway:customerServicePage',
                },
            ],
        },
    },
    {
        target: {
            site: 'norway',
            page: 'aboutPage',
        },
        locale: 'en',
        by: ada,
        publishedBy: ada,
        summary: 'Ingrid on the plants, and a photo from the courtyard',
        after: {
            1: [
                {
                    figure: 'bergenShop',
                    caption: 'The ferns in the courtyard in Markveien, behind the first shop.',
                },
                {
                    quote: 'We only sell plants we have kept in our own living rooms through a winter.',
                    by: 'Ingrid Solberg',
                },
            ],
            2: [
                {
                    article: 'Fern week in Oslo and Bergen',
                },
                {
                    button: 'Contact customer service',
                    ref: 'page:norway:customerServicePage',
                },
            ],
        },
    },
    {
        target: {
            site: 'group',
            page: 'aboutPage',
        },
        by: ada,
        publishedBy: ada,
        summary: 'Ingrid on the growers, with photos and a plant',
        after: {
            1: [
                {
                    quote: 'We only sell plants we have kept in our own living rooms through a winter.',
                    by: 'Ingrid Solberg',
                },
                {
                    pair: ['growers', 'spring'],
                    caption: 'Kanzan cherries at a grower outside Lier, and the branches we cut from them in April.',
                },
            ],
            2: [
                {
                    plant: "Japanese cherry 'Kanzan'",
                },
                {
                    article: 'Visiting the growers we buy from',
                },
                {
                    button: 'Work with us',
                    ref: 'page:group:careersPage',
                },
            ],
        },
    },
];

/**
 * What turning seeded blocks into rich text needs from the seed: its markup,
 * the ids of what the blocks name, and the photos uploaded.
 */
export interface BlockSources {
    text: (markup: string) => Array<Record<string, unknown>>;
    plant: (name: string) => string;
    person: (name: string) => string;
    article: (title: string) => string;
    photo: (key: keyof typeof photos) => Promise<{ id: string; alt: string }>;
}

const key = (): string => randomUUID().replace(/-/g, '').slice(0, 12);

const nodeOf = async (block: SeededBlock, sources: BlockSources): Promise<Record<string, unknown>> => {
    const node = (type: string, fields: Record<string, unknown>) => ({
        _type: type,
        _key: key(),
        ...fields,
    });
    if ('callout' in block) {
        return node('callout', {
            tone: block.callout,
            text: block.text,
        });
    }
    if ('quote' in block) {
        return node('pullQuote', {
            quote: block.quote,
            person: sources.person(block.by),
        });
    }
    if ('plant' in block) {
        return node('plantCard', {
            plant: sources.plant(block.plant),
        });
    }
    if ('figure' in block) {
        return node('figure', {
            image: await sources.photo(block.figure),
            ...(block.caption === undefined
                ? {}
                : {
                      caption: block.caption,
                  }),
        });
    }
    if ('pair' in block) {
        return node('imagePair', {
            left: await sources.photo(block.pair[0]),
            right: await sources.photo(block.pair[1]),
            ...(block.caption === undefined
                ? {}
                : {
                      caption: block.caption,
                  }),
        });
    }
    if ('faq' in block) {
        return node('faq', {
            questions: block.faq.map(([question, answer]) => ({
                question,
                answer,
            })),
        });
    }
    if ('button' in block) {
        return node('button', {
            link: {
                ref: block.ref,
                label: block.button,
            },
        });
    }
    return node('relatedArticle', {
        article: sources.article(block.article),
    });
};

/**
 * Whether a text holds any block already, which is how the seed knows it put
 * its blocks in, or an editor did.
 */
export const holdsBlocks = (body: unknown): boolean =>
    Array.isArray(body) && body.some((node: { _type?: unknown }) => node._type !== 'block' && node._type !== 'image');

/**
 * A text with the seeded blocks put in after the paragraphs they name.
 */
export const withSeededBlocks = async (
    body: ReadonlyArray<Record<string, unknown>>,
    after: SeededBlocks['after'],
    sources: BlockSources
): Promise<Array<Record<string, unknown>>> => {
    const nodesAfter = async (paragraph: number): Promise<Array<Record<string, unknown>>> => {
        const nodes: Array<Record<string, unknown>> = [];
        for (const part of after[paragraph] ?? []) {
            if (typeof part === 'string') nodes.push(...sources.text(part));
            else nodes.push(await nodeOf(part, sources));
        }
        return nodes;
    };
    const result: Array<Record<string, unknown>> = [];
    let paragraph = 0;
    for (const node of body) {
        result.push(node);
        if (node['_type'] !== 'block') continue;
        paragraph += 1;
        result.push(...(await nodesAfter(paragraph)));
    }
    for (const left of Object.keys(after)
        .map(Number)
        .filter((number) => number > paragraph)
        .sort((first, second) => first - second)) {
        result.push(...(await nodesAfter(left)));
    }
    return result;
};
