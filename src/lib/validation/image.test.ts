import { describe, expect, it } from "vitest";
import { MAX_IMAGE_BYTES, validateImageFile } from "./image";

describe("validateImageFile", () => {
  it("accepts supported image files", () => {
    const file = new File([new Uint8Array(32)], "screen.png", { type: "image/png" });
    expect(validateImageFile(file)).toEqual({ valid: true });
  });

  it("rejects unsupported formats", () => {
    const file = new File(["image"], "screen.gif", { type: "image/gif" });
    expect(validateImageFile(file)).toEqual({
      valid: false,
      message: "Choose a PNG, JPEG, or WebP image.",
    });
  });

  it("rejects files above the size limit", () => {
    const file = new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], "large.webp", {
      type: "image/webp",
    });
    expect(validateImageFile(file)).toEqual({
      valid: false,
      message: "Images must be smaller than 8 MB.",
    });
  });
});
