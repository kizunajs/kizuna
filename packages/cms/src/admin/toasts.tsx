import { Toast } from '@base-ui/react/toast';
import { X } from 'lucide-react';
import { ICON } from '../view/context.js';

/**
 * The toasts in the corner, newest at the bottom: what an action said once it
 * ran.
 */
export function Toasts() {
    const { toasts } = Toast.useToastManager();
    return (
        <Toast.Portal>
            <Toast.Viewport className="k-admin-toasts">
                {toasts.map((toast) => (
                    <Toast.Root key={toast.id} toast={toast} className="k-popup k-admin-toast">
                        <Toast.Content className="k-admin-toast-content">
                            <Toast.Description className="k-admin-toast-text" />
                            <Toast.Close className="k-icon-button k-admin-toast-close" aria-label="Dismiss">
                                <X {...ICON} />
                            </Toast.Close>
                        </Toast.Content>
                    </Toast.Root>
                ))}
            </Toast.Viewport>
        </Toast.Portal>
    );
}
