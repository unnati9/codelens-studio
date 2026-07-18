import { getBoardMediaBucket, getSupabaseBrowserClient } from "@/lib/supabase/client";
import { readImageDimensions, validateImageFile } from "@/lib/validation/image";
import type { ImageNodeContent } from "@/lib/validation/board";

function sanitizeFileName(fileName: string) {
  return fileName
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .slice(-100);
}

export async function uploadBoardImage(boardId: string, file: File): Promise<ImageNodeContent> {
  const validation = validateImageFile(file);
  if (!validation.valid) {
    throw new Error(validation.message);
  }

  const dimensions = await readImageDimensions(file);
  const storagePath = `${boardId}/${crypto.randomUUID()}-${sanitizeFileName(file.name)}`;
  const { error } = await getSupabaseBrowserClient()
    .storage.from(getBoardMediaBucket())
    .upload(storagePath, file, { contentType: file.type, upsert: false });

  if (error) {
    throw new Error(`Could not upload image: ${error.message}`);
  }

  return {
    kind: "image",
    storagePath,
    fileName: file.name,
    mimeType: file.type as ImageNodeContent["mimeType"],
    sizeBytes: file.size,
    naturalWidth: dimensions.width,
    naturalHeight: dimensions.height,
  };
}

export function getBoardImageUrl(storagePath: string) {
  return getSupabaseBrowserClient().storage.from(getBoardMediaBucket()).getPublicUrl(storagePath)
    .data.publicUrl;
}
