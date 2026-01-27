/**
 * SSE streaming utilities for consuming chat stream
 */

const API_BASE_URL = typeof window !== "undefined" ? window.location.origin : "";

export interface StreamEvent {
  id: string;
  type: "chunk" | "complete" | "error";
  data: unknown;
}

export interface ChunkData {
  content: string;
}

export interface CompleteData {
  conversationId: string;
  messageId: string;
}

export interface ErrorData {
  message: string;
  error?: string;
}

/**
 * Stream chat messages from the API
 * Yields parsed SSE events
 */
export async function* streamChat(
  message: string,
  conversationId?: string,
  options?: {
    signal?: AbortSignal;
  },
): AsyncGenerator<StreamEvent> {
  const body = {
    message,
    conversationId,
  };

  const response = await fetch(`${API_BASE_URL}/api/chat/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    credentials: "include",
    body: JSON.stringify(body),
    signal: options?.signal,
  });

  if (!response.ok) {
    throw new Error(`Stream failed: ${response.status} ${response.statusText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("No response body");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent: Partial<StreamEvent> = {};

  try {
    const processLine = (line: string): StreamEvent | null => {
      if (line.startsWith("id:")) {
        currentEvent.id = line.slice(3).trim();
      } else if (line.startsWith("event:")) {
        const eventType = line.slice(6).trim();
        if (eventType && eventType !== "message") {
          currentEvent.type = eventType as StreamEvent["type"];
        }
      } else if (line.startsWith("data:")) {
        const dataStr = line.slice(5).trim();
        if (dataStr) {
          try {
            const parsed = JSON.parse(dataStr);
            if (parsed.type && parsed.id && parsed.data !== undefined) {
              currentEvent = parsed;
            } else {
              currentEvent.data = parsed;
            }
          } catch {
            // Ignore parse errors
          }
        }
      } else if (line === "" && currentEvent.type && currentEvent.id) {
        const readyEvent = currentEvent as StreamEvent;
        currentEvent = {};
        return readyEvent;
      }

      return null;
    };

    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const readyEvent = processLine(line);
        if (readyEvent) {
          yield readyEvent;
        }
      }
    }

    if (buffer.length > 0) {
      const lines = buffer.split("\n");
      buffer = "";
      for (const line of lines) {
        const readyEvent = processLine(line);
        if (readyEvent) {
          yield readyEvent;
        }
      }
    }

    if (currentEvent.type && currentEvent.id) {
      yield currentEvent as StreamEvent;
      currentEvent = {};
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Type guards for event data
 */
export function isChunkData(data: unknown): data is ChunkData {
  return typeof data === "object" && data !== null && "content" in data;
}

export function isCompleteData(data: unknown): data is CompleteData {
  return (
    typeof data === "object" &&
    data !== null &&
    "conversationId" in data &&
    "messageId" in data
  );
}

export function isErrorData(data: unknown): data is ErrorData {
  return typeof data === "object" && data !== null && "message" in data;
}
