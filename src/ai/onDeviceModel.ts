// The on-device language model (Apple Intelligence on iOS 26 and later) as
// the bots see it: a registry the native bootstrap fills in, empty on the
// website. The Capacitor plugin stays behind this seam so the website
// bundles carry no native code (see src/platform/native.ts).
//
// The model is small (about three billion parameters, a 4096-token
// window) and runs entirely on the device: no key, no network, nothing
// leaves the phone. The bots send it one compact request per move.

export interface OnDeviceMoveRequest {
  /** Identifies the request so it can be cancelled and late replies ignored. */
  requestId: string;
  /** System instructions: the rules and the answer format. */
  instructions: string;
  /** The current position and the numbered legal moves. */
  prompt: string;
  /** How many legal moves there are (the answer must be below this). */
  moveCount: number;
  /** Deadline the shell enforces: past it the request rejects and the
   *  generation is cancelled, so the game can fall back. */
  timeoutMs: number;
}

/** How long a move request may take before the heuristic plays instead.
 *  `VITE_ON_DEVICE_TIMEOUT_MS` shortens it for a build that exercises the
 *  fallback path; the shell enforces a floor of one second. */
export const ON_DEVICE_TIMEOUT_MS = Number(import.meta.env?.VITE_ON_DEVICE_TIMEOUT_MS) || 20_000;

export interface OnDeviceMoveResponse {
  moveIndex: number;
  /** The verdict: which move is best and why. */
  reasoning: string;
  /** The moves the model weighed before the verdict (two or three), each
   *  with a short note; the bots render them with the card names. */
  candidates?: Array<{ moveIndex: number; note: string }>;
}

export interface OnDeviceModel {
  selectMove(request: OnDeviceMoveRequest): Promise<OnDeviceMoveResponse>;
  /** Abandon a request; a no-op for unknown or finished ids. Never rejects. */
  cancel(requestId: string): Promise<void>;
  /** Load the model and prepare the next session with these instructions
   *  ahead of the request (called while the other player is thinking).
   *  Optional; never rejects. */
  prewarm?(instructions: string): Promise<void>;
  /** Drop the prepared session (the game is over or was left). Optional; never rejects. */
  release?(): Promise<void>;
}

/** Display name of the on-device opponent. */
export const ON_DEVICE_MODEL_NAME = 'Apple Intelligence';

let model: OnDeviceModel | null = null;
let unavailableReason = 'not initialised';

/** Called once by the native bootstrap; never on the website. */
export function setOnDeviceModel(next: OnDeviceModel | null, reason = next ? 'available' : 'unavailable'): void {
  model = next;
  unavailableReason = reason;
}

export function getOnDeviceModel(): OnDeviceModel | null {
  return model;
}

export function isOnDeviceModelAvailable(): boolean {
  return model !== null;
}

/** Why there is no on-device model (diagnostics, settings hint). */
export function getOnDeviceModelUnavailableReason(): string {
  return unavailableReason;
}
