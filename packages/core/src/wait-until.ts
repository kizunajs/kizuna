/**
 * The longest delay `setTimeout` holds. Node runs a longer one after 1 ms.
 */
const LONGEST_TIMER_DELAY = 2 ** 31 - 1;

export interface Wait {
    /**
     * Cancel the wait, so `callback` never runs.
     */
    cancel: () => void;
}

/**
 * Run `callback` at `time`, in epoch milliseconds, waiting in steps one timer
 * can hold, so a time more than 24.8 days away does not run at once.
 */
export const waitUntil = (time: number, callback: () => void): Wait => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = (): void => {
        const remaining = Math.max(time - Date.now(), 0);
        timer = setTimeout(
            () => {
                if (Date.now() < time) {
                    arm();
                    return;
                }
                callback();
            },
            Math.min(remaining, LONGEST_TIMER_DELAY)
        );
        timer.unref?.();
    };
    arm();
    return {
        cancel: () => clearTimeout(timer),
    };
};
