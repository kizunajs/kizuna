import { Toast } from '@base-ui/react/toast';
import { X } from 'lucide-react';
import { ICON } from '../view/context.js';

/**
 * The toasts in the corner, newest at the bottom: what an action said once it
 * ran, with a button like Undo when the toast was added with `actionProps`.
 */
export function Toasts() {
    const { toasts } = Toast.useToastManager();
    return (
        <Toast.Portal>
            <Toast.Viewport className="k-toasts">
                {toasts.map((toast) => (
                    <Toast.Root key={toast.id} toast={toast} className="k-popup k-toast">
                        <Toast.Content className="k-toast__content">
                            <Toast.Description className="k-toast__text" />
                            <Toast.Action className="k-button k-button--secondary k-button--small k-toast__action" />
                            <Toast.Close className="k-icon-button k-toast__close" aria-label="Dismiss">
                                <X {...ICON} />
                            </Toast.Close>
                        </Toast.Content>
                    </Toast.Root>
                ))}
            </Toast.Viewport>
        </Toast.Portal>
    );
}
