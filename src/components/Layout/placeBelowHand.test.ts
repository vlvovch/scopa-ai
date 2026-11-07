import { describe, expect, it } from 'vitest';
import { placeBelowHand, type Attempt, type Box, type Obstacles, type Room, type Size } from './placeBelowHand';

// Geometries below are taken from phones measured in the browser (text
// size 1.2): the pile's area grown by its clearance, the turn label as
// text and with its frame.

const box = (left: number, top: number, right: number, bottom: number): Box => ({ left, top, right, bottom });
const sizes = (table: Record<number, [number, number]>) => (step: number): Size => {
  const [width, height] = table[step];
  return { width, height };
};
const only = (solid: Box[]): Obstacles => ({ solid, labelFrames: [], labelTexts: [] });

/** 390x844: the hand's numbers end at 626, the pile's corner is bottom left. */
const tallPhone: Room = { top: 632, centre: 195, left: 4, right: 386, creditsLine: 828, floor: 844, nudge: 20 };
const tallPhonePile = box(6, 649, 81, 828);

describe('placeBelowHand', () => {
  it('takes the form as designed, centred, where it fits', () => {
    const placement = placeBelowHand(tallPhone, only([tallPhonePile]), sizes({ 0: [176, 61] }), [{ step: 0 }]);
    expect(placement).toEqual({ step: 0, shift: 0 });
  });

  it('moves sideways past the pile, as little as needed', () => {
    // 360x740, win / tie / loss on one line: 230px centred on 180 starts at 65, the pile ends at 76
    const room: Room = { top: 561, centre: 180, left: 4, right: 356, creditsLine: 724, floor: 740, nudge: 20 };
    const placement = placeBelowHand(room, only([box(5, 560, 76, 726)]), sizes({ 0: [230, 56] }), [{ step: 0 }]);
    expect(placement).toEqual({ step: 0, shift: 11 });
  });

  it('prefers a narrower form under the hand to a wide one pushed to the side', () => {
    // 430x932, Italian labels: one line is 332px and would sit 39px off the centre
    const room: Room = { top: 677, centre: 215, left: 4, right: 426, creditsLine: 916, floor: 932, nudge: 20 };
    const pile = box(7, 726, 88, 916);
    const table = sizes({ 0: [332, 56], 2: [244, 77], 7: [150, 29] });
    expect(placeBelowHand(room, only([pile]), table, [{ step: 0 }, { step: 2 }])).toEqual({ step: 2, shift: 0 });
    // ...but not to one that leaves figures out
    expect(placeBelowHand(room, only([pile]), table, [{ step: 0 }, { step: 7, reduced: true }])).toEqual({
      step: 0,
      shift: 39,
    });
  });

  it('takes a shorter form where the hand is low, over the credits line before the first figure alone', () => {
    // 375x667 with three rows on the table: 30px between the numbers and the credits line
    const room: Room = { top: 622, centre: 187.5, left: 4, right: 371, creditsLine: 652, floor: 667, nudge: 20 };
    const order: Attempt[] = [{ step: 0 }, { step: 4 }, { step: 4, overCreditsLine: true }, { step: 7, reduced: true }];
    const table = sizes({ 0: [176, 61], 4: [150, 29], 7: [70, 20] });
    expect(placeBelowHand(room, only([]), table, order)).toEqual({ step: 4, shift: 0 });
    // 8px lower the one line reaches over the credits line: still better than the figure without its unit
    expect(placeBelowHand({ ...room, top: 630 }, only([]), table, order)).toEqual({ step: 4, shift: 0 });
    expect(placeBelowHand({ ...room, top: 630 }, only([]), table, [{ step: 0 }, { step: 4 }, { step: 7, reduced: true }])).toEqual({
      step: 7,
      shift: 0,
    });
  });

  it("keeps clear of the turn label's frame if a form allows it, else of its text", () => {
    // 375x667, Briscola: the label's box starts 10px above its text
    const room: Room = { top: 529, centre: 187.5, left: 4, right: 371, creditsLine: 652, floor: 667, nudge: 20 };
    const obstacles: Obstacles = {
      solid: [box(5, 483, 77, 653)],
      labelFrames: [box(243, 602, 373, 650)],
      labelTexts: [box(262, 612, 354, 640)],
    };
    const table = sizes({ 2: [232, 77], 5: [232, 48] });
    // with its title the panel ends inside the frame's height: the form without the title stays above it
    expect(placeBelowHand(room, obstacles, table, [{ step: 2 }, { step: 5 }])).toEqual({ step: 5, shift: 5.5 });
    // no such form: over the frame, but not over the text
    expect(placeBelowHand(room, obstacles, table, [{ step: 2 }])).toEqual({ step: 2, shift: 5.5 });
  });

  it('lays the form that covers the least of a long label over it, as far from it as the pile allows', () => {
    // 375x635 while the opponent is thinking: the label reaches left to 207, the pile right to 77
    const room: Room = { top: 555, centre: 187.5, left: 4, right: 371, creditsLine: 620, floor: 635, nudge: 20 };
    const label = box(207, 578, 370, 606);
    const obstacles: Obstacles = { solid: [box(5, 451, 77, 621)], labelFrames: [label], labelTexts: [label] };
    const table = sizes({ 0: [176, 61], 4: [150, 29] });
    expect(placeBelowHand(room, obstacles, table, [{ step: 0 }, { step: 4 }])).toEqual({ step: 4, shift: -35.5 });
  });

  it('never covers the pile or a button, and gives up when nothing fits', () => {
    // the hand at the bottom of the window: no room under it
    const low: Room = { ...tallPhone, top: 840 };
    expect(placeBelowHand(low, only([tallPhonePile]), sizes({ 0: [176, 61], 4: [150, 29] }), [{ step: 0 }, { step: 4 }])).toBeNull();
    // a button across the room at the content's height
    const button = box(100, 640, 390, 690);
    expect(placeBelowHand(tallPhone, only([tallPhonePile, button]), sizes({ 0: [176, 61] }), [{ step: 0 }])).toBeNull();
  });
});
