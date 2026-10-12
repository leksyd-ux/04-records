import crypto from "crypto";

/**
 * Generates an opaque, human-friendly public identifier for records.
 * Format: rec_<16_random_hex_chars> (e.g. rec_a8f9c1e2d3b45678)
 *
 * Crucial Security Note:
 * An opaque public identifier prevents ID enumeration and hides internal
 * database primary keys, but hiding an identifier is NOT access control.
 * All queries MUST still enforce structural ownership:
 * `WHERE publicId = ? AND userId = ?`
 */
export function generatePublicId(): string {
  return `rec_${crypto.randomBytes(8).toString("hex")}`;
}
