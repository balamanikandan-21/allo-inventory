// src/lib/nanoid.ts
// Tiny cryptographically-random ID generator — no native dependencies.
// Generates URL-safe 21-character IDs similar to cuid.

import { randomBytes } from "crypto";

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const ID_LENGTH = 21;

export function nanoid(length = ID_LENGTH): string {
  const bytes = randomBytes(length);
  return Array.from(bytes)
    .map((b) => ALPHABET[b % ALPHABET.length])
    .join("");
}
