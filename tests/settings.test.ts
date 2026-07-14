import assert from "node:assert/strict";
import test from "node:test";
import { isThemeId, THEMES, THEME_IDS } from "../lib/themes";
import { userSettingsSchema } from "../lib/validation";

test("the theme catalog and settings validation accept the same theme IDs", () => {
  assert.deepEqual(THEMES.map((theme) => theme.id), THEME_IDS);

  for (const themeId of THEME_IDS) {
    assert.equal(isThemeId(themeId), true);
    assert.equal(userSettingsSchema.parse({ themePreference: themeId }).themePreference, themeId);
  }
});

test("unknown themes are rejected by both the client guard and server validation", () => {
  assert.equal(isThemeId("unknown"), false);
  assert.equal(userSettingsSchema.safeParse({ themePreference: "unknown" }).success, false);
});
