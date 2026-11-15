/**
 * The longest delay `setTimeout` holds. Node fires a longer one at once.
 */
const LONGEST_TIMER_DELAY = 2 ** 31 - 1;

export interface Wait {
    cancel: () => void;
}

/**
 * Run `callback` at `time`, in milliseconds since the epoch, however far away
 * it is. The wait goes in steps one timer can hold and checks the clock after
 * each one.
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
