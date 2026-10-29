/**
 * What the server writes into the sign-in screen when it serves it.
 */
export interface SignInConfig {
    /**
     * The route the form sends the email and password to, from the site's
     * root.
     */
    signInPath: string;
    /**
     * Where the editor goes once signed in: a path on this site.
     */
    next: string;
    /**
     * The visitor is signed in already, without a role that edits.
     */
    noAccess: boolean;
    /**
     * What editors call the site, from `name` on `cms()`, which the screen
     * asks them to sign in to.
     */
    siteName?: string | undefined;
}
