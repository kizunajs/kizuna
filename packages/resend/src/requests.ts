import type { CreateBroadcastOptions, CreateEmailOptions, ErrorResponse, Resend } from 'resend';
import type { ResendList, ResendPluginProps } from './options.js';

/**
 * A call to Resend that answered with an error.
 */
export class ResendRequestError extends Error {
    readonly action: string;
    readonly error: ErrorResponse;

    constructor(action: string, error: ErrorResponse) {
        super(`[kizuna/resend] ${action} failed: ${error.message}`);
        this.action = action;
        this.error = error;
    }
}

interface ResendResponse<Data> {
    data: Data | null;
    error: ErrorResponse | null;
    headers: Record<string, string> | null;
}

/**
 * How many times a rate-limited call is tried again.
 */
const RATE_LIMIT_RETRIES = 3;

const wait = (milliseconds: number) =>
    new Promise((resolve) => {
        setTimeout(resolve, milliseconds);
    });

/**
 * Call Resend, retrying when it's rate limited, and throw its error.
 */
const call = async <Data>(action: string, request: () => Promise<ResendResponse<Data>>): Promise<Data> => {
    let response = await request();
    for (let retry = 0; retry < RATE_LIMIT_RETRIES && response.error?.name === 'rate_limit_exceeded'; retry++) {
        const seconds = Number(response.headers?.['retry-after'] ?? 1);
        await wait((Number.isFinite(seconds) ? seconds : 1) * 1000);
        response = await request();
    }
    if (response.error !== null) throw new ResendRequestError(action, response.error);
    return response.data as Data;
};

/**
 * Every item of a paginated Resend list.
 */
const everyPage = async <Item extends { id: string }>(
    action: string,
    request: (after: string | undefined) => Promise<ResendResponse<{ data: Item[]; has_more: boolean }>>
): Promise<Item[]> => {
    const items: Item[] = [];
    let after: string | undefined;
    for (;;) {
        const page = await call(action, () => request(after));
        items.push(...page.data);
        const last = page.data.at(-1);
        if (!page.has_more || last === undefined) return items;
        after = last.id;
    }
};

const listOf = (addresses: string | string[] | undefined): string[] =>
    addresses === undefined ? [] : Array.isArray(addresses) ? addresses : [addresses];

/**
 * The email as `intercept` sends it: to the `deliverTo` addresses it names, and
 * to `forwardTo` in their place or in bcc. Headers keep who it was for.
 */
const intercepted = (email: ResendEmail, intercept: NonNullable<ResendPluginProps['intercept']>): ResendEmail => {
    if (!intercept.enabled) return email;
    const forwardTo = listOf(intercept.forwardTo);

    const deliverTo = (intercept.deliverTo ?? []).map((entry) => entry.toLowerCase());
    const delivered = (address: string) => {
        const lowered = address.toLowerCase();
        return deliverTo.some((entry) => (entry.startsWith('@') ? lowered.endsWith(entry) : lowered === entry));
    };
    const to = listOf(email.to).filter(delivered);
    const cc = listOf(email.cc).filter(delivered);
    const bcc = listOf(email.bcc).filter(delivered);

    const originals = {
        'X-Intercepted-To': listOf(email.to),
        'X-Intercepted-Cc': listOf(email.cc),
        'X-Intercepted-Bcc': listOf(email.bcc),
    };
    const headers = {
        ...email.headers,
        ...Object.fromEntries(
            Object.entries(originals)
                .filter(([, addresses]) => addresses.length > 0)
                .map(([name, addresses]) => [name, addresses.join(', ')])
        ),
    };

    return {
        ...email,
        to: to.length > 0 ? to : forwardTo,
        cc,
        bcc: to.length > 0 ? [...bcc, ...forwardTo] : bcc,
        subject: intercept.subjectPrefix === undefined ? email.subject : `${intercept.subjectPrefix} ${email.subject}`,
        headers,
    } as ResendEmail;
};

type DistributiveOmit<Value, Key extends PropertyKey> = Value extends unknown ? Omit<Value, Key> : never;

/**
 * An email, with `from` falling back to the plugin's.
 */
export type ResendEmail = DistributiveOmit<CreateEmailOptions, 'from'> & {
    from?: string;
};

/**
 * A broadcast to one of the plugin's lists, with `from` falling back to the
 * plugin's.
 */
export type ResendBroadcast = DistributiveOmit<
    CreateBroadcastOptions,
    'from' | 'segmentId' | 'audienceId' | 'topicId' | 'send' | 'scheduledAt'
> & {
    /**
     * The list it goes to.
     */
    list: string;
    from?: string;
    /**
     * When to send it, as an ISO 8601 date or a relative time like `in 2 days`.
     * Leave it out to send now.
     */
    scheduledAt?: string;
};

interface TopicSubscription {
    id: string;
    subscription: 'opt_in' | 'opt_out';
}

export interface ResendSubscriber {
    email: string;
    /**
     * The list they join.
     */
    list: string;
    firstName?: string;
    lastName?: string;
}

export interface ResendEmailChange {
    /**
     * The contact's current address.
     */
    from: string;
    /**
     * Its new address.
     */
    to: string;
}

export interface ResendUnsubscriber {
    email: string;
    /**
     * The list they leave. Leave it out to unsubscribe them from everything.
     */
    list?: string;
}

/**
 * What handlers reach at `plugins.resend`.
 */
export const resendExports = (resend: Resend, options: ResendPluginProps) => {
    const listNamed = (name: string): ResendList => {
        const list = options.lists?.[name];
        if (list === undefined) throw new Error(`[kizuna/resend] No list is named '${name}'. Declare it under \`lists\`.`);
        return list;
    };

    return {
        /**
         * The Resend client, for anything the plugin doesn't cover.
         */
        client: resend,

        /**
         * Send one email.
         */
        sendEmail: (email: ResendEmail): Promise<{ id: string }> => {
            const addressed = options.intercept === undefined ? email : intercepted(email, options.intercept);
            return call('Sending the email', () =>
                resend.emails.send({
                    from: options.from,
                    ...addressed,
                } as CreateEmailOptions)
            );
        },

        /**
         * Add a contact to a list, creating the contact when it's new.
         */
        subscribe: async ({ email, list: name, firstName, lastName }: ResendSubscriber): Promise<{ contactId: string }> => {
            const list = listNamed(name);
            const topics: TopicSubscription[] =
                list.topicId === undefined
                    ? []
                    : [
                          {
                              id: list.topicId,
                              subscription: 'opt_in',
                          },
                      ];

            const found = await resend.contacts.get({
                email,
            });
            if (found.error?.name === 'not_found') {
                const created = await call('Creating the contact', () =>
                    resend.contacts.create({
                        email,
                        firstName,
                        lastName,
                        segments: [
                            {
                                id: list.segmentId,
                            },
                        ],
                        topics,
                    })
                );
                return {
                    contactId: created.id,
                };
            }
            if (found.error !== null) throw new ResendRequestError('Looking up the contact', found.error);

            await call('Updating the contact', () =>
                resend.contacts.update({
                    email,
                    unsubscribed: false,
                    firstName,
                    lastName,
                })
            );
            await call('Adding the contact to the segment', () =>
                resend.contacts.segments.add({
                    email,
                    segmentId: list.segmentId,
                })
            );
            if (topics.length > 0) {
                await call('Opting the contact in to the topic', () =>
                    resend.contacts.topics.update({
                        email,
                        topics,
                    })
                );
            }
            return {
                contactId: found.data.id,
            };
        },

        /**
         * Move a contact to a new address, keeping its name, its lists and its
         * topics. Resend can't change a contact's email, so this creates the new
         * contact and removes the old one.
         */
        changeEmail: async ({ from, to }: ResendEmailChange): Promise<{ contactId: string }> => {
            const contact = await call('Looking up the contact', () =>
                resend.contacts.get({
                    email: from,
                })
            );
            const segments = await everyPage('Listing the contact segments', (after) =>
                resend.contacts.segments.list({
                    email: from,
                    limit: 100,
                    ...(after === undefined
                        ? {}
                        : {
                              after,
                          }),
                })
            );
            const topics = await everyPage('Listing the contact topics', (after) =>
                resend.contacts.topics.list({
                    email: from,
                    limit: 100,
                    ...(after === undefined
                        ? {}
                        : {
                              after,
                          }),
                })
            );

            const created = await call('Creating the contact', () =>
                resend.contacts.create({
                    email: to,
                    firstName: contact.first_name ?? undefined,
                    lastName: contact.last_name ?? undefined,
                    unsubscribed: contact.unsubscribed,
                    segments: segments.map((segment) => ({
                        id: segment.id,
                    })),
                    topics: topics.map((topic) => ({
                        id: topic.id,
                        subscription: topic.subscription,
                    })),
                })
            );
            await call('Removing the old contact', () =>
                resend.contacts.remove({
                    email: from,
                })
            );
            return {
                contactId: created.id,
            };
        },

        /**
         * Take a contact off one list, or off everything.
         */
        unsubscribe: async ({ email, list: name }: ResendUnsubscriber): Promise<void> => {
            if (name === undefined) {
                await call('Unsubscribing the contact', () =>
                    resend.contacts.update({
                        email,
                        unsubscribed: true,
                    })
                );
                return;
            }
            const { segmentId, topicId } = listNamed(name);
            if (topicId === undefined) {
                await call('Removing the contact from the segment', () =>
                    resend.contacts.segments.remove({
                        email,
                        segmentId,
                    })
                );
                return;
            }
            await call('Opting the contact out of the topic', () =>
                resend.contacts.topics.update({
                    email,
                    topics: [
                        {
                            id: topicId,
                            subscription: 'opt_out',
                        },
                    ],
                })
            );
        },

        /**
         * Send a broadcast to a list, now or at `scheduledAt`.
         */
        sendBroadcast: ({ list: name, from, scheduledAt, ...content }: ResendBroadcast): Promise<{ id: string }> => {
            const list = listNamed(name);
            return call('Sending the broadcast', () =>
                resend.broadcasts.create({
                    ...content,
                    from: from ?? options.from,
                    segmentId: list.segmentId,
                    topicId: list.topicId,
                    send: true,
                    scheduledAt,
                } as CreateBroadcastOptions)
            );
        },
    };
};
