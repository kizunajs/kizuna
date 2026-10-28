import type { ReactElement } from 'react';
import { Tooltip } from '@base-ui/react/tooltip';

/**
 * A short label shown beside a button that shows only an icon, on hover and
 * on keyboard focus. The button renders as given, with the tooltip's
 * handlers merged in.
 */
export function Hint({ label, children }: { label: string; children: ReactElement }) {
    return (
        <Tooltip.Root>
            <Tooltip.Trigger render={children} />
            <Tooltip.Portal>
                <Tooltip.Positioner sideOffset={6} className="k-tooltip__positioner">
                    <Tooltip.Popup className="k-popup k-tooltip">{label}</Tooltip.Popup>
                </Tooltip.Positioner>
            </Tooltip.Portal>
        </Tooltip.Root>
    );
}
