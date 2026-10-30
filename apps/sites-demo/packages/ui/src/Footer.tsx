/**
 * The company behind the site, and the group's privacy policy.
 */
export function Footer({ companyName }: { companyName: string }) {
    return (
        <footer>
            <p>{companyName}</p>
            <a href="/privacy">Privacy policy</a>
        </footer>
    );
}
