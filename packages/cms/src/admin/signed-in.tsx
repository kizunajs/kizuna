import { useRef } from 'react';
import { Menu } from '@base-ui/react/menu';
import { ChevronsUpDown, LogOut, MessageSquare } from 'lucide-react';
import { ICON } from '../view/context.js';
import { Avatar, type People } from '../view/people.js';
import { humanize } from '../view/schema.js';
import { THEME_CHOICES, type ThemeChoice } from './theme.js';

/**
 * The editor signed in, at the foot of the sidebar. The row opens a menu as
 * wide as itself, with their full name and their email when the app gives
 * one, the theme as one row of three choices, Edit in your chat when the API
 * serves MCP, and Sign out when the app names where signing out happens. The
 * row keeps the name and the role to a line each, however long. Sign out is
 * a link for `GET`, and sends a form for `POST`.
 */
export function SignedIn({
    person,
    role,
    signOutPath,
    signOutMethod,
    theme,
    onThemeChange,
    onEditInChat,
}: {
    person: People['people'][number] | undefined;
    role: string | null;
    signOutPath: string | null;
    signOutMethod: 'GET' | 'POST';
    theme: ThemeChoice;
    onThemeChange: (theme: ThemeChoice) => void;
    /**
     * Opens Edit in your chat, when the API serves an MCP route.
     */
    onEditInChat?: () => void;
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
    return (
        <>
            {form}
            <Menu.Root>
                <Menu.Trigger className="k-sidebar__foot k-sidebar__account">
                    <Avatar person={person} size={26} />
                    <span className="k-sidebar__person">
                        <span className="k-ellipsis">{person.name}</span>
                        {roleLabel === undefined ? null : <span className="k-sidebar__role k-ellipsis">{roleLabel}</span>}
                    </span>
                    <ChevronsUpDown {...ICON} className="k-sidebar__account-chevron" />
                </Menu.Trigger>
                <Menu.Portal>
                    <Menu.Positioner side="top" align="start" sideOffset={8} className="k-positioner">
                        <Menu.Popup className="k-popup k-menu k-account-menu">
                            <div className="k-account-menu__head">
                                <span className="k-account-menu__name">{person.name}</span>
                                {person.email === undefined ? null : <span className="k-account-menu__email">{person.email}</span>}
                                {roleLabel === undefined ? null : <span className="k-account-menu__role">{roleLabel}</span>}
                            </div>
                            <Menu.Separator className="k-account-menu__separator" />
                            <Menu.Group className="k-account-menu__theme">
                                <Menu.GroupLabel className="k-account-menu__label">Theme</Menu.GroupLabel>
                                <Menu.RadioGroup
                                    className="k-account-menu__choices"
                                    value={theme}
                                    onValueChange={(value: ThemeChoice) => onThemeChange(value)}>
                                    {THEME_CHOICES.map((choice) => (
                                        <Menu.RadioItem
                                            key={choice.value}
                                            value={choice.value}
                                            className="k-account-menu__choice"
                                            closeOnClick={false}>
                                            {choice.label}
                                        </Menu.RadioItem>
                                    ))}
                                </Menu.RadioGroup>
                            </Menu.Group>
                            {onEditInChat === undefined ? null : (
                                <>
                                    <Menu.Separator className="k-account-menu__separator" />
                                    <Menu.Item className="k-menu__item" onClick={onEditInChat}>
                                        <MessageSquare {...ICON} />
                                        Edit in your chat
                                    </Menu.Item>
                                </>
                            )}
                            {signOutPath === null ? null : (
                                <>
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
                                </>
                            )}
                        </Menu.Popup>
                    </Menu.Positioner>
                </Menu.Portal>
            </Menu.Root>
        </>
    );
}
