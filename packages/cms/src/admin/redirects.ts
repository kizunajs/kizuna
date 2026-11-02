import { fromProblem } from '../redirect-edits.js';
import type { AdminCall } from './actions.js';

/**
 * Where a redirect sends visitors, as the redirects route lists it: a page or
 * an item with its name and where it is served now, a path, or a URL.
 */
export type RedirectTo =
    | {
          type: 'document';
          ref: string;
          label: string;
          path: string | null;
      }
    | {
          type: 'path';
          path: string;
      }
    | {
          type: 'url';
          url: string;
      };

export type RedirectStatus = 307 | 308;

/**
 * One redirect of a site, as the redirects route lists it.
 */
export interface RedirectView {
    id: string;
    from: string;
    to: RedirectTo;
    status: RedirectStatus;
    origin: 'rename' | 'manual' | 'import';
    by: {
        id: string;
        name: string;
        image?: string;
    } | null;
    createdAt: string;
}

/**
 * The call one of the redirect routes takes: under the site with several
 * sites, and at the CMS's own redirects with one.
 */
export const redirectCallOf = (
    site: string | undefined,
    action: 'list' | 'create' | 'update' | 'delete',
    input: {
        id?: string;
        query?: Record<string, string>;
        body?: unknown;
    } = {}
): AdminCall => {
    const params = {
        ...(site === undefined
            ? {}
            : {
                  site,
              }),
        ...(input.id === undefined
            ? {}
            : {
                  id: input.id,
              }),
    };
    return {
        name: site === undefined ? `editing_redirects_${action}` : `editing_sites_redirects_${action}`,
        input: {
            ...(Object.keys(params).length === 0
                ? {}
                : {
                      params,
                  }),
            ...(input.query === undefined
                ? {}
                : {
                      query: input.query,
                  }),
            ...(input.body === undefined
                ? {}
                : {
                      body: input.body,
                  }),
        },
    };
};

/**
 * What a status is called beside a redirect.
 */
export const statusLabelOf = (status: RedirectStatus): string => (status === 308 ? 'Permanent' : 'Temporary');

/**
 * Who made a redirect: the rename that made it, the person, or an import.
 */
export const madeByOf = (
    redirect: Pick<RedirectView, 'origin' | 'by' | 'to'>
):
    | {
          text: string;
      }
    | {
          person: NonNullable<RedirectView['by']>;
      } => {
    if (redirect.origin === 'rename') {
        return {
            text: redirect.to.type === 'document' ? `Renamed ${redirect.to.label}` : 'Renamed',
        };
    }
    if (redirect.origin === 'import' || redirect.by === null) {
        return {
            text: 'Import',
        };
    }
    return {
        person: redirect.by,
    };
};

/**
 * Where a redirect goes, as its row shows it: a title, and under a document
 * the path it is served at.
 */
export const destinationOf = (to: RedirectTo): { title: string; detail?: string } => {
    if (to.type === 'document') {
        return {
            title: to.label,
            detail: to.path ?? 'Not published',
        };
    }
    return {
        title: to.type === 'path' ? to.path : to.url,
    };
};

/**
 * What Delete asks before it deletes a redirect.
 */
export const deleteRedirectQuestionOf = (redirect: Pick<RedirectView, 'from'>): string =>
    `Delete the redirect from ${redirect.from}? Visitors who ask for it get a page not found.`;

/**
 * What a redirect's dialog holds while it is edited.
 */
export interface RedirectForm {
    from: string;
    mode: RedirectTo['type'];
    ref: string | undefined;
    path: string;
    url: string;
    status: RedirectStatus;
}

/**
 * The dialog's fields for a redirect, or empty for a new one.
 */
export const formOf = (redirect?: RedirectView): RedirectForm => ({
    from: redirect?.from ?? '',
    mode: redirect?.to.type ?? 'document',
    ref: redirect?.to.type === 'document' ? redirect.to.ref : undefined,
    path: redirect?.to.type === 'path' ? redirect.to.path : '',
    url: redirect?.to.type === 'url' ? redirect.to.url : '',
    status: redirect?.status ?? 308,
});

/**
 * What is wrong with the dialog's From as typed, said before saving, or
 * `undefined` while it is empty or fine.
 */
export const formFromProblem = (form: Pick<RedirectForm, 'from'>): string | undefined =>
    form.from.trim() === '' ? undefined : fromProblem(form.from.trim());

/**
 * The body a save sends, or `undefined` while a field is missing.
 */
export const redirectBodyOf = (
    form: RedirectForm
):
    | {
          from: string;
          to:
              | {
                    type: 'document';
                    ref: string;
                }
              | {
                    type: 'path';
                    path: string;
                }
              | {
                    type: 'url';
                    url: string;
                };
          status: RedirectStatus;
      }
    | undefined => {
    const from = form.from.trim();
    if (from === '' || formFromProblem(form) !== undefined) return undefined;
    if (form.mode === 'document') {
        return form.ref === undefined
            ? undefined
            : {
                  from,
                  to: {
                      type: 'document',
                      ref: form.ref,
                  },
                  status: form.status,
              };
    }
    if (form.mode === 'path') {
        const path = form.path.trim();
        return path === ''
            ? undefined
            : {
                  from,
                  to: {
                      type: 'path',
                      path,
                  },
                  status: form.status,
              };
    }
    const url = form.url.trim();
    return url === ''
        ? undefined
        : {
              from,
              to: {
                  type: 'url',
                  url,
              },
              status: form.status,
          };
};

/**
 * The body that makes a deleted redirect again, for Undo.
 */
export const recreateBodyOf = (redirect: RedirectView) => ({
    from: redirect.from,
    to:
        redirect.to.type === 'document'
            ? {
                  type: redirect.to.type,
                  ref: redirect.to.ref,
              }
            : redirect.to,
    status: redirect.status,
});
