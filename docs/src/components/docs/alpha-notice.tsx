import type { ReactNode } from 'react';
import { StageNotice } from './stage-notice';

export function AlphaNotice({ children }: { children: ReactNode }) {
    return <StageNotice stage="alpha">{children}</StageNotice>;
}
