// The two lists of a setting: the field the window writes and the key the pipeline
// reads. Renaming one of them alone leaves the reader with an absent row, and the
// default steps in — an answer that looks right and stands wrong.

import { describe, expect, test } from "bun:test";
import { CONFIG_KEYS } from "@server/downloads/config";
import { NAME_FORMAT_DEFAULTS, SETTING_FIELDS } from "@shared/types/settings";

describe("the keys of the download pipeline", () => {
  test("every key it reads is a field the window writes", () => {
    for (const [purpose, key] of Object.entries(CONFIG_KEYS)) {
      expect(SETTING_FIELDS[key] !== undefined).toBe(true);
      expect(typeof key).toBe("string");
      expect(purpose.length > 0).toBe(true);
    }
  });

  test("every name format is a field of the window", () => {
    for (const key of Object.keys(NAME_FORMAT_DEFAULTS)) {
      expect(SETTING_FIELDS[key] !== undefined).toBe(true);
    }
  });

  test("a key the window does not have is answered by the field map as none", () => {
    expect(SETTING_FIELDS.download_geschwindigkeit === undefined).toBe(true);
  });
});
