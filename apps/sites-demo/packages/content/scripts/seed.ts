import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { formatRef, type CmsService, type DocumentRef } from '@kizunajs/cms';
import {
    ada,
    articles,
    christmasNewsletter,
    christmasOpeningHours,
    employees,
    employeesInNorwegian,
    englishAlts,
    events,
    kari,
    mia,
    newsletters,
    nils,
    norwayComments,
    norwayHistoryDraft,
    norwayWinterFrontPage,
    groupFooter,
    offices,
    pageLinks,
    officesInNorwegian,
    officesOnTheUk,
    pages,
    photos,
    privacyPolicy,
    privacyPolicyInNorwegian,
    products,
    sam,
    trondheimOpening,
    una,
    type Edit,
    type SeededPage,
    type Written,
} from './seed-content';

const PHOTOS = join(process.cwd(), 'seed/photos');

const RealDate = Date;

/**
 * How far Oslo's clock is ahead of UTC at a moment, in milliseconds.
 */
const osloOffset = (moment: number): number => {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Oslo',
        hourCycle: 'h23',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
    }).formatToParts(new RealDate(moment));
    const part = (type: Intl.DateTimeFormatPartTypes): number => Number(parts.find((candidate) => candidate.type === type)?.value);
    const wall = RealDate.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'));
    return wall - (moment - (moment % 60_000));
};

/**
 * Oslo's `hour` on the day `days` from today, or before it when negative.
 */
const inOslo = (days: number, hour: number, minute = 0): Date => {
    const today = new RealDate(RealDate.now() + osloOffset(RealDate.now()));
    const wall = RealDate.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + days, hour, minute);
    return new RealDate(wall - osloOffset(wall));
};

/**
 * A moment `days` ago, during the working day. `step` moves it on by hours,
 * so what happens after something on the same day comes after it.
 */
const daysAgo = (days: number, step = 0): Date => inOslo(-days, 9 + ((days * 5) % 6) + step, (days * 17) % 60);

/**
 * The date `days` from today, or before it when negative, as a field stores it.
 */
const dateIn = (days: number): string => inOslo(days, 12).toISOString().slice(0, 10);

/**
 * The next 14 November, the day Trondheim opens, at eight in the morning.
 */
const trondheimOpens = (): Date => {
    for (let days = 1; days <= 366; days += 1) {
        const day = inOslo(days, 8);
        if (dateIn(days).endsWith('-11-14')) return day;
    }
    throw new Error('No 14 November in the coming year.');
};

/**
 * The next Tuesday at least three days away, at seven, when the newsletter
 * goes out.
 */
const nextNewsletterDay = (): Date => {
    for (let days = 3; days <= 9; days += 1) {
        if (new RealDate(`${dateIn(days)}T12:00:00Z`).getUTCDay() === 2) return inOslo(days, 7);
    }
    throw new Error('No Tuesday in the coming week.');
};

/**
 * Runs `write` as if the clock read `moment`, so a document's history shows
 * the day each editor made their change. The seed writes one thing at a
 * time, so nothing else runs while the clock is moved.
 */
const asOf = async <T>(moment: Date, write: () => Promise<T>): Promise<T> => {
    const offset = moment.getTime() - RealDate.now();
    globalThis.Date = new Proxy(RealDate, {
        construct: (target, args) => (args.length === 0 ? new target(target.now() + offset) : Reflect.construct(target, args)),
        get: (target, property, receiver) => (property === 'now' ? () => target.now() + offset : Reflect.get(target, property, receiver)),
    });
    try {
        return await write();
    } finally {
        globalThis.Date = RealDate;
    }
};

/**
 * Fills in what the demo database is missing: Hagen's shops and people, the
 * journal, the UK's workshops, every site's pages, the newsletter and the
 * media library, each with the history of who wrote it. It also leaves work
 * in progress: drafts waiting for review, schedules, a release and
 * translations behind their source. A document already there is left alone,
 * so an editor's changes survive a restart.
 */
export const seedContent = async (service: CmsService): Promise<void> => {
    const caller = service.caller({
        editor: {
            role: 'admin',
        },
    });

    const exists = async (ref: DocumentRef): Promise<boolean> => (await service.document(ref)).row !== undefined;

    const save = (ref: DocumentRef, changes: Record<string, unknown>, by: string, at: Date, summary?: string) =>
        asOf(at, () =>
            service.update({
                ref,
                changes,
                caller,
                author: by,
                ...(summary === undefined
                    ? {}
                    : {
                          summary,
                      }),
            })
        );

    // The apps' caches live in their own servers, so publishing goes to the store without invalidating anything.
    const publish = (ref: DocumentRef, by: string, at: Date) =>
        asOf(at, async () => {
            const state = await service.draftState(ref);
            if (!state.complete) throw new Error(`The seed for ${formatRef(ref)} is missing ${state.missing.join(', ')}.`);
            await service.store.publish(state.target.kind, state.target.key, by, state.target.site, state.target.locale);
        });

    /**
     * Writes a new document's history: its first draft, its publishing, and
     * each later edit.
     */
    const tell = async (ref: DocumentRef, values: Record<string, unknown>, written: Written, edits: readonly Edit[] = []) => {
        await save(ref, values, written.by, daysAgo(written.daysAgo));
        if (written.published !== undefined) await publish(ref, written.published.by, daysAgo(written.published.daysAgo, 1));
        for (const edit of edits) {
            await save(ref, edit.changes, edit.by, daysAgo(edit.daysAgo), edit.summary);
            if (edit.publish === true) await publish(ref, edit.by, daysAgo(edit.daysAgo, 1));
        }
        console.log(`[demo] seeded ${formatRef(ref)}`);
    };

    /**
     * Whether a document has a version saved with `summary`, which is how
     * the seed knows it told a story already.
     */
    const hasVersion = async (ref: DocumentRef, summary: string): Promise<boolean> => {
        const { row } = await service.document(ref);
        return row !== undefined && (await service.store.versions(row.id)).some((version) => version.summary === summary);
    };

    // Media

    /**
     * A folder of a library, made when it is missing. `site` names a site's
     * library, and without it the shared one.
     */
    const folderNamed = async (
        input: { name: string; site?: string; parent?: string },
        by: string,
        at: Date
    ): Promise<{ id: string; made: boolean }> => {
        const found = (await service.media.folders(input.site)).find(
            (folder) => folder.site === input.site && folder.name === input.name && folder.parent === input.parent
        );
        if (found !== undefined) {
            return {
                id: found.id,
                made: false,
            };
        }
        const made = await asOf(at, () =>
            service.media.createFolder(
                {
                    name: input.name,
                    ...(input.parent === undefined
                        ? {}
                        : {
                              parent: input.parent,
                          }),
                },
                input.site,
                by
            )
        );
        return {
            id: made.id,
            made: true,
        };
    };

    /**
     * Stores a photo in a library, once: the same file uploaded again to the
     * same library is the same image.
     */
    const upload = async (
        photo: { file: string; alt: string },
        by: string,
        at: Date,
        place: { site?: string; folder?: string } = {}
    ): Promise<{ id: string; alt: string }> => {
        const bytes = new Uint8Array(await readFile(join(PHOTOS, photo.file)));
        const record = await asOf(at, () => service.media.storeBytes(bytes, photo.file, by, undefined, place.site, place.folder));
        if (record.alt === '') {
            await asOf(at, () =>
                service.media.update(
                    record.id,
                    {
                        alt: photo.alt,
                    },
                    by
                )
            );
        }
        return {
            id: record.id,
            alt: photo.alt,
        };
    };

    const shops = await folderNamed(
        {
            name: 'Shops',
        },
        ada,
        daysAgo(20)
    );
    const journal = await folderNamed(
        {
            name: 'Journal',
        },
        ada,
        daysAgo(20, 1)
    );
    const campaigns = await folderNamed(
        {
            name: 'Campaigns',
        },
        ada,
        daysAgo(20, 2)
    );
    await folderNamed(
        {
            name: 'Christmas 2026',
            parent: campaigns.id,
        },
        ada,
        daysAgo(20, 2)
    );
    const norwayCampaigns = await folderNamed(
        {
            name: 'Kampanjer',
            site: 'norway',
        },
        nils,
        daysAgo(61)
    );
    const norwayChristmas = await folderNamed(
        {
            name: 'Jul 2026',
            site: 'norway',
            parent: norwayCampaigns.id,
        },
        nils,
        daysAgo(18)
    );
    const norwayShops = await folderNamed(
        {
            name: 'Butikkene',
            site: 'norway',
        },
        kari,
        daysAgo(36)
    );
    const workshops = await folderNamed(
        {
            name: 'Workshops',
            site: 'uk',
        },
        una,
        daysAgo(30)
    );
    const folderIds: Record<string, string> = {
        Kampanjer: norwayCampaigns.id,
        Butikkene: norwayShops.id,
    };

    // Shops

    const officeLabels = async (): Promise<Array<{ id: string; label: string; status: string }>> =>
        (await service.editorItems('offices')).map((item) => ({
            id: item.id,
            label: item.label,
            status: item.status,
        }));
    const officeRef = (id: string, extra: { site?: string; locale?: string } = {}): DocumentRef => ({
        type: 'item',
        collection: 'offices',
        id,
        ...extra,
    });

    for (const office of offices) {
        if ((await officeLabels()).some((item) => item.label === office.values['name'])) continue;
        const at = daysAgo(office.written.daysAgo);
        const values = {
            ...office.values,
            ...(office.photo === undefined
                ? {}
                : {
                      photo: await upload(photos[office.photo], office.written.by, at),
                  }),
        };
        const created = await asOf(at, () => service.createItem('offices', values, caller, office.written.by));
        if (office.written.published !== undefined) {
            await publish(created.target.ref, office.written.published.by, daysAgo(office.written.published.daysAgo, 1));
        }
        console.log(`[demo] seeded the office ${String(office.values['name'])}`);
    }

    const officeId = async (name: string): Promise<string> => {
        const found = (await officeLabels()).find((office) => office.label === name);
        if (found === undefined) throw new Error(`The seed has no office '${name}'.`);
        return found.id;
    };
    const publishedDaysAgo = (name: string): number =>
        offices.find((office) => office.values['name'] === name)?.written.published?.daysAgo ?? 30;

    for (const [name, values] of Object.entries(officesOnTheUk)) {
        const ref = officeRef(await officeId(name), {
            site: 'uk',
        });
        if (await exists(ref)) continue;
        await tell(ref, values, {
            by: una,
            daysAgo: publishedDaysAgo(name),
            published: {
                by: una,
                daysAgo: publishedDaysAgo(name),
            },
        });
    }

    for (const [name, values] of Object.entries(officesInNorwegian)) {
        const ref = officeRef(await officeId(name), {
            locale: 'nb',
        });
        if (await exists(ref)) continue;
        await tell(ref, values, {
            by: kari,
            daysAgo: publishedDaysAgo(name) - 1,
            published: {
                by: nils,
                daysAgo: publishedDaysAgo(name) - 1,
            },
        });
    }

    /**
     * Writes the Norwegian copy of each item that has none yet, found by its
     * label, the day its source was published, or written while a draft.
     */
    const translateItems = async (
        collection: string,
        copies: ReadonlyArray<{ label: string; values: Record<string, unknown>; written: Written }>
    ): Promise<void> => {
        const items = await service.editorItems(collection);
        for (const copy of copies) {
            const item = items.find((candidate) => candidate.label === copy.label);
            if (item === undefined) continue;
            const ref: DocumentRef = {
                type: 'item',
                collection,
                id: item.id,
                locale: 'nb',
            };
            if (await exists(ref)) continue;
            const published = copy.written.published;
            await tell(ref, copy.values, {
                by: kari,
                daysAgo: published?.daysAgo ?? copy.written.daysAgo,
                published: {
                    by: nils,
                    daysAgo: published?.daysAgo ?? copy.written.daysAgo,
                },
            });
        }
    };

    // People

    for (const employee of employees) {
        if ((await service.editorItems('employees')).some((item) => item.label === employee.values['name'])) continue;
        const values = {
            ...employee.values,
            office: await officeId(employee.office),
        };
        const created = await asOf(daysAgo(employee.written.daysAgo), () =>
            service.createItem('employees', values, caller, employee.written.by)
        );
        if (employee.written.published !== undefined) {
            await publish(created.target.ref, employee.written.published.by, daysAgo(employee.written.published.daysAgo, 1));
        }
    }

    await translateItems(
        'employees',
        employees.flatMap((employee) => {
            const name = String(employee.values['name']);
            const inNorwegian = employeesInNorwegian[name];
            return inNorwegian === undefined
                ? []
                : [
                      {
                          label: name,
                          values: {
                              name,
                              ...inNorwegian,
                          },
                          written: employee.written,
                      },
                  ];
        })
    );

    /**
     * Puts a collection's items in the seed's order, for a database seeded
     * before items had places. Once anyone has moved an item, their order
     * stands.
     */
    const arrange = async (collection: string, labels: readonly string[]): Promise<void> => {
        const items = await service.editorItems(collection);
        const current = items.map((item) => item.label).filter((label) => labels.includes(label));
        const wanted = labels.filter((label) => current.includes(label));
        if (current.every((label, index) => label === wanted[index])) return;
        for (const item of items) {
            if (await hasVersion(officeRef(item.id), 'Moved')) return;
            if (
                await hasVersion(
                    {
                        type: 'item',
                        collection,
                        id: item.id,
                    },
                    'Moved'
                )
            )
                return;
        }
        for (const label of wanted) {
            const item = items.find((candidate) => candidate.label === label)!;
            const ref: DocumentRef = {
                type: 'item',
                collection,
                id: item.id,
            };
            await asOf(daysAgo(2), () =>
                service.placeItem({
                    name: collection,
                    id: item.id,
                    place: {
                        at: 'last',
                    },
                    caller,
                    author: ada,
                })
            );
            if (item.status === 'published') await publish(ref, ada, daysAgo(2, 1));
        }
        console.log(`[demo] put the ${collection} in order`);
    };
    await arrange(
        'offices',
        offices.map((office) => String(office.values['name']))
    );
    await arrange(
        'employees',
        employees.map((employee) => String(employee.values['name']))
    );

    // The journal

    for (const article of articles) {
        const title = article.values['title'];
        if ((await service.editorItems('articles')).some((item) => item.label === title)) continue;
        const image =
            article.photo === undefined
                ? {}
                : {
                      image: await upload(photos[article.photo], article.written.by, daysAgo(article.written.daysAgo)),
                  };
        const created = await asOf(daysAgo(article.written.daysAgo), () =>
            service.createItem(
                'articles',
                {
                    ...article.values,
                    date: dateIn(-article.dated),
                    ...image,
                },
                caller,
                article.written.by
            )
        );
        const ref = created.target.ref;
        const published = article.written.published;
        if (published !== undefined) await publish(ref, published.by, daysAgo(published.daysAgo, 1));
        // Fern week ends in a week, so Nils takes it down then.
        if (title === 'Fern week in Oslo and Bergen' && created.row !== undefined) {
            await asOf(daysAgo(2, 2), () =>
                service.schedules.schedule({
                    ref: formatRef(ref),
                    documentId: created.row!.id,
                    action: 'unpublish',
                    at: inOslo(7, 22),
                    force: false,
                    createdBy: nils,
                })
            );
        }
        console.log(`[demo] seeded the article ${String(title)}`);
    }
    await translateItems(
        'articles',
        articles.flatMap((article) =>
            article.inNorwegian === undefined
                ? []
                : [
                      {
                          label: String(article.values['title']),
                          values: article.inNorwegian,
                          written: article.written,
                      },
                  ]
        )
    );

    // The UK's workshops

    for (const event of events) {
        if ((await service.editorItems('events', 'uk')).some((item) => item.label === event.values['title'])) continue;
        const at = daysAgo(event.written.daysAgo);
        const image =
            event.values['title'] === 'Wreath evening'
                ? {
                      image: await upload(photos.wreathEvening, event.written.by, at, {
                          site: 'uk',
                          folder: workshops.id,
                      }),
                  }
                : {};
        const values = {
            ...event.values,
            ...image,
            date: dateIn(event.inDays),
            office: await officeId('Hagen London'),
        };
        const created = await asOf(at, () => service.createItem('events', values, caller, event.written.by, 'uk'));
        if (event.written.published !== undefined) {
            await publish(created.target.ref, event.written.published.by, daysAgo(event.written.published.daysAgo, 1));
        }
    }

    // The privacy policy

    const privacy: DocumentRef = {
        type: 'global',
        name: 'privacyPolicy',
    };
    if (!(await exists(privacy))) {
        await tell(privacy, privacyPolicy, {
            by: ada,
            daysAgo: 30,
            published: {
                by: ada,
                daysAgo: 30,
            },
        });
    }
    const privacyInNorwegian: DocumentRef = {
        ...privacy,
        locale: 'nb',
    };
    if (!(await exists(privacyInNorwegian))) {
        await tell(privacyInNorwegian, privacyPolicyInNorwegian, {
            by: nils,
            daysAgo: 29,
            published: {
                by: nils,
                daysAgo: 29,
            },
        });
    }

    // Every site's pages

    const pageRef = (page: { site: string; name: string }, locale?: string): DocumentRef => ({
        type: 'page',
        name: page.name,
        site: page.site,
        ...(locale === undefined
            ? {}
            : {
                  locale,
              }),
    });

    /**
     * The image a page shows, stored in the library it names.
     */
    const imageOf = async (page: SeededPage): Promise<Record<string, unknown>> => {
        if (page.image === undefined) return {};
        const folder = page.image.folder === undefined ? undefined : folderIds[page.image.folder];
        return {
            [page.image.field]: await upload(photos[page.image.photo], page.written.by, daysAgo(page.written.daysAgo), {
                ...(page.image.library === undefined
                    ? {}
                    : {
                          site: page.image.library,
                      }),
                ...(folder === undefined
                    ? {}
                    : {
                          folder,
                      }),
            }),
        };
    };

    const made = new Set<string>();
    for (const page of pages) {
        const ref = pageRef(page);
        if (!(await exists(ref))) {
            await tell(
                ref,
                {
                    ...page.values,
                    ...(await imageOf(page)),
                },
                page.written
            );
            made.add(`${page.site}:${page.name}`);
        }
        if (page.translation !== undefined) {
            const translated = pageRef(page, page.translation.locale);
            if (!(await exists(translated))) await tell(translated, page.translation.values, page.translation.written);
        }
        // After the translation, so a change to the source shows on it.
        if (made.has(`${page.site}:${page.name}`)) {
            for (const edit of page.edits ?? []) {
                await save(ref, edit.changes, edit.by, daysAgo(edit.daysAgo), edit.summary);
                if (edit.publish === true) await publish(ref, edit.by, daysAgo(edit.daysAgo, 1));
            }
        }
    }

    // A database seeded before the hero gets it now.
    const norwayFront = pageRef({
        site: 'norway',
        name: 'frontPage',
    });
    const front = await service.document(norwayFront);
    if (front.row !== undefined && front.row.published?.['hero'] === undefined && front.row.draft?.['hero'] === undefined) {
        await save(
            norwayFront,
            {
                hero: await upload(photos.norwayHero, nils, daysAgo(25), {
                    site: 'norway',
                    folder: norwayCampaigns.id,
                }),
            },
            nils,
            daysAgo(25),
            'Nytt toppbilde'
        );
        await publish(norwayFront, nils, daysAgo(25, 1));
    }

    // The alt text of each image on Hagen Norge's English pages, where the English copy has none yet.
    for (const { page, field, alt } of englishAlts) {
        const source = await service.document(
            pageRef({
                site: 'norway',
                name: page,
            })
        );
        const image = source.row?.published?.[field];
        const english = pageRef(
            {
                site: 'norway',
                name: page,
            },
            'en'
        );
        const translation = await service.draftState(english);
        const copy = translation.row?.draft ?? translation.row?.published;
        if (image === undefined || translation.row === undefined || copy?.[field] !== undefined) continue;
        const wasPublished = translation.status === 'published';
        // A translation keeps an image's alt text alone, and shows the image its source does.
        await save(
            english,
            {
                [field]: alt,
            },
            ada,
            daysAgo(3),
            'English alt text'
        );
        if (wasPublished) await publish(english, ada, daysAgo(3, 1));
    }

    // The shared photos nothing shows yet, and the tidying that put the shop photos in a folder.
    if (shops.made) {
        await upload(photos.growers, ada, daysAgo(21));
        await upload(photos.spring, ada, daysAgo(21, 1));
        const shared = await service.media.inLibrary();
        const named = (file: string) => shared.filter((record) => record.filename === file).map((record) => record.id);
        await asOf(daysAgo(14), () =>
            service.media.move(
                [photos.osloShop.file, photos.majorstuenShop.file, photos.stavangerShop.file].flatMap(named),
                {
                    folder: shops.id,
                },
                ada
            )
        );
        await asOf(daysAgo(14, 1), () =>
            service.media.move(
                [photos.growers.file, photos.spring.file].flatMap(named),
                {
                    folder: journal.id,
                },
                ada
            )
        );
        console.log('[demo] tidied the shared library into folders');
    }

    // Reviews

    /**
     * Asks `reviewers` to review a document's draft as it stands.
     */
    const askForReview = (ref: DocumentRef, input: { by: string; reviewers: string[]; note: string; at: Date }) =>
        asOf(input.at, async () => {
            const state = await service.draftState(ref);
            if (state.row === undefined) throw new Error(`The seed asks for a review of ${formatRef(ref)}, which has no draft.`);
            const [review] = await service.store.addReviews([
                {
                    requestId: randomUUID(),
                    ref: formatRef(state.target.ref),
                    documentId: state.row.id,
                    version: state.version,
                    reviewers: input.reviewers,
                    requestedBy: input.by,
                    note: input.note,
                    createdAt: new Date(),
                },
            ]);
            return {
                review: review!,
                version: state.version,
            };
        });

    // Hagen Norge's winter front page, which waits for Nils.
    const winter = 'Vintertekst og julebilde';
    const frontState = await service.draftState(norwayFront);
    if (frontState.status === 'published' && !(await hasVersion(norwayFront, winter))) {
        await save(
            norwayFront,
            {
                ...norwayWinterFrontPage.changes,
                hero: await upload(photos.norwayChristmas, mia, daysAgo(1), {
                    site: 'norway',
                    folder: norwayChristmas.id,
                }),
            },
            mia,
            daysAgo(1),
            winter
        );
        await askForReview(norwayFront, {
            by: mia,
            reviewers: [nils],
            note: norwayWinterFrontPage.note,
            at: daysAgo(1, 1),
        });
        console.log('[demo] asked Nils to review the winter front page');
    }

    // Kari's history of Hagen Norge, which Nils sent back.
    const history = pageRef({
        site: 'norway',
        name: 'historyPage',
    });
    if (made.has('norway:historyPage')) {
        await save(history, norwayHistoryDraft.changes, kari, daysAgo(3), 'Lengre historie');
        const { review } = await askForReview(history, {
            by: kari,
            reviewers: [nils],
            note: norwayHistoryDraft.requestNote,
            at: daysAgo(3, 1),
        });
        await asOf(daysAgo(2), async () => {
            await service.store.addComment({
                documentId: review.documentId,
                reviewId: review.id,
                path: 'body',
                text: norwayHistoryDraft.comment,
                createdBy: nils,
                createdAt: new Date(),
            });
            await service.store.decideReview(review.id, {
                status: 'changes',
                by: nils,
                note: norwayHistoryDraft.decisionNote,
                version: review.version,
            });
        });
        console.log('[demo] sent the history page back to Kari');
    }

    // The plant doctor's new price, which Una approved and nobody has published yet.
    const plantDoctor = pageRef({
        site: 'uk',
        name: 'plantDoctorPage',
    });
    if (made.has('uk:plantDoctorPage')) {
        await save(
            plantDoctor,
            {
                body: `From December a first visit costs £40 within E1 to E9 and takes about forty minutes. We look at the light, the pot and the soil, and leave a written plan for the next three months.

Book a visit at the shop or by writing to care@hagen.example.co.uk. Visits run on Tuesday and Wednesday mornings.`,
            },
            sam,
            daysAgo(2),
            'New price from December'
        );
        const { review } = await askForReview(plantDoctor, {
            by: sam,
            reviewers: [una],
            note: 'The new price for house calls. Can it go live before the newsletter?',
            at: daysAgo(2, 1),
        });
        await asOf(daysAgo(1, 3), () =>
            service.store.decideReview(review.id, {
                status: 'approved',
                by: una,
                note: null,
                version: review.version,
            })
        );
    }

    // Schedules

    /**
     * Schedules a document to publish or unpublish on its own at `at`.
     */
    const schedule = (ref: DocumentRef, input: { action: 'publish' | 'unpublish'; at: Date; by: string; when: Date }) =>
        asOf(input.when, async () => {
            const state = await service.draftState(ref);
            await service.schedules.schedule({
                ref: formatRef(state.target.ref),
                documentId: state.row!.id,
                action: input.action,
                at: input.at,
                force: false,
                createdBy: input.by,
            });
        });

    // December opening hours on Hagen Norge, live tomorrow morning.
    const customerService = pageRef({
        site: 'norway',
        name: 'customerServicePage',
    });
    if (made.has('norway:customerServicePage')) {
        await save(customerService, christmasOpeningHours, kari, daysAgo(2), 'Åpningstider i desember');
        await schedule(customerService, {
            action: 'publish',
            at: inOslo(1, 9),
            by: nils,
            when: daysAgo(1, 2),
        });
        console.log('[demo] scheduled the December opening hours for tomorrow');
    }

    // The UK's last order dates, in two and a half weeks.
    const delivery = pageRef({
        site: 'uk',
        name: 'deliveryPage',
    });
    if (made.has('uk:deliveryPage')) {
        await save(
            delivery,
            {
                intro: 'Next day in London by cargo bike, two to three days anywhere else. Order by 20 December for Christmas.',
            },
            una,
            daysAgo(1),
            'Christmas order dates'
        );
        await schedule(delivery, {
            action: 'publish',
            at: inOslo(18, 8),
            by: una,
            when: daysAgo(1, 1),
        });
    }

    // The plants the newsletter shows.

    for (const product of products) {
        if ((await service.editorItems('products')).some((item) => item.label === product.values['name'])) continue;
        const at = daysAgo(product.written.daysAgo);
        const photo = await upload(photos[product.photo], product.written.by, at);
        const created = await asOf(at, () =>
            service.createItem(
                'products',
                {
                    ...product.values,
                    photo,
                },
                caller,
                product.written.by
            )
        );
        if (product.written.published !== undefined) {
            await publish(created.target.ref, product.written.published.by, daysAgo(product.written.published.daysAgo, 1));
        }
        console.log(`[demo] seeded the product ${String(product.values['name'])}`);
    }
    await translateItems(
        'products',
        products.map((product) => ({
            label: String(product.values['name']),
            values: product.inNorwegian,
            written: product.written,
        }))
    );

    // The newsletter: two issues sent, and the Christmas issue waiting for Mia.

    const linked: Linked = {
        articles: new Map((await service.editorItems('articles')).map((item) => [item.label, item.id])),
        products: new Map((await service.editorItems('products')).map((item) => [item.label, item.id])),
    };

    for (const issue of newsletters) {
        if ((await service.editorItems('newsletters')).some((item) => item.label === issue.values.subject)) continue;
        const created = await asOf(daysAgo(issue.written.daysAgo), () =>
            service.createItem('newsletters', newsletterValues(issue.values), caller, issue.written.by)
        );
        const ref = created.target.ref;
        const { review, version } = await askForReview(ref, {
            by: issue.written.by,
            reviewers: [issue.approvedBy],
            note: 'Ready for a read.',
            at: daysAgo(issue.written.daysAgo, 1),
        });
        await asOf(daysAgo(issue.approvedDaysAgo), async () => {
            const state = await service.draftState(ref);
            await service.store.approveAndPublish(
                state.target.kind,
                state.target.key,
                {
                    review: review.id,
                    by: issue.approvedBy,
                    version,
                },
                state.target.site,
                state.target.locale
            );
        });
        console.log(`[demo] seeded the newsletter ${issue.values.subject}`);
    }
    await translateItems(
        'newsletters',
        newsletters.map((issue) => ({
            label: issue.values.subject,
            values: newsletterValues(issue.inNorwegian),
            written: {
                ...issue.written,
                published: {
                    by: issue.approvedBy,
                    daysAgo: issue.approvedDaysAgo,
                },
            },
        }))
    );

    if (!(await service.editorItems('newsletters')).some((item) => item.label === christmasNewsletter.values.subject)) {
        const created = await asOf(daysAgo(2), () =>
            service.createItem('newsletters', newsletterValues(christmasNewsletter.values, linked), caller, kari)
        );
        const ref = created.target.ref;
        await askForReview(ref, {
            by: kari,
            reviewers: [mia],
            note: christmasNewsletter.note,
            at: daysAgo(1, 1),
        });
        await schedule(ref, {
            action: 'publish',
            at: nextNewsletterDay(),
            by: ada,
            when: daysAgo(1, 2),
        });
        console.log('[demo] scheduled the Christmas newsletter, waiting for Mia');
    }

    // The Trondheim opening: drafts on Hagen Norge, in the shared content and on the group, published together.

    const trondheimPage = pageRef({
        site: 'norway',
        name: 'trondheimShopPage',
    });
    if (!(await exists(trondheimPage))) {
        await tell(trondheimPage, trondheimOpening.shopPage, {
            by: nils,
            daysAgo: 6,
        });
        const members: DocumentRef[] = [trondheimPage];
        const shopsPage = pageRef({
            site: 'norway',
            name: 'shopsPage',
        });
        if ((await service.draftState(shopsPage)).status === 'published') {
            await save(shopsPage, trondheimOpening.shopsPage, kari, daysAgo(5), 'Trondheim i ingressen');
            members.push(shopsPage);
        }
        const groupFront = pageRef({
            site: 'group',
            name: 'frontPage',
        });
        if ((await service.draftState(groupFront)).status === 'published') {
            await save(groupFront, trondheimOpening.groupFrontPage, ada, daysAgo(3), 'Seven shops');
            members.push(groupFront);
        }
        for (const name of ['Hagen Trondheim']) {
            members.push(officeRef(await officeId(name)));
        }
        for (const item of await service.editorItems('employees')) {
            if (item.label === 'Kristian Moe' || item.label === 'Hanna Lie') {
                members.push({
                    type: 'item',
                    collection: 'employees',
                    id: item.id,
                });
            }
        }
        const release = await asOf(daysAgo(3, 1), () => service.schedules.createRelease('Trondheim opening', ada));
        for (const ref of members) {
            const state = await service.draftState(ref);
            if (state.row === undefined || state.status === 'published') continue;
            await asOf(daysAgo(3, 1), () =>
                service.schedules.schedule({
                    ref: formatRef(state.target.ref),
                    documentId: state.row!.id,
                    action: 'publish',
                    at: null,
                    force: false,
                    createdBy: ada,
                    releaseId: release.id,
                })
            );
        }
        await asOf(daysAgo(2, 3), () => service.schedules.timeRelease(release.id, trondheimOpens(), ada, false));
        console.log('[demo] made the Trondheim opening release');
    }

    // Claude's winter care refresh for Mia: two drafts in a release, credited to Mia via Claude, waiting for her review.
    const plantCare = pageRef({
        site: 'uk',
        name: 'plantCarePage',
    });
    const winterArticleId = (await service.editorItems('articles')).find((item) => item.label === 'Winter care for houseplants')?.id;
    const winterArticle: DocumentRef | undefined =
        winterArticleId === undefined
            ? undefined
            : {
                  type: 'item',
                  collection: 'articles',
                  id: winterArticleId,
              };
    if (
        winterArticle !== undefined &&
        (await service.draftState(plantCare)).status === 'published' &&
        (await service.draftState(winterArticle)).status === 'published' &&
        !(await hasVersion(plantCare, winterCareRefresh.summary))
    ) {
        await withAgent('Claude', async () => {
            await save(plantCare, winterCareRefresh.plantCarePage, mia, daysAgo(1, 2), winterCareRefresh.summary);
            await save(winterArticle, winterCareRefresh.article, mia, daysAgo(1, 2), winterCareRefresh.summary);
            const release = await asOf(daysAgo(1, 3), () => service.schedules.createRelease(winterCareRefresh.release, mia));
            for (const ref of [plantCare, winterArticle]) {
                const state = await service.draftState(ref);
                await asOf(daysAgo(1, 3), () =>
                    service.schedules.schedule({
                        ref: formatRef(state.target.ref),
                        documentId: state.row!.id,
                        action: 'publish',
                        at: null,
                        force: false,
                        createdBy: mia,
                        releaseId: release.id,
                    })
                );
                await askForReview(ref, {
                    by: mia,
                    reviewers: [mia],
                    note: winterCareRefresh.note,
                    at: daysAgo(1, 3),
                });
            }
        });
        console.log("[demo] made Claude's winter care refresh release");
    }

    // Links between pages, by ref, here and across the sites: added once, to each document that has none yet.

    /**
     * Adds a field to a document that does not hold it yet. A live document
     * publishes it, and one with a draft waiting keeps that draft, with the
     * field added, on top.
     */
    const addField = async (ref: DocumentRef, field: string, value: unknown, by: string, days: number): Promise<void> => {
        const { row } = await service.document(ref);
        if (row === undefined || row.published === null) return;
        if (row.published[field] !== undefined || row.draft?.[field] !== undefined) return;
        const waiting = row.draft !== null && !sameValues(row.draft, row.published) ? row.draft : undefined;
        await save(
            ref,
            {
                ...row.published,
                [field]: value,
            },
            by,
            daysAgo(days),
            'Links'
        );
        await publish(ref, by, daysAgo(days, 1));
        if (waiting !== undefined) {
            await save(
                ref,
                {
                    ...waiting,
                    [field]: value,
                },
                by,
                daysAgo(days, 2)
            );
        }
        console.log(`[demo] linked ${formatRef(ref)}`);
    };

    for (const entry of pageLinks) {
        await addField(
            pageRef(entry, entry.locale),
            entry.field,
            entry.text === undefined ? entry.links : richText(entry.text),
            entry.by,
            entry.daysAgo
        );
    }
    if (!(await exists(groupNavigation))) {
        await tell(
            groupNavigation,
            {
                footer: groupFooter,
            },
            {
                by: ada,
                daysAgo: 4,
                published: {
                    by: ada,
                    daysAgo: 4,
                },
            }
        );
    }
};

const groupNavigation: DocumentRef = {
    type: 'global',
    name: 'navigation',
    site: 'group',
};

/**
 * Whether two copies of a document hold the same values.
 */
const sameValues = (left: Record<string, unknown>, right: Record<string, unknown>): boolean =>
    JSON.stringify(left) === JSON.stringify(right);

/**
 * The ids of the articles and plants an issue's blocks name, by title and by
 * name.
 */
interface Linked {
    articles: ReadonlyMap<string, string>;
    products: ReadonlyMap<string, string>;
}

/**
 * An issue's values with its body as rich text.
 */
const newsletterValues = (values: { subject: string; preheader: string; body: string }, linked?: Linked): Record<string, unknown> => ({
    subject: values.subject,
    preheader: values.preheader,
    body: richText(values.body, linked),
});

/**
 * The id of a seeded article or plant, by its title or name.
 */
const linkedId = (ids: ReadonlyMap<string, string>, label: string): string => {
    const id = ids.get(label);
    if (id === undefined) throw new Error(`The seed has nothing called '${label}' to put in the newsletter.`);
    return id;
};

/**
 * A few words of plain markup as rich text: blank lines between blocks, `## `
 * for a heading, `- ` for a list item, and `[text](/path)` for a link, or
 * `[text](page:uk:plantCarePage)` for a link to a page by ref. A line
 * `@article <title>` is an article block, and `@plants <name>; <name>` a block
 * of plants.
 */
const richText = (source: string, linked?: Linked) => {
    const key = (): string => randomUUID().replace(/-/g, '').slice(0, 12);
    const linkedBlock = (chunk: string) => {
        if (linked === undefined) throw new Error(`The seed has no ids for the block '${chunk}'.`);
        if (chunk.startsWith('@article ')) {
            return {
                _type: 'article',
                _key: key(),
                article: linkedId(linked.articles, chunk.slice('@article '.length)),
            };
        }
        return {
            _type: 'product',
            _key: key(),
            products: chunk
                .slice('@plants '.length)
                .split(';')
                .map((name) => linkedId(linked.products, name.trim())),
        };
    };
    const block = (line: string, style: string, listItem?: 'bullet') => {
        const markDefs: Array<{ _type: 'link'; _key: string; ref?: string; href?: string }> = [];
        const children = line
            .split(/(\[[^\]]+\]\([^)]+\))/)
            .filter((text) => text !== '')
            .map((text) => {
                const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(text);
                if (link === null) {
                    return {
                        _type: 'span',
                        _key: key(),
                        text,
                        marks: [],
                    };
                }
                const mark = key();
                const target = link[2]!;
                markDefs.push({
                    _type: 'link',
                    _key: mark,
                    // A page or an item by ref, which the reader turns into its address on its own site.
                    ...(/^(?:page|item):/.test(target)
                        ? {
                              ref: target,
                          }
                        : {
                              href: target,
                          }),
                });
                return {
                    _type: 'span',
                    _key: key(),
                    text: link[1]!,
                    marks: [mark],
                };
            });
        return {
            _type: 'block',
            _key: key(),
            style,
            markDefs,
            children,
            ...(listItem === undefined
                ? {}
                : {
                      listItem,
                      level: 1,
                  }),
        };
    };
    return source
        .split(/\n\s*\n/)
        .map((chunk) => chunk.trim())
        .filter((chunk) => chunk !== '')
        .flatMap((chunk): Array<Record<string, unknown>> => {
            if (chunk.startsWith('@article ') || chunk.startsWith('@plants ')) return [linkedBlock(chunk)];
            const lines = chunk.split('\n');
            if (lines.every((line) => line.startsWith('- '))) return lines.map((line) => block(line.slice(2), 'normal', 'bullet'));
            if (chunk.startsWith('## ')) return [block(chunk.slice(3), 'h2')];
            return [block(chunk, 'normal')];
        });
};
