import { z } from 'zod';
import { cron } from 'kizunajs';
import { db } from './db';
import { k } from './k';

/**
 * The API's scheduled jobs, grouped the way a real API would be.
 */
export const jobs = k.jobs('scheduler', {
    users: {
        sendDigests: k
            .job({
                schedule: cron.daily('05:00'),
                summary: 'Send the daily digest to every user',
                result: z.object({
                    sent: z.int(),
                }),
            })
            .handler(async () => ({
                status: 200,
                body: {
                    sent: await db.users.count(),
                },
            })),
        indexUser: k
            .job({
                summary: 'Re-index one user, queued when that user changes',
                retry: 3,
                input: z.object({
                    userId: z.string(),
                }),
                result: z.object({
                    indexed: z.boolean(),
                }),
            })
            .handler(async ({ input, throwError }) => {
                const user = await db.users.findById(input.userId);
                if (!user) {
                    throwError({
                        status: 422,
                        body: {
                            detail: `No user with id ${input.userId}`,
                        },
                    });
                }
                return {
                    status: 200,
                    body: {
                        indexed: true,
                    },
                };
            }),
    },
    workspaces: {
        reconcile: k
            .job({
                schedule: cron.every('15m'),
                summary: 'Reconcile workspace memberships',
                result: z.object({
                    reconciled: z.int(),
                }),
            })
            .handler(async () => ({
                status: 200,
                body: {
                    reconciled: await db.users.count(),
                },
            })),
        expireInvites: k
            .job({
                schedule: {
                    cron: '0 3 * * *',
                    timezone: 'Europe/Oslo',
                },
                summary: 'Drop invites past their expiry',
            })
            .handler(() => ({
                status: 204,
                body: undefined,
            })),
    },
});
