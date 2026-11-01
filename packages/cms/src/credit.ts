/**
 * Someone as the admin credits a change: `Mia Holm`, or `Mia Holm via Claude`
 * when an agent made it for them.
 */
export const creditOf = (name: string, via: string | null): string => (via === null ? name : `${name} via ${via}`);
