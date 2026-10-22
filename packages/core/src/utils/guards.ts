/**
 * Type guards for values that arrive as `unknown`.
 *
 * `isRecord` existed twice, in `entrypoints.ts` and `manifests.ts`, byte for
 * byte. Both read a parsed JSON manifest, so both are asking the same question
 * about the same kind of value — and the copy that drifts first is the one
 * nobody is looking at. It lives here for the reason `paths.ts` gives: more
 * than one part of the tree asks the question, and the answer has to match.
 */

/**
 * True for a JSON object — not an array, not null.
 *
 * `typeof x === 'object' && x !== null` is the reflex, and it is wrong for
 * `[]`: an array passes it, and `Object.entries([])` is empty rather than an
 * error, so the mistake surfaces as a manifest field that reads as "present but
 * empty" instead of "not an object".
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
