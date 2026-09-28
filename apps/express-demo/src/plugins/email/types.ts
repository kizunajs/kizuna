import { z } from 'zod';

export const EmailSchema = z.object({
    to: z.email(),
    subject: z.string().min(1),
    html: z.string(),
});

export type Email = z.infer<typeof EmailSchema>;
