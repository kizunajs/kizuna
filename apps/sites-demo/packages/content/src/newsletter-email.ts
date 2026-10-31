import type { Output } from '@kizunajs/cms';
import type { Newsletters } from './newsletters';

/**
 * What the email shows of an issue.
 */
export type NewsletterContent = Pick<Output<typeof Newsletters>, 'subject' | 'preheader' | 'body'>;

/**
 * Who the email greets. A broadcast passes Resend's `{{{FIRST_NAME|there}}}`,
 * which Resend fills in for each contact.
 */
export interface NewsletterRecipient {
    firstName: string;
}

/**
 * An issue as the HTML its recipients get, for Live Preview, the test email
 * and the broadcast alike.
 */
export const renderNewsletter = async (_newsletter: NewsletterContent, _recipient: NewsletterRecipient): Promise<string> => {
    throw new Error(
        'The newsletter template needs React Email. Run `pnpm --filter @kizunajs-demo/sites-content add @react-email/components @react-email/render`.'
    );
};
