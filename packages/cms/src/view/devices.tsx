import type { CSSProperties } from 'react';
import { SelectMenu } from './select-menu.js';

export type DeviceKey = 'desktop' | 'tablet' | 'mobile';

/**
 * The widths the preview renders the site at: the pane's own width, or a
 * device's, scaled down when the pane is narrower.
 */
export const DEVICES: ReadonlyArray<{ value: DeviceKey; label: string; width: number | undefined }> = [
    {
        value: 'desktop',
        label: 'Desktop',
        width: undefined,
    },
    {
        value: 'tablet',
        label: 'Tablet',
        width: 768,
    },
    {
        value: 'mobile',
        label: 'Mobile',
        width: 390,
    },
];

/**
 * Where the framed site sits in a stage of `stage`'s size: as wide as the
 * stage on Desktop, and at the device's width elsewhere, scaled to fit and
 * centred.
 */
export const frameStyleOf = (device: DeviceKey, stage: { width: number; height: number }): CSSProperties => {
    const width = DEVICES.find((candidate) => candidate.value === device)?.width ?? stage.width;
    const scale = stage.width === 0 || width === 0 ? 1 : Math.min(1, stage.width / width);
    return {
        width,
        height: scale === 0 ? 0 : stage.height / scale,
        transform: `scale(${scale})`,
        left: Math.max(0, (stage.width - width * scale) / 2),
    };
};

/**
 * The select at the top of the preview that picks its width.
 */
export function DeviceSelect({ value, onChange }: { value: DeviceKey; onChange: (device: DeviceKey) => void }) {
    return <SelectMenu items={DEVICES} value={value} onChange={onChange} label="Preview width" />;
}
