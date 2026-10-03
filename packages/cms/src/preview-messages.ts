/**
 * What the site's preview tells the editor framing it.
 */
export type PreviewMessage =
    | {
          /**
           * The page loaded, or a link inside the frame went to another one.
           */
          type: 'navigated';
          path: string;
      }
    | {
          /**
           * The person clicked a field. `ref` is null for the page's own
           * content, and names the document for a global or an item shown
           * on it.
           */
          type: 'point';
          ref: string | null;
          path: string;
      }
    | {
          /**
           * The preview cookie runs out soon, so the editor should send a
           * fresh link.
           */
          type: 'renew';
      };

/**
 * What the editor tells the site's preview it frames.
 */
export type EditorMessage =
    | {
          /**
           * A draft changed, so render the page again.
           */
          type: 'refresh';
      }
    | {
          /**
           * A fresh link into draft mode, to renew the preview cookie with.
           */
          type: 'renew';
          url: string;
      }
    | {
          /**
           * Whether a click points at a field or acts as it would for a
           * visitor.
           */
          type: 'mode';
          mode: 'point' | 'browse';
      };

/**
 * Marks every message, so neither side mistakes another script's for its own.
 */
export const MESSAGE_SOURCE = 'kizuna-cms';

export interface Envelope<Message> {
    source: typeof MESSAGE_SOURCE;
    message: Message;
}

export const envelope = <Message>(message: Message): Envelope<Message> => ({
    source: MESSAGE_SOURCE,
    message,
});

/**
 * The message inside `data`, when it came from the other side of the CMS.
 */
export const openEnvelope = <Message>(data: unknown): Message | undefined =>
    typeof data === 'object' && data !== null && (data as { source?: unknown }).source === MESSAGE_SOURCE
        ? (data as Envelope<Message>).message
        : undefined;
