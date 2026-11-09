/**
 * Pass as `onUpdate` to a framer-motion element whose fade or zoom must
 * run on the main thread rather than on the browser's compositor.
 *
 * framer-motion hands `opacity` and `transform` animations to the
 * compositor (Web Animations API) whenever it can, and skips that when the
 * element has an `onUpdate` prop (AcceleratedAnimation.supports, framer-motion
 * 11.18). Chrome (desktop and Android, not Safari) flickered once about a
 * second after each dialog opened or closed: the compositor ran the dialog's
 * fade, the page then went idle, and Chrome repainted the screen on its own
 * a moment later (2026-11-08, Chrome 156). Nothing on the page changes at
 * that moment; keeping the page busy with a frame loop hid it, and animating
 * the dialogs on the main thread removes it while keeping the same look.
 */
export const keepOnMainThread = (): void => {};
