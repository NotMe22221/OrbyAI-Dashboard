import type { SSEEvent } from "@resident-secretary/contracts";
import { subscribeToSession } from "@/lib/sse-hub";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: { session_id: string } },
) {
  const sessionId = params.session_id;
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: NodeJS.Timeout | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const sendEvent = (event: SSEEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      unsubscribe = subscribeToSession(sessionId, sendEvent);
      controller.enqueue(encoder.encode(`: connected ${sessionId}\n\n`));

      heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(": keepalive\n\n"));
      }, 15000);
    },
    cancel() {
      if (unsubscribe) {
        unsubscribe();
      }
      if (heartbeat) {
        clearInterval(heartbeat);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "Access-Control-Allow-Origin": "*",
    },
  });
}



