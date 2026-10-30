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
     * What editors call the site, which the screen asks them to sign in to:
     * the label of the site this deployment shows, or `name` on `cms()`.
     */
    siteName?: string | undefined;
    /**
     * The icon of the site this deployment shows, as a full URL, which the
     * screen and the browser tab show in place of the kanji.
     */
    siteIcon?: string | undefined;
}
