// Field-wise decryption of an info file: AES-128-CBC, key = the 16 md5 bytes
// of the password, iv = the first 16 bytes of the base64 field, rest is the
// ciphertext. Each encrypted field carries its own iv, one field per call.

import { createDecipheriv, createHash } from "node:crypto";

const IV_LEN = 16;

export class SfdlError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "SfdlError";
  }
}

/** The 16 md5 bytes of the password, used as the AES key. */
export function deriveKey(password: string): Buffer {
  return createHash("md5").update(password, "utf8").digest();
}

/** Decodes the base64 field, splits iv and ciphertext, and returns the decrypted
    text. */
export function decryptField(base64Value: string, password: string): string {
  const raw = Buffer.from(base64Value, "base64");
  if (raw.length <= IV_LEN)
    throw new SfdlError(`verschlüsselter Wert zu kurz (${raw.length} Byte)`);

  const iv = raw.subarray(0, IV_LEN);
  const ciphertext = raw.subarray(IV_LEN);

  // final() checks the pkcs7 padding, the step that fails on a wrong password.
  try {
    const decipher = createDecipheriv("aes-128-cbc", deriveKey(password), iv);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()])
      .toString("utf8")
      .trim();
  } catch (error) {
    throw new SfdlError("Entschlüsselung fehlgeschlagen — Passwort vermutlich falsch", {
      cause: error,
    });
  }
}
