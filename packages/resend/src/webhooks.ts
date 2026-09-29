import { z } from 'zod';
import type { Resend, WebhookEvent, WebhookEventPayload } from 'resend';
import type { RouteDefinition } from 'kizunajs';
import { route, type ApiContext } from 'kizunajs/plugin';
import { ProblemDetailsSchema } from 'kizunajs/schemas';

/**
 * What a webhook event's function receives.
 */
export type ResendEventContext<Type extends WebhookEvent, Config = unknown> = ApiContext<Config> & {
    event: Extract<WebhookEventPayload, { type: Type }>;
    /**
     * The same on every delivery of one event.
     */
    deliveryId: string;
};

/**
 * A method, so a function typed from the app's `Config` still fits `on`.
 */
type EventHandler<Context> = {
    handle(context: Context): Promise<void> | void;
}['handle'];

/**
 * What runs for each webhook event, keyed by its type.
 */
export type ResendEventHandlers<Config = unknown> = {
    [Type in WebhookEvent]?: EventHandler<ResendEventContext<Type, Config>>;
};

/**
 * The webhook event functions, with `jobs` and `plugins` typed from `Config`.
 *
 * @example
 * export const resendEvents = defineResendEvents<Config>({
 *     'email.bounced': async ({ event, jobs }) => {
 *         await jobs.users.markUndeliverable.queue({
 *             input: {
 *                 email: event.data.to[0],
 *             },
 *         });
 *     },
 * });
 */
export const defineResendEvents = <Config = unknown>(handlers: ResendEventHandlers<Config>): ResendEventHandlers<Config> => handlers;

/**
 * Checks each delivery's signature, then runs the function for its event.
 */
export const webhookRoute = (resend: Resend, webhookSecret: string, on: ResendEventHandlers): RouteDefinition =>
    route({
        method: 'POST',
        path: '/webhooks',
        auth: false,
        rawBody: true,
        summary: 'Receive Resend webhook events',
        headers: z.object({
            'svix-id': z.string(),
            'svix-timestamp': z.string(),
            'svix-signature': z.string(),
        }),
        body: z.unknown(),
        responses: {
            204: z.void(),
            400: ProblemDetailsSchema,
        },
    }).handler(async (args) => {
        const { rawBody, headers, throwError } = args;
        let event: WebhookEventPayload;
        try {
            event = resend.webhooks.verify({
                payload: rawBody,
                headers: {
                    id: headers['svix-id'],
                    timestamp: headers['svix-timestamp'],
                    signature: headers['svix-signature'],
                },
                webhookSecret,
            });
        } catch {
            return throwError({
                status: 400,
                body: {
                    detail: "The webhook signature doesn't match its body.",
                },
            });
        }

        const handle = on[event.type] as ((context: Record<string, unknown>) => Promise<void> | void) | undefined;
        const { jobs, plugins } = args as unknown as Record<string, unknown>;
        await handle?.({
            event,
            deliveryId: headers['svix-id'],
            jobs,
            plugins,
        });

        return {
            status: 204,
            body: undefined,
        };
    });
