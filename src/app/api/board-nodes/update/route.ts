import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { boardNodeSchema } from "@/lib/validation/board";

export const dynamic = "force-dynamic";

const updateBoardNodeRequestSchema = z.object({
  node: boardNodeSchema,
});

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: { message } }, { status });
}

export async function POST(request: Request) {
  let requestBody: unknown;
  try {
    requestBody = await request.json();
  } catch {
    return errorResponse("Request body must be valid JSON.", 400);
  }

  const parsedRequest = updateBoardNodeRequestSchema.safeParse(requestBody);
  if (!parsedRequest.success) {
    return errorResponse("A valid board node is required.", 400);
  }

  const node = parsedRequest.data.node;

  try {
    const { data, error } = await getSupabaseServerClient()
      .from("board_nodes")
      .update({
        title: node.title,
        position_x: node.position_x,
        position_y: node.position_y,
        width: node.width,
        height: node.height,
        z_index: node.z_index,
        locked: node.locked,
        content: node.content,
      })
      .eq("id", node.id)
      .eq("board_id", node.board_id)
      .select()
      .single();

    if (error) {
      return errorResponse(`Could not save node: ${error.message}`, 502);
    }

    const savedNode = boardNodeSchema.safeParse(data);
    if (!savedNode.success) {
      return errorResponse("The database returned an invalid board node.", 502);
    }

    return NextResponse.json({ node: savedNode.data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save node.";
    return errorResponse(message, 503);
  }
}
