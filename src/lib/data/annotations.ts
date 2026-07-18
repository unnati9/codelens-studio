import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  annotationArraySchema,
  annotationFromDatabaseRow,
  annotationSchema,
  annotationToDatabaseRow,
  type Annotation,
} from "@/lib/validation/annotation";

export async function listAnnotations(boardId: string): Promise<Annotation[]> {
  const { data, error } = await getSupabaseBrowserClient()
    .from("annotations")
    .select("*")
    .eq("board_id", boardId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Could not load annotations: ${error.message}`);
  }

  return annotationArraySchema.parse((data ?? []).map(annotationFromDatabaseRow));
}

export async function createAnnotation(annotation: Annotation): Promise<Annotation> {
  const row = annotationToDatabaseRow(annotation);
  const { data, error } = await getSupabaseBrowserClient()
    .from("annotations")
    .insert(row)
    .select()
    .single();

  if (error) {
    throw new Error(`Could not create annotation: ${error.message}`);
  }

  return annotationFromDatabaseRow(data);
}

export async function updateAnnotation(annotation: Annotation): Promise<Annotation> {
  const validated = annotationSchema.parse(annotation);
  const { data, error } = await getSupabaseBrowserClient()
    .from("annotations")
    .update({
      target_type: validated.targetType,
      target_node_id: validated.targetNodeId ?? null,
      tool: validated.tool,
      geometry: validated.geometry,
      style: validated.style,
    })
    .eq("id", validated.id)
    .eq("board_id", validated.boardId)
    .select()
    .single();

  if (error) {
    throw new Error(`Could not save annotation: ${error.message}`);
  }

  return annotationFromDatabaseRow(data);
}

export async function deleteAnnotation(boardId: string, annotationId: string): Promise<void> {
  const { error } = await getSupabaseBrowserClient()
    .from("annotations")
    .delete()
    .eq("id", annotationId)
    .eq("board_id", boardId);

  if (error) {
    throw new Error(`Could not delete annotation: ${error.message}`);
  }
}
