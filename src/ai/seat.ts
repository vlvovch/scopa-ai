/**
 * Seat the bot instance is bound to. In single-player (Play) mode the
 * bot always sits in the 'cpu' seat. In spectator/watch mode (CPU vs
 * CPU) the two seats need distinct instances — otherwise same-provider
 * self-play would share a single chat session / message array /
 * conversation id / token tracker, with both players' moves intermixed
 * inside one conversation.
 *
 * Each LLM bot factory includes this in its cache key.
 *
 * Shared between Scopa and Briscola so both games key the same way.
 */
export type Seat = 'cpu' | 'p1' | 'p2';
