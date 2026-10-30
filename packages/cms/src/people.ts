import { CmsHttpError, type CmsService } from './cms.js';
import type { Person } from './options.js';
import { peopleFor, peopleOf } from './reviews.js';
import type { EditorAccess } from './site-access.js';
import type { Caller } from './rules.js';

const listOf = (role: string | readonly string[] | undefined): string[] =>
    role === undefined ? [] : typeof role === 'string' ? [role] : [...role];

const holdsAdmin = (caller: Caller | undefined): boolean => listOf(caller?.role).includes('admin');

/**
 * The sites an editor may invite people to and change roles on: every site
 * for an admin over every site, and the sites they are `admin` on for
 * anyone else. None without `auth.sites`.
 */
export const managedSites = (cms: CmsService, access: EditorAccess): string[] => {
    if (cms.options.auth.sites === undefined) return [];
    if (access.publishesShared) return cms.siteNames();
    return Object.keys(access.sites).filter((site) => holdsAdmin(access.sites[site]));
};

/**
 * The roles a person may hold on a site: the editor identity's roles, or
 * `auth.roles`.
 */
export const siteRoles = (cms: CmsService): string[] => cms.identityRoles()?.names.slice() ?? listOf(cms.options.auth.roles);

/**
 * The people an editor sees, each with their roles on the sites the editor
 * may open.
 */
export const peopleWithSites = async (
    cms: CmsService,
    access: EditorAccess
): Promise<Array<Person & { siteRoles?: Record<string, string[]> }>> => {
    const people = await peopleFor(cms, access);
    if (cms.options.auth.sites === undefined) return [...people];
    return people.map((person) => ({
        ...person,
        siteRoles: Object.fromEntries(
            Object.entries(person.sites ?? {})
                .filter(([site, role]) => cms.siteNames().includes(site) && access.sees(site) && listOf(role).length > 0)
                .map(([site, role]) => [site, listOf(role)])
        ),
    }));
};

/**
 * Refuses a change to sites the editor may not manage. A site they may not
 * open answers as if it did not exist.
 */
const assertManages = (cms: CmsService, access: EditorAccess, sites: readonly string[]): void => {
    const managed = managedSites(cms, access);
    if (managed.length === 0) {
        throw new CmsHttpError(403, {
            detail: 'Only an admin may invite people or change their roles.',
        });
    }
    for (const site of sites) {
        if (!cms.siteNames().includes(site)) {
            throw new CmsHttpError(404, {
                detail: `There is no site named '${site}'.`,
            });
        }
        access.assertSees(site);
        if (!managed.includes(site)) {
            throw new CmsHttpError(403, {
                detail: `Only an admin of ${cms.options.sites?.values[site]?.label ?? site} may change who edits it.`,
            });
        }
    }
};

const assertRoles = (cms: CmsService, roles: ReadonlyArray<string | null>): void => {
    const known = siteRoles(cms);
    for (const role of roles) {
        if (role !== null && known.length > 0 && !known.includes(role)) {
            throw new CmsHttpError(422, {
                detail: `There is no role named '${role}'. Choose ${known.map((name) => `'${name}'`).join(' or ')}.`,
            });
        }
    }
};

/**
 * Invites someone with a role on each site, through the app's `invite`.
 */
export const invitePerson = async (
    cms: CmsService,
    access: EditorAccess,
    invitation: { email: string; sites: Record<string, string>; invitedBy: string }
): Promise<{ id: string; link?: string }> => {
    const invite = cms.options.auth.people?.invite;
    if (invite === undefined) {
        throw new CmsHttpError(409, {
            detail: 'This app adds people itself. Set auth.people.invite to invite them here.',
        });
    }
    const sites = Object.keys(invitation.sites);
    if (sites.length === 0) {
        throw new CmsHttpError(422, {
            detail: 'Name at least one site they edit.',
        });
    }
    assertManages(cms, access, sites);
    assertRoles(cms, Object.values(invitation.sites));
    const email = invitation.email.trim().toLowerCase();
    const existing = (await peopleOf(cms)).find((person) => person.email?.toLowerCase() === email || person.id.toLowerCase() === email);
    if (existing !== undefined) {
        throw new CmsHttpError(409, {
            detail: `${invitation.email} already edits. Change their roles instead.`,
        });
    }
    const result = await invite({
        email,
        sites: invitation.sites,
        invitedBy: invitation.invitedBy,
    });
    return {
        id: result.id,
        ...(result.link === undefined
            ? {}
            : {
                  link: result.link,
              }),
    };
};

/**
 * Changes someone's role on the sites named, or takes a site away, keeping
 * their roles elsewhere, through the app's `setSites`.
 */
export const changePerson = async (
    cms: CmsService,
    access: EditorAccess,
    change: { id: string; sites: Record<string, string | null>; changedBy: string }
): Promise<void> => {
    const setSites = cms.options.auth.people?.setSites;
    if (setSites === undefined) {
        throw new CmsHttpError(409, {
            detail: "This app keeps people's roles itself. Set auth.people.setSites to change them here.",
        });
    }
    assertManages(cms, access, Object.keys(change.sites));
    assertRoles(cms, Object.values(change.sites));
    const person = (await peopleFor(cms, access)).find((candidate) => candidate.id === change.id);
    if (person === undefined) {
        throw new CmsHttpError(404, {
            detail: `There is nobody with the id '${change.id}'.`,
        });
    }
    const sites: Record<string, string | readonly string[]> = {};
    for (const [site, role] of Object.entries(person.sites ?? {})) {
        if (role !== undefined) sites[site] = role;
    }
    for (const [site, role] of Object.entries(change.sites)) {
        if (role === null) delete sites[site];
        else sites[site] = role;
    }
    await setSites({
        id: person.id,
        sites,
        changedBy: change.changedBy,
    });
};
