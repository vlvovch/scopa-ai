// The phone landscape layout: a phone held sideways.
//
// The stylesheets select it with a media query: index.css sets the card
// sizes, the spacing, the root font size and the playing area, and the
// components' styles follow. CSS has no way to share a media query, so each
// stylesheet repeats the condition; phoneLandscape.test.ts checks that they
// all repeat the one below. Scripts that depend on the layout take it from
// here.
//
// The condition is a landscape window up to 500px tall that is either up to
// 960px wide or driven by touch:
//  - The height limit alone would also take short desktop windows such as
//    1280x500, and those keep the desktop layout.
//  - The width limit holds every iPhone (the widest is 956px) and the short
//    desktop windows narrow enough to need the compact layout.
//  - Touch as the main pointer takes the phones wider than that (some
//    Android models are close to 1000px wide) without taking desktop windows.

/** The layout's media query; `maxHeight` 400 gives its step for the shortest screens. */
export function phoneLandscapeQuery(maxHeight = 500): string {
  return [
    `(max-height: ${maxHeight}px) and (max-width: 960px) and (orientation: landscape)`,
    `(max-height: ${maxHeight}px) and (pointer: coarse) and (orientation: landscape)`,
  ].join(', ');
}

export const PHONE_LANDSCAPE_QUERY = phoneLandscapeQuery();

/** Any landscape window as short as that layout's, the wide desktop ones included. */
export const SHORT_LANDSCAPE_QUERY = '(orientation: landscape) and (max-height: 500px)';
