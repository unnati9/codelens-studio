import { z } from "zod";

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

export const imageFileSchema = z
  .object({
    name: z.string().min(1),
    size: z.number().int().positive().max(MAX_IMAGE_BYTES),
    type: z.enum(ALLOWED_IMAGE_TYPES),
  })
  .passthrough();

export type ImageFileValidation = { valid: true } | { valid: false; message: string };

export function validateImageFile(file: File): ImageFileValidation {
  const result = imageFileSchema.safeParse(file);

  if (result.success) {
    return { valid: true };
  }

  const issue = result.error.issues[0];
  if (issue?.path[0] === "type") {
    return { valid: false, message: "Choose a PNG, JPEG, or WebP image." };
  }
  if (issue?.path[0] === "size") {
    return { valid: false, message: "Images must be smaller than 8 MB." };
  }

  return { valid: false, message: "Choose a valid image file." };
}

export async function readImageDimensions(file: File) {
  const objectUrl = URL.createObjectURL(file);

  try {
    const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => reject(new Error("The image could not be decoded."));
      image.src = objectUrl;
    });

    return dimensions;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
