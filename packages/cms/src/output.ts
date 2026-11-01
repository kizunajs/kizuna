import type { z } from 'zod';
import type { ImageRef, ResolvedCrop, ResolvedImage } from './image.js';
import type { LinkRef, ResolvedLink } from './links.js';
import type { COLLECTION } from './definitions.js';
import type { PAGE } from './page.js';

type Primitive = string | number | bigint | boolean | symbol | null | undefined | Date;

/**
 * A value as the page component receives it: every stored image reference
 * replaced by its {@link ResolvedImage}, every link by its address, everything
 * else as the schema outputs it.
 */
export type Resolved<T> = T extends ImageRef
    ? 'crops' extends keyof T
        ? ResolvedImage & {
              crops: {
                  [Name in keyof NonNullable<T['crops' & keyof T]>]-?: ResolvedCrop;
              };
          }
        : ResolvedImage
    : T extends LinkRef
      ? ResolvedLink
      : T extends RichTextLinkMark
        ? {
              _type: 'link';
              _key: string;
              href: string;
          }
        : T extends Primitive
          ? T
          : T extends readonly unknown[]
            ? {
                  [Index in keyof T]: Resolved<T[Index]>;
              }
            : T extends object
              ? {
                    [Key in keyof T]: Resolved<T[Key]>;
                }
              : T;

/**
 * A link mark in rich text, as stored.
 */
interface RichTextLinkMark {
    _type: 'link';
    _key: string;
}

/**
 * The type of a block or a page once the CMS has resolved its media: what
 * `cms.pages.<name>.get()` returns, and what a block's component takes.
 *
 * @example
 * export function Hero(props: Output<typeof HeroBlockSchema>) {
 *     return <img src={props.image.url} alt={props.image.alt} />;
 * }
 */
export type Output<T> = T extends {
    readonly [COLLECTION]: true;
    readonly schema: infer Schema extends z.ZodType;
    readonly id: infer Id extends z.ZodType;
}
    ? {
          id: z.output<Id>;
      } & Resolved<z.output<Schema>>
    : T extends {
            readonly [PAGE]: true;
            readonly collection: infer Served extends {
                readonly [COLLECTION]: true;
            };
        }
      ? Output<Served>
      : T extends {
              readonly schema: infer Schema extends z.ZodType;
          }
        ? T extends z.ZodType
            ? Resolved<z.output<T>>
            : Resolved<z.output<Schema>>
        : T extends z.ZodType
          ? Resolved<z.output<T>>
          : never;
