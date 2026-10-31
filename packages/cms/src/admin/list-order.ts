/**
 * Where an item goes, as the place route takes it.
 */
export interface PlaceBody {
    after?: string;
    before?: string;
    at?: 'first' | 'last';
    parent?: string | null;
}

/**
 * The move that puts the row at `from` where the row at `to` is, among rows
 * in the order shown, or `undefined` when it stays.
 */
export const placeAfterMove = (ids: readonly string[], from: number, to: number): PlaceBody | undefined => {
    if (from === to || ids[to] === undefined) return undefined;
    return to > from
        ? {
              after: ids[to],
          }
        : {
              before: ids[to],
          };
};

/**
 * One line of a tree as a move reads it: its id, the id above it, and how
 * deep it sits, 0 at the top.
 */
export interface TreeSpot {
    id: string;
    parent: string | null;
    depth: number;
}

/**
 * The lines left once the dragged row and everything under it are lifted
 * out, since nothing may go inside what is moving.
 */
export const linesWithout = <Line extends TreeSpot>(lines: readonly Line[], dragged: string): Line[] => {
    const index = lines.findIndex((line) => line.id === dragged);
    if (index === -1) return [...lines];
    let end = index + 1;
    while (end < lines.length && lines[end]!.depth > lines[index]!.depth) end++;
    return [...lines.slice(0, index), ...lines.slice(end)];
};

/**
 * How many levels the dragged row and everything under it take up, among
 * the lines shown.
 */
export const heightIn = (lines: readonly TreeSpot[], dragged: string): number => {
    const index = lines.findIndex((line) => line.id === dragged);
    if (index === -1) return 1;
    const top = lines[index]!.depth;
    let height = 1;
    for (let at = index + 1; at < lines.length && lines[at]!.depth > top; at++) height = Math.max(height, lines[at]!.depth - top + 1);
    return height;
};

/**
 * The levels a row may take between line `slot - 1` and line `slot`: from
 * the level of the line below up to one under the line above, and no deeper
 * than `depth` lets a row `height` levels tall go. `undefined` when none fits.
 */
export const levelsAt = (
    lines: readonly TreeSpot[],
    slot: number,
    height = 1,
    depth?: number
): { min: number; max: number } | undefined => {
    const above = lines[slot - 1];
    const below = lines[slot];
    const min = below === undefined ? 0 : Math.min(below.depth, above === undefined ? 0 : above.depth + 1);
    const deepest = above === undefined ? 0 : above.depth + 1;
    const max = depth === undefined ? deepest : Math.min(deepest, depth - height);
    return max < min ? undefined : { min, max };
};

/**
 * The item a row at `level` goes under, between line `slot - 1` and line
 * `slot`: `null` at the top.
 */
export const parentAt = (lines: readonly TreeSpot[], slot: number, level: number): string | null => {
    if (level === 0) return null;
    for (let at = slot - 1; at >= 0; at--) {
        if (lines[at]!.depth === level - 1) return lines[at]!.id;
    }
    return null;
};

/**
 * The move that puts a row at `level` between line `slot - 1` and line
 * `slot`. Without an order only its parent changes.
 */
export const placeAtSlot = (lines: readonly TreeSpot[], slot: number, level: number, orderable: boolean): PlaceBody => {
    const parent = parentAt(lines, slot, level);
    if (!orderable) {
        return {
            parent,
        };
    }
    for (let at = slot - 1; at >= 0; at--) {
        const line = lines[at]!;
        if (line.depth < level) break;
        if (line.depth === level) {
            return {
                after: line.id,
            };
        }
    }
    return {
        parent,
        at: 'first',
    };
};

/**
 * The move that puts a row under another, last.
 */
export const placeOnto = (target: string, orderable: boolean): PlaceBody =>
    orderable
        ? {
              parent: target,
              at: 'last',
          }
        : {
              parent: target,
          };

/**
 * Where its siblings put a row moved to `level` at `slot`: its number among
 * them, and how many there are with it.
 */
export const placeAmongSiblings = (lines: readonly TreeSpot[], slot: number, level: number): { position: number; count: number } => {
    const parent = parentAt(lines, slot, level);
    const siblings = lines.filter((line) => line.parent === parent && line.depth === level);
    const position = lines.slice(0, slot).filter((line) => line.parent === parent && line.depth === level).length + 1;
    return {
        position,
        count: siblings.length + 1,
    };
};

/**
 * How Move shifts the ticked rows, kept in their order.
 */
export type SelectionMove = 'top' | 'up' | 'down' | 'bottom';

/**
 * The moves that shift the ticked rows among their siblings, in the order to
 * send them: to the top or the bottom, or one place up or down past the
 * nearest sibling not ticked.
 */
export const selectionMoves = (
    rows: ReadonlyArray<{
        id: string;
        parent?: string | null | undefined;
    }>,
    ticked: ReadonlySet<string>,
    move: SelectionMove
): Array<{ id: string; body: PlaceBody }> => {
    const order = rows.filter((row) => ticked.has(row.id)).map((row) => row.id);
    if (move === 'top') {
        return [...order].reverse().map((id) => ({
            id,
            body: {
                at: 'first',
            },
        }));
    }
    if (move === 'bottom') {
        return order.map((id) => ({
            id,
            body: {
                at: 'last',
            },
        }));
    }
    const working = rows.map((row) => ({
        id: row.id,
        parent: row.parent ?? null,
    }));
    const moves: Array<{ id: string; body: PlaceBody }> = [];
    for (const id of move === 'up' ? order : [...order].reverse()) {
        const index = working.findIndex((row) => row.id === id);
        const parent = working[index]!.parent;
        const step = move === 'up' ? -1 : 1;
        let other = index + step;
        while (other >= 0 && other < working.length && working[other]!.parent !== parent) other += step;
        const passed = working[other];
        if (passed === undefined || ticked.has(passed.id)) continue;
        moves.push({
            id,
            body:
                move === 'up'
                    ? {
                          before: passed.id,
                      }
                    : {
                          after: passed.id,
                      },
        });
        const [moved] = working.splice(index, 1);
        working.splice(other, 0, moved!);
    }
    return moves;
};
