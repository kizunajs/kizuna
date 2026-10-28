import { useRef } from 'react';
import { Menu } from '@base-ui/react/menu';
import { ChevronsUpDown, LogOut } from 'lucide-react';
import { ICON } from '../view/context.js';
import { Avatar } from '../view/people.js';
import { humanize, type PersonView } from '../view/schema.js';

/**
 * The editor signed in, at the foot of the sidebar. When the app names where
 * signing out happens, the row opens a menu with their full name and Sign
 * out. The row keeps the name and the role to a line each, however long.
 * Sign out is a link for `GET`, and sends a form for `POST`.
 */
export function SignedIn({
    person,
    role,
    signOutPath,
    signOutMethod,
}: {
    person: PersonView | undefined;
    role: string | null;
    signOutPath: string | null;
    signOutMethod: 'GET' | 'POST';
}) {
    const signOutForm = useRef<HTMLFormElement>(null);
    const form =
        signOutPath === null || signOutMethod === 'GET' ? null : <form ref={signOutForm} method="post" action={signOutPath} hidden />;

    if (person === undefined) {
        if (signOutPath === null) return null;
        return (
            <div className="k-sidebar__foot">
                {signOutMethod === 'GET' ? (
                    <a className="k-sidebar__sign-out" href={signOutPath}>
                        <LogOut {...ICON} />
                        Sign out
                    </a>
                ) : (
                    <form method="post" action={signOutPath}>
                        <button type="submit" className="k-sidebar__sign-out">
                            <LogOut {...ICON} />
                            Sign out
                        </button>
                    </form>
                )}
            </div>
        );
    }
    const roleLabel = role === null ? undefined : humanize(role);
    const who = (
        <>
            <Avatar person={person} size={26} />
            <span className="k-sidebar__person">
                <span className="k-ellipsis">{person.name}</span>
                {roleLabel === undefined ? null : <span className="k-sidebar__role k-ellipsis">{roleLabel}</span>}
            </span>
        </>
    );
    if (signOutPath === null) return <div className="k-sidebar__foot">{who}</div>;
    return (
        <>
            {form}
            <Menu.Root>
                <Menu.Trigger className="k-sidebar__foot k-sidebar__account">
                    {who}
                    <ChevronsUpDown {...ICON} className="k-sidebar__account-chevron" />
                </Menu.Trigger>
                <Menu.Portal>
                    <Menu.Positioner side="top" align="start" sideOffset={6} className="k-positioner">
                        <Menu.Popup className="k-popup k-menu k-account-menu">
                            <div className="k-account-menu__head">
                                <span className="k-account-menu__name">{person.name}</span>
                                {roleLabel === undefined ? null : <span className="k-sidebar__role">{roleLabel}</span>}
                            </div>
                            <Menu.Separator className="k-account-menu__separator" />
                            {signOutMethod === 'GET' ? (
                                <Menu.LinkItem className="k-menu__item" href={signOutPath}>
                                    <LogOut {...ICON} />
                                    Sign out
                                </Menu.LinkItem>
                            ) : (
                                <Menu.Item className="k-menu__item" onClick={() => signOutForm.current?.requestSubmit()}>
                                    <LogOut {...ICON} />
                                    Sign out
                                </Menu.Item>
                            )}
                        </Menu.Popup>
                    </Menu.Positioner>
                </Menu.Portal>
            </Menu.Root>
        </>
    );
}
