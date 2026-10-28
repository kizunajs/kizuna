import { Select } from '@base-ui/react/select';
import { Check, ChevronsUpDown } from 'lucide-react';
import { ICON } from './context.js';

/**
 * A compact select for a screen's own settings, like the preview's width or
 * the dashboard's period, where a field's full-width input would be too much.
 */
export function SelectMenu<Value extends string>({
    items,
    value,
    onChange,
    label,
}: {
    items: ReadonlyArray<{ value: Value; label: string }>;
    value: Value;
    onChange: (value: Value) => void;
    /**
     * What a screen reader calls the select.
     */
    label: string;
}) {
    return (
        <Select.Root
            items={items}
            value={value}
            onValueChange={(next) => {
                if (next !== null) onChange(next);
            }}>
            <Select.Trigger className="k-select-menu" aria-label={label}>
                <Select.Value />
                <Select.Icon className="k-select-menu__icon">
                    <ChevronsUpDown {...ICON} />
                </Select.Icon>
            </Select.Trigger>
            <Select.Portal>
                <Select.Positioner sideOffset={6} align="end" alignItemWithTrigger={false} className="k-positioner">
                    <Select.Popup className="k-popup k-menu">
                        {items.map((item) => (
                            <Select.Item key={item.value} value={item.value} className="k-menu__item">
                                <Select.ItemText>{item.label}</Select.ItemText>
                                <Select.ItemIndicator className="k-menu__check">
                                    <Check {...ICON} />
                                </Select.ItemIndicator>
                            </Select.Item>
                        ))}
                    </Select.Popup>
                </Select.Positioner>
            </Select.Portal>
        </Select.Root>
    );
}
