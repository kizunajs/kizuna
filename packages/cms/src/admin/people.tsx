import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Checkbox } from '@base-ui/react/checkbox';
import { Select } from '@base-ui/react/select';
import { Check, ChevronsUpDown, Copy, Search, UserPlus, X } from 'lucide-react';
import type { Connection } from '../view/connection.js';
import { ICON } from '../view/context.js';
import { Avatar } from '../view/people.js';
import { humanize } from '../view/schema.js';
import type { AdminSite } from './config.js';
import { ConfirmDialog, type Confirmation } from './confirm.js';
import { PageHeader } from './page-header.js';
import { Loading, problemOf } from './parts.js';
import { SiteIcon } from './site-switcher.js';

/**
 * A person as the people route lists them, with their roles on each site
 * the editor may open.
 */
interface ListedPerson {
    id: string;
    name: string;
    email?: string;
    image?: string;
    roles?: string[];
    sites?: Record<string, string[]>;
}

/**
 * The people route's answer, with what the editor may change about people.
 */
interface PeopleList {
    me: string;
    people: ListedPerson[];
    manage?: {
        sites: string[];
        roles: string[];
        invite: boolean;
        change: boolean;
    };
}

/**
 * What the right side shows: a person, or the invite form.
 */
type Chosen =
    | {
          kind: 'person';
          id: string;
      }
    | {
          kind: 'invite';
      };

const isAdminEverywhere = (person: ListedPerson): boolean => person.roles?.includes('admin') === true;

const sitesHeldBy = (person: ListedPerson): string[] =>
    Object.keys(person.sites ?? {}).filter((site) => (person.sites?.[site] ?? []).length > 0);

const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;

/**
 * A role list in words, like "Editor" or "Editor, Admin".
 */
const roleText = (roles: readonly string[]): string => roles.map(humanize).join(', ');

function RoleSelect({
    roles,
    value,
    label,
    disabled = false,
    onChange,
}: {
    roles: readonly string[];
    value: string;
    label: string;
    disabled?: boolean;
    onChange: (role: string) => void;
}) {
    const items = roles.map((role) => ({
        label: humanize(role),
        value: role,
    }));
    return (
        <Select.Root
            items={items}
            value={value}
            disabled={disabled}
            onValueChange={(next) => {
                if (next !== null) onChange(next);
            }}>
            <Select.Trigger className="k-input k-select" aria-label={label}>
                <Select.Value />
                <Select.Icon className="k-select__icon">
                    <ChevronsUpDown {...ICON} />
                </Select.Icon>
            </Select.Trigger>
            <Select.Portal>
                <Select.Positioner sideOffset={6} align="start" alignItemWithTrigger={false} className="k-positioner">
                    <Select.Popup className="k-popup k-menu k-menu--select">
                        {items.map((item) => (
                            <Select.Item key={item.value} value={item.value} className="k-menu__item">
                                <Select.ItemText>{item.label}</Select.ItemText>
                                <Select.ItemIndicator className="k-menu__check">
                                    <Check {...ICON} />
                                </Select.ItemIndicator>
                            </Select.Item>
                        ))}
                    </Select.Popup>
                </Select.Positioner>
            </Select.Portal>
        </Select.Root>
    );
}

/**
 * One person: who they are, and their role on each site, which an admin of
 * that site changes or takes away.
 */
function PersonDetail({
    person,
    sites,
    manage,
    onChange,
}: {
    person: ListedPerson;
    sites: readonly AdminSite[];
    manage: PeopleList['manage'];
    onChange: (sites: Record<string, string | null>) => Promise<string | undefined>;
}) {
    const [confirming, setConfirming] = useState<(Confirmation & { site: string }) | undefined>();
    const [problem, setProblem] = useState<string | undefined>();
    const [adding, setAdding] = useState<string | undefined>();
    const managed = manage?.change === true ? manage.sites : [];
    const held = sitesHeldBy(person);
    const addable = managed.filter((site) => !held.includes(site));
    const roles = manage?.roles ?? [];
    const labelOf = (key: string): string => sites.find((candidate) => candidate.key === key)?.label ?? key;
    const change = async (next: Record<string, string | null>) => {
        setProblem(await onChange(next));
    };
    useEffect(() => {
        setProblem(undefined);
        setAdding(undefined);
    }, [person.id]);
    return (
        <section className="k-sites__chosen" aria-label={person.name}>
            <div className="k-sites__head">
                <Avatar person={person} size={40} />
                <div className="k-sites__title">
                    <h2 className="k-sites__name">{person.name}</h2>
                    <dl className="k-page-header__meta k-page-header__meta--pairs">
                        {person.email === undefined ? null : (
                            <div className="k-page-header__pair">
                                <dt>Email</dt>
                                <dd>{person.email}</dd>
                            </div>
                        )}
                        <div className="k-page-header__pair">
                            <dt>Role</dt>
                            <dd>{isAdminEverywhere(person) ? 'Admin over every site' : roleText(person.roles ?? [])}</dd>
                        </div>
                    </dl>
                </div>
            </div>
            {isAdminEverywhere(person) ? null : (
                <>
                    <h3 className="k-heading k-sites__heading">
                        Sites <span className="k-sites__heading-count">{held.length}</span>
                    </h3>
                    {held.length === 0 ? null : (
                        <div className="k-table__scroll">
                            <table className="k-table k-people__sites" aria-label={`${person.name}'s sites`}>
                                <thead>
                                    <tr>
                                        <th scope="col">Site</th>
                                        <th scope="col">Role</th>
                                        <th scope="col">
                                            <span className="k-visually-hidden">Remove</span>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {held.map((key) => {
                                        const site = sites.find((candidate) => candidate.key === key);
                                        const role = person.sites?.[key] ?? [];
                                        const mayChange = managed.includes(key);
                                        return (
                                            <tr key={key} className="k-table__row">
                                                <td className="k-table__title">
                                                    <span className="k-site-fact">
                                                        <SiteIcon site={site} />
                                                        {site?.label ?? key}
                                                    </span>
                                                </td>
                                                <td className="k-people__role">
                                                    {mayChange && role.length === 1 ? (
                                                        <RoleSelect
                                                            roles={roles}
                                                            value={role[0]!}
                                                            label={`Role on ${labelOf(key)}`}
                                                            onChange={(next) =>
                                                                void change({
                                                                    [key]: next,
                                                                })
                                                            }
                                                        />
                                                    ) : (
                                                        roleText(role)
                                                    )}
                                                </td>
                                                <td className="k-people__remove">
                                                    {mayChange ? (
                                                        <button
                                                            type="button"
                                                            className="k-icon-button"
                                                            aria-label={`Take ${labelOf(key)} away from ${person.name}`}
                                                            onClick={() =>
                                                                setConfirming({
                                                                    site: key,
                                                                    label: 'Remove',
                                                                    question: `Remove ${person.name} from ${labelOf(key)}? They can no longer open it.`,
                                                                })
                                                            }>
                                                            <X {...ICON} />
                                                        </button>
                                                    ) : null}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                    {addable.length === 0 ? null : (
                        <div className="k-people__add">
                            <SitePicker sites={sites} keys={addable} value={adding} onChange={setAdding} />
                            <button
                                type="button"
                                className="k-button k-button--secondary"
                                disabled={adding === undefined || roles.length === 0}
                                onClick={() => {
                                    if (adding === undefined) return;
                                    void change({
                                        [adding]: roles[0]!,
                                    }).then(() => setAdding(undefined));
                                }}>
                                Add to site
                            </button>
                        </div>
                    )}
                </>
            )}
            {problem === undefined ? null : (
                <p className="k-error" role="alert">
                    {problem}
                </p>
            )}
            <ConfirmDialog
                confirming={confirming}
                onCancel={() => setConfirming(undefined)}
                onConfirm={() => {
                    if (confirming === undefined) return;
                    const site = confirming.site;
                    setConfirming(undefined);
                    void change({
                        [site]: null,
                    });
                }}
            />
        </section>
    );
}

function SitePicker({
    sites,
    keys,
    value,
    onChange,
}: {
    sites: readonly AdminSite[];
    keys: readonly string[];
    value: string | undefined;
    onChange: (site: string) => void;
}) {
    const items = keys.map((key) => ({
        label: sites.find((candidate) => candidate.key === key)?.label ?? key,
        value: key,
    }));
    return (
        <Select.Root
            items={items}
            value={value ?? null}
            onValueChange={(next) => {
                if (next !== null) onChange(next);
            }}>
            <Select.Trigger className="k-input k-select" aria-label="Site to add">
                <Select.Value placeholder="Choose a site" />
                <Select.Icon className="k-select__icon">
                    <ChevronsUpDown {...ICON} />
                </Select.Icon>
            </Select.Trigger>
            <Select.Portal>
                <Select.Positioner sideOffset={6} align="start" alignItemWithTrigger={false} className="k-positioner">
                    <Select.Popup className="k-popup k-menu k-menu--select">
                        {items.map((item) => (
                            <Select.Item key={item.value} value={item.value} className="k-menu__item">
                                <SiteIcon site={sites.find((candidate) => candidate.key === item.value)} />
                                <Select.ItemText>{item.label}</Select.ItemText>
                                <Select.ItemIndicator className="k-menu__check">
                                    <Check {...ICON} />
                                </Select.ItemIndicator>
                            </Select.Item>
                        ))}
                    </Select.Popup>
                </Select.Positioner>
            </Select.Portal>
        </Select.Root>
    );
}

/**
 * The invite form: an email, a role, and the sites they edit with it. Once
 * sent, the link that signs them in, to copy to them.
 */
function InviteForm({
    connection,
    sites,
    manage,
    onInvited,
    onCancel,
    onDone,
}: {
    connection: Connection;
    sites: readonly AdminSite[];
    manage: NonNullable<PeopleList['manage']>;
    onInvited: () => void;
    onCancel: () => void;
    onDone: (id: string) => void;
}) {
    const [email, setEmail] = useState('');
    const [role, setRole] = useState(manage.roles.includes('editor') ? 'editor' : (manage.roles[0] ?? ''));
    const [chosen, setChosen] = useState<readonly string[]>(manage.sites.length === 1 ? manage.sites : []);
    const [pending, setPending] = useState(false);
    const [problem, setProblem] = useState<string | undefined>();
    const [invited, setInvited] = useState<{ id: string; email: string; link?: string } | undefined>();
    const [copied, setCopied] = useState(false);
    const send = async (event: FormEvent) => {
        event.preventDefault();
        setPending(true);
        setProblem(undefined);
        const answer = await connection.call<{ id: string; link?: string }>('editing_people_invite', {
            body: {
                email,
                sites: Object.fromEntries(chosen.map((site) => [site, role])),
            },
        });
        setPending(false);
        if (answer.status !== 201) {
            setProblem(problemOf(answer, 'The invite could not be sent.'));
            return;
        }
        setInvited({
            id: answer.body.id,
            email,
            ...(answer.body.link === undefined
                ? {}
                : {
                      link: answer.body.link,
                  }),
        });
        onInvited();
    };
    if (invited !== undefined) {
        return (
            <section className="k-sites__chosen" aria-label="Invited">
                <h2 className="k-sites__name">Invited {invited.email}</h2>
                {invited.link === undefined ? null : (
                    <div className="k-field">
                        <label className="k-field__label" htmlFor="k-people-link">
                            Sign-in link
                        </label>
                        <div className="k-people__link">
                            <input
                                id="k-people-link"
                                className="k-input"
                                readOnly
                                value={invited.link}
                                onFocus={(event) => event.target.select()}
                            />
                            <button
                                type="button"
                                className="k-button k-button--secondary"
                                onClick={() =>
                                    void navigator.clipboard.writeText(invited.link!).then(() => {
                                        setCopied(true);
                                    })
                                }>
                                {copied ? <Check {...ICON} /> : <Copy {...ICON} />}
                                {copied ? 'Copied' : 'Copy link'}
                            </button>
                        </div>
                    </div>
                )}
                <div className="k-people__actions">
                    <button type="button" className="k-button k-button--primary" onClick={() => onDone(invited.id)}>
                        Done
                    </button>
                </div>
            </section>
        );
    }
    return (
        <section className="k-sites__chosen" aria-labelledby="k-people-invite">
            <h2 id="k-people-invite" className="k-sites__name">
                Invite
            </h2>
            <form className="k-fields k-people__form" onSubmit={(event) => void send(event)}>
                <div className="k-field">
                    <label className="k-field__label" htmlFor="k-people-email">
                        Email
                    </label>
                    <input
                        id="k-people-email"
                        className="k-input"
                        type="email"
                        autoComplete="off"
                        required
                        autoFocus
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                    />
                </div>
                <div className="k-field">
                    <span className="k-field__label">Role</span>
                    <RoleSelect roles={manage.roles} value={role} label="Role" onChange={setRole} />
                </div>
                <fieldset className="k-field k-people__sites-field">
                    <legend className="k-field__label">Edits</legend>
                    <div className="k-people__choices">
                        {manage.sites.map((key) => {
                            const site = sites.find((candidate) => candidate.key === key);
                            const checked = chosen.includes(key);
                            return (
                                <label key={key} className="k-people__choice">
                                    <Checkbox.Root
                                        className="k-check"
                                        checked={checked}
                                        onCheckedChange={(next) =>
                                            setChosen((current) =>
                                                next ? [...current, key] : current.filter((candidate) => candidate !== key)
                                            )
                                        }>
                                        <Checkbox.Indicator className="k-check__indicator">
                                            <Check {...ICON} />
                                        </Checkbox.Indicator>
                                    </Checkbox.Root>
                                    <SiteIcon site={site} />
                                    {site?.label ?? key}
                                </label>
                            );
                        })}
                    </div>
                </fieldset>
                {problem === undefined ? null : (
                    <p className="k-error" role="alert">
                        {problem}
                    </p>
                )}
                <div className="k-people__actions">
                    <button type="button" className="k-button k-button--secondary" onClick={onCancel}>
                        Cancel
                    </button>
                    <button
                        type="submit"
                        className="k-button k-button--primary"
                        disabled={pending || email.trim() === '' || chosen.length === 0}>
                        {pending ? 'Sending…' : 'Send invite'}
                    </button>
                </div>
            </form>
        </section>
    );
}

/**
 * People: everyone who edits in a list, and the one chosen beside it with
 * their role on each site. An admin invites people and changes their roles
 * on the sites they manage.
 */
export function People({ connection, sites }: { connection: Connection; sites: readonly AdminSite[] }) {
    const [list, setList] = useState<PeopleList | undefined>();
    const [problem, setProblem] = useState<string | undefined>();
    const [filter, setFilter] = useState('');
    const [chosen, setChosen] = useState<Chosen | undefined>();
    const load = useCallback(async () => {
        const answer = await connection.call<PeopleList>('editing_people_list');
        if (answer.status === 200) setList(answer.body);
        else setProblem(problemOf(answer, 'People could not be loaded.'));
    }, [connection]);
    useEffect(() => {
        void load();
    }, [load]);
    const people = useMemo(() => [...(list?.people ?? [])].sort((first, second) => first.name.localeCompare(second.name)), [list]);
    const shown = useMemo(() => {
        const words = filter.trim().toLowerCase();
        return words === ''
            ? people
            : people.filter((person) => person.name.toLowerCase().includes(words) || person.email?.toLowerCase().includes(words) === true);
    }, [people, filter]);
    if (list === undefined) return <Loading problem={problem} />;
    const manage = list.manage;
    const mayInvite = manage !== undefined && manage.invite && manage.sites.length > 0;
    const first = people[0];
    const current: Chosen | undefined =
        chosen ??
        (first === undefined
            ? undefined
            : {
                  kind: 'person',
                  id: first.id,
              });
    const person = current?.kind === 'person' ? people.find((candidate) => candidate.id === current.id) : undefined;
    const groups = [
        {
            label: 'Admins',
            people: shown.filter(isAdminEverywhere),
        },
        {
            label: 'Editors',
            people: shown.filter((candidate) => !isAdminEverywhere(candidate)),
        },
    ].filter((group) => group.people.length > 0);
    const change = async (id: string, next: Record<string, string | null>): Promise<string | undefined> => {
        const answer = await connection.call('editing_people_change', {
            params: {
                id,
            },
            body: {
                sites: next,
            },
        });
        await load();
        return answer.status === 204 ? undefined : problemOf(answer, 'The change could not be saved.');
    };
    return (
        <>
            <PageHeader
                title="People"
                meta={[
                    {
                        label: 'Total',
                        value: plural(people.length, 'person', 'people'),
                    },
                ]}
                actions={
                    mayInvite ? (
                        <button
                            type="button"
                            className="k-button k-button--secondary"
                            onClick={() =>
                                setChosen({
                                    kind: 'invite',
                                })
                            }>
                            <UserPlus {...ICON} />
                            Invite
                        </button>
                    ) : undefined
                }
            />
            <div className="k-admin__body k-sites">
                <nav className="k-sites__list" aria-label="People">
                    <label className="k-list-toolbar__search">
                        <Search {...ICON} />
                        <span className="k-visually-hidden">Filter people</span>
                        <input
                            type="search"
                            value={filter}
                            placeholder={`Filter ${people.length} people`}
                            onChange={(event) => setFilter(event.target.value)}
                        />
                    </label>
                    {groups.map((group) => (
                        <div key={group.label} className="k-sites__group" role="group" aria-label={group.label}>
                            <p className="k-heading">
                                {group.label} · {group.people.length}
                            </p>
                            {group.people.map((candidate) => (
                                <button
                                    key={candidate.id}
                                    type="button"
                                    className="k-sidebar__item k-sites__entry k-people__entry"
                                    aria-current={person?.id === candidate.id ? 'page' : undefined}
                                    onClick={() =>
                                        setChosen({
                                            kind: 'person',
                                            id: candidate.id,
                                        })
                                    }>
                                    <Avatar person={candidate} size={20} />
                                    <span className="k-sidebar__label k-ellipsis">{candidate.name}</span>
                                    {isAdminEverywhere(candidate) ? null : (
                                        <span className="k-sites__count">{sitesHeldBy(candidate).length}</span>
                                    )}
                                </button>
                            ))}
                        </div>
                    ))}
                </nav>
                {current?.kind === 'invite' && manage !== undefined ? (
                    <InviteForm
                        key="invite"
                        connection={connection}
                        sites={sites}
                        manage={manage}
                        onInvited={() => void load()}
                        onCancel={() => setChosen(undefined)}
                        onDone={(id) =>
                            setChosen({
                                kind: 'person',
                                id,
                            })
                        }
                    />
                ) : person === undefined ? null : (
                    <PersonDetail person={person} sites={sites} manage={manage} onChange={(next) => change(person.id, next)} />
                )}
            </div>
        </>
    );
}
