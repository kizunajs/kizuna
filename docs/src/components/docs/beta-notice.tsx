import type { ReactNode } from 'react';
import { StageNotice } from './stage-notice';

export function BetaNotice({ children }: { children: ReactNode }) {
    return <StageNotice stage="beta">{children}</StageNotice>;
}
