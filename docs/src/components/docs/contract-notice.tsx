import { Info } from 'lucide-react';

export function ContractNotice() {
    return (
        <div className="my-4 flex items-start gap-2.5 rounded-lg border bg-fd-card px-4 py-3 text-sm text-fd-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0" />
            <span>
                Routes carry their handlers, so what you declare here stays on the server. A browser imports the client{' '}
                <code>kizuna generate</code> writes from it.
            </span>
        </div>
    );
}
