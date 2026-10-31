/**
 * How long a document stays held after its holder last saved it.
 */
export const HOLD_IDLE_MS = 2 * 60 * 1000;

/**
 * Who edits a document now, and until when they hold it without saving
 * again.
 */
export interface Hold {
    /**
     * The person holding it, as `author` names them. An agent acting for a
     * person holds it as that person.
     */
    by: string;
    since: number;
    until: number;
}

/**
 * One editor per document: the first to save holds it, and anyone else's
 * write is refused until the holder leaves or goes quiet. Held in memory, and
 * passed between server instances with the draft notices.
 */
export class DocumentHolds {
    private readonly holds = new Map<string, Hold>();

    constructor(private readonly now: () => number = Date.now) {}

    /**
     * The hold on a document, while it lasts.
     */
    holder(ref: string): Hold | undefined {
        const hold = this.holds.get(ref);
        if (hold === undefined) return undefined;
        if (hold.until > this.now()) return hold;
        this.holds.delete(ref);
        return undefined;
    }

    /**
     * Holds the document for `by`, or renews their hold. Answers someone
     * else's hold, and changes nothing, when another person holds it.
     */
    claim(ref: string, by: string): Hold | undefined {
        const current = this.holder(ref);
        if (current !== undefined && current.by !== by) return current;
        const now = this.now();
        this.holds.set(ref, {
            by,
            since: current?.since ?? now,
            until: now + HOLD_IDLE_MS,
        });
        return undefined;
    }

    /**
     * Someone else's hold, without taking it.
     */
    heldByOther(ref: string, by: string): Hold | undefined {
        const current = this.holder(ref);
        return current !== undefined && current.by !== by ? current : undefined;
    }

    /**
     * Forgets every hold, as when the documents themselves are gone.
     */
    clear(): void {
        this.holds.clear();
    }

    /**
     * Ends the hold when `by` holds it. Answers whether it did.
     */
    release(ref: string, by: string): boolean {
        const current = this.holder(ref);
        if (current === undefined || current.by !== by) return false;
        this.holds.delete(ref);
        return true;
    }
}
