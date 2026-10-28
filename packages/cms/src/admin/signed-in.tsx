import { LogOut } from 'lucide-react';
import { ICON } from '../view/context.js';
import { Avatar } from '../view/people.js';
import { humanize, type PersonView } from '../view/schema.js';

/**
 * The editor signed in, at the foot of the sidebar, with a link to sign out
 * when the app names where that happens.
 */
export function SignedIn({
    person,
    role,
    signOutPath,
}: {
    person: PersonView | undefined;
    role: string | null;
    signOutPath: string | null;
}) {
    if (person === undefined && signOutPath === null) return null;
    return (
        <div className="k-admin-nav-foot">
            {person === undefined ? null : (
                <>
                    <Avatar person={person} size={26} />
                    <span className="k-admin-signed-in">
                        <span className="k-ellipsis">{person.name}</span>
                        {role === null ? null : <span className="k-admin-role k-ellipsis">{humanize(role)}</span>}
                    </span>
                </>
            )}
            {signOutPath === null ? null : (
                <a className="k-admin-sign-out" href={signOutPath}>
                    <LogOut {...ICON} />
                    Sign out
                </a>
            )}
        </div>
    );
}
