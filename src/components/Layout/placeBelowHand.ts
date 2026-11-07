// Where the content of GameLayout's slot under the human hand goes in a
// narrow layout (phones held upright), and in which of its forms.
//
// The slot hangs right under the hand, centred on it. On a phone the pile
// (bottom left) and the controls (bottom right) reach into that room from
// the sides, the credits line and the edge of the window close it from
// below, and how much of it is left depends on the phone, the text size,
// the language and the number of rows on the table. So the forms of the
// content are tried in order, each against what is in its way: a form
// fits if it ends above its limit and, at its height, the gap between the
// obstacles on its left and on its right is wide enough for it. It may
// move sideways within that gap, as little as needed.
//
// This file is the geometry alone (no DOM), so that it can be tested.
// useFitBelowHand measures the screen and applies the result.

export interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface Size {
  width: number;
  height: number;
}

/** The room under the hand, in the units of the boxes (viewport px). */
export interface Room {
  /** Top edge of the slot. */
  top: number;
  /** The x its content is centred on (the middle of the hand). */
  centre: number;
  /** How far the content may reach to the sides (the window, less a margin). */
  left: number;
  right: number;
  /** Where the content should end: above the credits line. */
  creditsLine: number;
  /** Where it must end: the usable bottom of the window. */
  floor: number;
  /** How far off the centre the content may sit before a narrower form is
   *  better than moving it further. */
  nudge: number;
}

/** What is in the way, each box already grown by the clearance it is owed. */
export interface Obstacles {
  /** Drawn over the slot (the pile, buttons): never to be covered. */
  solid: Box[];
  /** The turn label, drawn under the slot: with the box drawn around it
   *  (its own extent where it has none), and as the bare text. */
  labelFrames: Box[];
  labelTexts: Box[];
}

/** One thing to try: a form of the content (0 = as designed), above the
 *  credits line or, for the small forms, reaching over it down to the floor. */
export interface Attempt {
  step: number;
  overCreditsLine?: boolean;
  /** A form that leaves part of the content out. */
  reduced?: boolean;
}

export interface Placement {
  step: number;
  /** How far to move the content sideways from the centre (px, positive = right). */
  shift: number;
}

/** Measurements are fractional: a form this much over a limit still fits. */
const SLACK = 0.5;

/** The gap left at this height between the obstacles on either side of the centre. */
function gapBetween(room: Room, bottom: number, boxes: Box[]): [number, number] {
  let { left, right } = room;
  for (const box of boxes) {
    if (box.bottom <= room.top || box.top >= bottom) continue;
    if (box.left + box.right < 2 * room.centre) left = Math.max(left, box.right);
    else right = Math.min(right, box.left);
  }
  return [left, right];
}

function overlap(a: Box, b: Box): number {
  const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return width > 0 && height > 0 ? width * height : 0;
}

/**
 * The first of `order` that fits, and where; null if nothing does.
 *
 * The content keeps clear of everything: of the label's frame if a form
 * allows it, else of its text. The forms that show all of the content
 * are tried first within a nudge of the centre, then the whole order
 * anywhere in the gap: a narrower form under the hand beats a wider one
 * pushed to the side, but not if it leaves something out.
 *
 * If that fails (a long label on a short screen), the label is given up:
 * it is drawn under the slot. Then the form and the place that cover the
 * least of its text are taken, never anything solid.
 *
 * `sizeOf` gives the size of a form; it may be asked for the same form
 * more than once.
 */
export function placeBelowHand(
  room: Room,
  obstacles: Obstacles,
  sizeOf: (step: number) => Size,
  order: Attempt[],
): Placement | null {
  const limitOf = (attempt: Attempt) => (attempt.overCreditsLine ? room.floor : room.creditsLine);
  const centred = (width: number) => room.centre - width / 2;

  for (const reach of [room.nudge, Infinity]) {
    for (const label of [obstacles.labelFrames, obstacles.labelTexts]) {
      const boxes = [...obstacles.solid, ...label];
      for (const attempt of order) {
        if (attempt.reduced && reach !== Infinity) continue;
        const { width, height } = sizeOf(attempt.step);
        const bottom = room.top + height;
        if (bottom > limitOf(attempt) + SLACK) continue;
        const [left, right] = gapBetween(room, bottom, boxes);
        if (width > right - left + SLACK) continue;
        const shift = Math.min(Math.max(centred(width), left), right - width) - centred(width);
        if (Math.abs(shift) > reach + SLACK) continue;
        return { step: attempt.step, shift };
      }
    }
  }

  let best: Placement | null = null;
  let leastCovered = Infinity;
  for (const attempt of order) {
    const { width, height } = sizeOf(attempt.step);
    const bottom = room.top + height;
    if (bottom > limitOf(attempt) + SLACK) continue;
    const [left, right] = gapBetween(room, bottom, obstacles.solid);
    if (width > right - left + SLACK) continue;
    // As far from the label as the solid obstacles allow.
    const [clearLeft, clearRight] = gapBetween(room, bottom, [...obstacles.solid, ...obstacles.labelTexts]);
    let x = Math.min(Math.max(centred(width), left), right - width);
    if (clearRight < right) x = Math.min(x, Math.max(left, clearRight - width));
    if (clearLeft > left) x = Math.max(x, Math.min(right - width, clearLeft));
    const placed = { left: x, right: x + width, top: room.top, bottom };
    const covered = obstacles.labelTexts.reduce((sum, text) => sum + overlap(placed, text), 0);
    if (covered < leastCovered) {
      best = { step: attempt.step, shift: x - centred(width) };
      leastCovered = covered;
    }
  }
  return best;
}
