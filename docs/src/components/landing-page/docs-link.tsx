import { ArrowRight } from 'lucide-react';
import { ButtonLink } from '@/components/ui/button';

export function DocsLink({ href }: { href: string }) {
    return (
        <ButtonLink href={href} variant="secondary">
            Read the docs
            <ArrowRight aria-hidden />
        </ButtonLink>
    );
}
