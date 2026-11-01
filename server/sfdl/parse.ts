// Read an info file: flat xml with <SFDLFile> as root. With Encrypted=true the
// fields listed here hold base64(AES-128-CBC); Port and ListMethod stay plain.

import { decryptField, SfdlError } from "./aes";
import { looksLikeXml, rootName, tagValue } from "./xml";

// The fields an info file may carry encrypted.
const ENCRYPTED_FIELDS = [
  "host",
  "username",
  "password",
  "description",
  "uploader",
  "bulkPath",
] as const;

export type SfdlField = (typeof ENCRYPTED_FIELDS)[number];

export type Sfdl = {
  host: string;
  port: number;
  username: string;
  password: string;
  // Multi releases share a server; auth says whether a login is needed.
  authRequired: boolean;
  bulkPath: string;
  // "Auto" means: try LIST, then MLSD.
  listMethod: string;
  description: string;
  uploader: string;
  encrypted: boolean;
};

export type SfdlProblems = Partial<Record<SfdlField, string>>;

export type SfdlResult = {
  sfdl: Sfdl;
  // One entry per field whose decryption failed.
  problems: SfdlProblems;
  // Access is unusable; a download would be pointless.
  invalid: string[];
};

const HOST_RE = /^(\d{1,3}\.){3}\d{1,3}$|^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

/** Reads the flat sfdl xml into the access fields; encrypted fields stay as they
    arrive. */
export function parse(data: Uint8Array): Sfdl {
  const text = new TextDecoder().decode(data).replace(/^\ufeff/, "");

  if (!looksLikeXml(text)) throw new SfdlError("Info-Datei ist kein XML");
  const root = rootName(text);
  if (root !== "sfdlfile") throw new SfdlError(`unerwartete XML-Wurzel <${root}>`);

  const port = Number.parseInt(tagValue(text, "Port"), 10);

  return {
    host: tagValue(text, "Host"),
    port: Number.isFinite(port) ? port : 0,
    username: tagValue(text, "Username"),
    password: tagValue(text, "Password"),
    authRequired: tagValue(text, "AuthRequired").toLowerCase() === "true",
    bulkPath: tagValue(text, "BulkFolderPath"),
    listMethod: tagValue(text, "ListMethod") || "Auto",
    description: tagValue(text, "Description"),
    uploader: tagValue(text, "Uploader"),
    encrypted: tagValue(text, "Encrypted").toLowerCase() === "true",
  };
}

/** Parses the file and decrypts each listed field with the password, keeping the
    failure text of a field in problems. */
export function resolve(data: Uint8Array, password: string): SfdlResult {
  const sfdl = parse(data);
  const problems: SfdlProblems = {};

  if (sfdl.encrypted) {
    for (const field of ENCRYPTED_FIELDS) {
      const value = sfdl[field];
      if (!value) continue;
      try {
        sfdl[field] = decryptField(value, password);
      } catch (error) {
        sfdl[field] = "";
        problems[field] = error instanceof SfdlError ? error.message : String(error);
      }
    }
  }

  return { sfdl, problems, invalid: validate(sfdl) };
}

/** The list of access errors; an empty list means the access can serve a
    download. */
export function validate(sfdl: Sfdl): string[] {
  const invalid: string[] = [];

  if (!sfdl.host) invalid.push("kein FTP-Host");
  else if (!HOST_RE.test(sfdl.host)) invalid.push(`ungültiger FTP-Host: ${sfdl.host}`);
  if (!sfdl.port) invalid.push("kein FTP-Port");
  if (sfdl.authRequired && !sfdl.username) invalid.push("Auth nötig, ohne Benutzernamen");

  return invalid;
}
