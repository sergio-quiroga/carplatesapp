/**
 * Face emojis players can pick as their avatar.
 *
 * Single source of truth: the setup screen renders this list and the game
 * rejects anything outside it. Only single-codepoint faces, so they render
 * the same on every phone without ZWJ sequences.
 */
export const AVATARS = [
  "😀", "😁", "😂", "🤣", "😄", "😅", "😆", "😉",
  "😊", "😇", "🙂", "🙃", "😋", "😛", "😜", "🤪",
  "😝", "🤗", "🤭", "🤔", "🤨", "😐", "😏", "😬",
  "😌", "😴", "🤩", "🥳", "🤠", "😎", "🤓", "🧐",
  "🥸", "😮", "😲", "🤯", "😱", "🥶", "🥵", "😤",
];
