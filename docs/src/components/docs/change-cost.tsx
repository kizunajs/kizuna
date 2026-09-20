import { Terminal } from 'lucide-react';
import { Card, Cards } from 'fumadocs-ui/components/card';
export function ChangeCost() {
    return (
        <div className="mt-2 mb-8 flex flex-col items-center">
            <div className="not-prose flex items-center gap-2 rounded-lg border bg-fd-card px-3 py-2 font-mono text-xs text-fd-muted-foreground">
                <Terminal className="size-3.5 text-fd-foreground" />
                kizuna diff --against main
            </div>

            <div aria-hidden className="h-6 w-px bg-fd-border" />

            <div className="not-prose w-full rounded-xl border bg-fd-card px-4 py-3 font-mono text-[13px] leading-relaxed">
                <div className="text-fd-muted-foreground">GET /users/:id</div>
                <div className="text-fd-foreground">
                    <span className="mr-1 text-fd-muted-foreground">-</span> email: z.email()
                </div>
                <div className="text-fd-foreground">
                    <span className="mr-1 text-fd-muted-foreground">+</span> email_address: z.email()
                </div>
            </div>

            <div aria-hidden className="h-6 w-px bg-fd-border" />

            <div className="w-full rounded-xl border bg-fd-card px-4 py-3 font-mono text-[13px] leading-relaxed">
                <div className="text-fd-muted-foreground">CI</div>
                <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
                    <code>BREAKING</code>
                    <span className="text-fd-foreground">GET /users/:id 200.email removed</span>
                </div>
                <div className="mt-1 text-fd-muted-foreground">exit 1</div>
            </div>

            <div aria-hidden className="h-6 w-px bg-fd-border" />

            {/* The rail spans the centre of each column, so both lines land inside a card. */}
            <div aria-hidden className="relative h-5 w-full">
                <div className="absolute top-0 right-[calc((100%-0.75rem)/4)] left-[calc((100%-0.75rem)/4)] h-px bg-fd-border" />
                <div className="grid h-full grid-cols-2 gap-x-3">
                    <div className="flex justify-center">
                        <div className="h-full w-px bg-fd-border" />
                    </div>
                    <div className="flex justify-center">
                        <div className="h-full w-px bg-fd-border" />
                    </div>
                </div>
            </div>

            <Cards className="w-full">
                <Card href="/docs/deprecations" title="Deprecate it">
                    Serve <code>email</code> and <code>email_address</code> together until the sunset date you set. Nothing on the old name
                    breaks.
                </Card>
                <Card href="/docs/breaking-changes" title="Break it on purpose">
                    Label the pull request <code>breaking changes</code>. CI stays red until someone signs off on it.
                </Card>
            </Cards>
        </div>
    );
}
