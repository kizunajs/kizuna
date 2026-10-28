/**
 * Text with the words an editor wrapped in `*asterisks*` set in italics, so
 * "Plants that *stay alive*" leans on its last words. No text renders nothing.
 */
export function Emphasis({ text }: { text?: string }) {
    if (text === undefined) return null;
    const parts = text.split(/\*([^*]+)\*/);
    return <>{parts.map((part, index) => (index % 2 === 1 ? <em key={index}>{part}</em> : part))}</>;
}
