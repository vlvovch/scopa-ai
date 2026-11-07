// Fits the content of GameLayout's slot under the human hand (the analysis
// panel) into the room the layout leaves there.
//
// The slot starts right under the hand (`.belowHand` in
// GameLayout.module.css), and how far it is from there to the bottom of
// the window depends on the window, the text size, the scoreboard and the
// piles around the centre column, and the number of rows on the table.
// CSS cannot see that distance, so it is measured here: the content is
// asked to shrink one step at a time (`data-fit` on the slot: "0" as
// designed, then "1", "2", ...; the content's own styles say what each
// step looks like) until it fits.
//
// Wide layouts (landscape windows, tablets): the room is as wide as the
// content needs, so a step fits when it ends above the credits line. If
// the last step still reaches past the bottom of the window, the slot
// moves up by the excess (`--lift`) over what is above it, which beats
// leaving the screen.
//
// Narrow layouts (phones held upright; `data-narrow` on the slot, and a
// longer list of steps): the pile and the controls reach into the room
// from the sides, so each step is also checked against them, and the slot
// may move sideways (`--shift`) to pass the pile. The rules are in
// placeBelowHand.ts. If no step fits, the content is hidden
// (`data-fit="none"`) rather than laid over the numbers under the cards:
// they say the same and more.

import { useCallback, useEffect, useLayoutEffect, type RefObject } from 'react';
import { placeBelowHand, type Attempt, type Box, type Size } from './placeBelowHand';

/** Smaller forms the content can be asked for after the one it has by design. */
const SHRINK_STEPS = 2;

/** The same in narrow layouts, where there are more of them
 *  (WinOddsPanel.module.css), in the order they are tried. The forms
 *  without the title (4 to 6) may reach over the credits line before the
 *  last one, the first figure alone, is taken. */
const NARROW_ORDER: Attempt[] = [
  { step: 0 },
  { step: 1 },
  { step: 2 },
  { step: 3 },
  { step: 4 },
  { step: 5 },
  { step: 6 },
  { step: 4, overCreditsLine: true },
  { step: 5, overCreditsLine: true },
  { step: 6, overCreditsLine: true },
  { step: 7, reduced: true },
  { step: 7, reduced: true, overCreditsLine: true },
];

/** Phones held upright and other narrow portrait windows. The desktop-site
 *  rescue (index.css, html.dmode) lays the phone out the same way whatever
 *  its locked viewport tells the query. */
const NARROW_QUERY = '(orientation: portrait) and (max-width: 699px)';

/** The layout's bottom padding under its bottom row, without the home
 *  indicator inset the app adds to it (GameLayout.module.css). */
const BOTTOM_PADDING = 24;

/** Clearances in narrow layouts, px: to the sides of the window, around
 *  the pile's area (which has a padding of its own), around buttons and
 *  around the turn label (sideways, and above it). */
const EDGE_GAP = 4;
const PILE_GAP = 6;
const CONTROL_GAP = 8;
const LABEL_GAP_ABOVE = 4;

/** How far the content may sit off the middle of the hand before a
 *  narrower form is preferred, px. */
const NUDGE = 24;

interface Parts {
  layout: HTMLElement;
  slot: HTMLElement;
  bottomRow: HTMLElement | null;
  pile: HTMLElement | null;
  controls: HTMLElement | null;
  footer: HTMLElement | null;
}

function isNarrow(): boolean {
  return (
    document.documentElement.classList.contains('dmode') ||
    (typeof window.matchMedia === 'function' && window.matchMedia(NARROW_QUERY).matches)
  );
}

/** The desktop-site rescue zooms the page: measured boxes are in zoomed
 *  px, lengths written to styles are not. 1 everywhere else. */
function pageZoom(): number {
  const html = document.documentElement;
  if (!html.classList.contains('dmode')) return 1;
  return parseFloat(getComputedStyle(html).getPropertyValue('--dmode-scale')) || 1;
}

function grown(box: Box, sideways: number, upDown: number): Box {
  return { left: box.left - sideways, right: box.right + sideways, top: box.top - upDown, bottom: box.bottom + upDown };
}

/** The box drawn around a piece of the controls' text, if it has one: the
 *  outermost element inside `area` with a background of its own. */
function frameOf(element: Element, area: Element): Box | null {
  let frame: Box | null = null;
  for (let e: Element | null = element; e && e !== area; e = e.parentElement) {
    if (getComputedStyle(e).backgroundColor !== 'rgba(0, 0, 0, 0)') frame = e.getBoundingClientRect();
  }
  return frame;
}

/** What the controls show: their buttons, and their text (the turn label)
 *  both with the box drawn around it and as the bare text. */
function controlBoxes(area: HTMLElement): { buttons: Box[]; frames: Box[]; texts: Box[] } {
  const buttons: Box[] = [];
  const frames: Box[] = [];
  const texts: Box[] = [];
  for (const button of area.querySelectorAll('button')) {
    const box = button.getBoundingClientRect();
    if (box.width && box.height) buttons.push(box);
  }
  const walker = document.createTreeWalker(area, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (!parent || !node.nodeValue?.trim() || parent.closest('button')) continue;
    range.selectNodeContents(node);
    const text = range.getBoundingClientRect();
    if (!text.width || !text.height) continue;
    texts.push(text);
    frames.push(frameOf(parent, area) ?? text);
  }
  return { buttons, frames, texts };
}

function fitNarrow({ layout, slot, pile, controls }: Parts, creditsLine: number, floor: number, zoom: number) {
  const bounds = layout.getBoundingClientRect();
  const left = bounds.left + EDGE_GAP * zoom;
  const right = bounds.right - EDGE_GAP * zoom;

  // What must stay clear. The pile and the buttons are drawn over the
  // slot and count always. The turn label is drawn under it: the content
  // keeps clear of the label's box if a form allows it, else of its text,
  // and only then is laid over it.
  const solid: Box[] = [];
  const pileBox = pile?.getBoundingClientRect();
  if (pileBox && pileBox.width && pileBox.height) solid.push(grown(pileBox, PILE_GAP * zoom, PILE_GAP * zoom));
  const { buttons, frames, texts } = controls ? controlBoxes(controls) : { buttons: [], frames: [], texts: [] };
  for (const box of buttons) solid.push(grown(box, CONTROL_GAP * zoom, CONTROL_GAP * zoom));
  const around = (boxes: Box[]) => boxes.map((box) => grown(box, CONTROL_GAP * zoom, LABEL_GAP_ABOVE * zoom));

  slot.dataset.fit = '0';
  const natural = slot.getBoundingClientRect();
  const sizes: Size[] = [natural];
  const sizeOf = (step: number): Size => {
    if (!sizes[step]) {
      slot.dataset.fit = String(step);
      sizes[step] = slot.getBoundingClientRect();
    }
    return sizes[step];
  };

  const placement = placeBelowHand(
    {
      top: natural.top,
      centre: (natural.left + natural.right) / 2,
      left,
      right,
      creditsLine,
      floor,
      nudge: NUDGE * zoom,
    },
    { solid, labelFrames: around(frames), labelTexts: around(texts) },
    sizeOf,
    NARROW_ORDER,
  );
  if (!placement) {
    slot.dataset.fit = 'none';
    return;
  }
  slot.dataset.fit = String(placement.step);
  if (Math.abs(placement.shift) >= 0.5) slot.style.setProperty('--shift', `${(placement.shift / zoom).toFixed(1)}px`);
}

function fit(parts: Parts) {
  const { layout, slot, bottomRow, footer } = parts;
  slot.style.removeProperty('--lift');
  slot.style.removeProperty('--shift');
  const narrow = isNarrow();
  slot.toggleAttribute('data-narrow', narrow);
  const zoom = pageZoom();
  // The usable bottom of the window: its edge, or the home indicator
  // inset in the app, which the bottom row stays clear of.
  const windowBottom = layout.getBoundingClientRect().bottom;
  const floor = bottomRow
    ? Math.min(windowBottom, bottomRow.getBoundingClientRect().bottom + BOTTOM_PADDING * zoom)
    : windowBottom;
  const creditsLine = footer ? Math.min(floor, footer.getBoundingClientRect().top) : floor;
  if (narrow) {
    fitNarrow(parts, creditsLine, floor, zoom);
    return;
  }
  for (let step = 0; ; step++) {
    slot.dataset.fit = String(step);
    if (step === SHRINK_STEPS || slot.getBoundingClientRect().bottom <= creditsLine + 0.5) break;
  }
  const over = slot.getBoundingClientRect().bottom - floor;
  if (over > 0.5) slot.style.setProperty('--lift', `${Math.ceil(over)}px`);
}

export function useFitBelowHand(refs: {
  layout: RefObject<HTMLElement>;
  slot: RefObject<HTMLElement>;
  bottomRow: RefObject<HTMLElement>;
  pile: RefObject<HTMLElement>;
  controls: RefObject<HTMLElement>;
  footer: RefObject<HTMLElement>;
}) {
  const { layout, slot, bottomRow, pile, controls, footer } = refs;

  const fitNow = useCallback(() => {
    if (!layout.current || !slot.current) return;
    fit({
      layout: layout.current,
      slot: slot.current,
      bottomRow: bottomRow.current,
      pile: pile.current,
      controls: controls.current,
      footer: footer.current,
    });
  }, [layout, slot, bottomRow, pile, controls, footer]);

  // After every render: the content of the slot may have changed, and so
  // may the controls beside it.
  useLayoutEffect(fitNow);

  // And whenever the hand moves without a render here: the window or the
  // text size changes, a row or one of its areas grows or shrinks.
  useEffect(() => {
    const root = layout.current;
    if (!root || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(fitNow);
    observer.observe(root);
    for (const row of root.children) {
      observer.observe(row);
      for (const area of row.children) observer.observe(area);
    }
    return () => observer.disconnect();
  }, [layout, fitNow]);
}
