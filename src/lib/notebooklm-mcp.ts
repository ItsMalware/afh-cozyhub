import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: Record<string, unknown>;
};

type JsonRpcResponse = {
  jsonrpc: "2.0";
  id?: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

type ToolDefinition = {
  name?: string;
};

function parseNotebookAnswer(raw: unknown): string {
  if (!raw || typeof raw !== "object") {
    return "";
  }

  const result = raw as {
    structuredContent?: { answer?: string };
    content?: Array<{ type?: string; text?: string }>;
  };

  if (
    result.structuredContent &&
    typeof result.structuredContent.answer === "string" &&
    result.structuredContent.answer.trim().length > 0
  ) {
    return result.structuredContent.answer.trim();
  }

  const text = result.content?.find((item) => item?.type === "text")?.text;
  if (!text || typeof text !== "string") {
    return "";
  }

  try {
    const parsed = JSON.parse(text) as {
      data?: { answer?: string };
      answer?: string;
    };

    const answer = parsed.data?.answer ?? parsed.answer ?? "";
    if (!answer) {
      return text;
    }

    const marker = "EXTREMELY IMPORTANT:";
    const markerIndex = answer.indexOf(marker);
    if (markerIndex >= 0) {
      return answer.slice(0, markerIndex).trim();
    }

    return answer.trim();
  } catch {
    return text.trim();
  }
}

function extractNotebookId(notebookUrl: string): string {
  try {
    const parsed = new URL(notebookUrl);
    const parts = parsed.pathname.split("/").filter(Boolean);
    return parts[parts.length - 1] ?? notebookUrl;
  } catch {
    return notebookUrl;
  }
}

function parseToolsList(raw: unknown): string[] {
  if (!raw || typeof raw !== "object") {
    return [];
  }

  const result = raw as { tools?: ToolDefinition[] };
  if (!Array.isArray(result.tools)) {
    return [];
  }

  return result.tools
    .map((tool) => tool?.name)
    .filter((name): name is string => typeof name === "string");
}

export async function askNotebookLM(options: {
  notebookUrl: string;
  question: string;
  timeoutMs?: number;
}): Promise<string> {
  const timeoutMs = options.timeoutMs ?? 90_000;

  return new Promise((resolve, reject) => {
    const configuredCommand = process.env.NOTEBOOKLM_MCP_COMMAND?.trim();
    const defaultLocalCommand = `${process.env.HOME ?? ""}/.local/bin/notebooklm-mcp`;
    const useLocalCommand =
      !configuredCommand && existsSync(defaultLocalCommand) && defaultLocalCommand.length > 0;
    const command =
      configuredCommand && configuredCommand.length > 0
        ? configuredCommand
        : useLocalCommand
          ? defaultLocalCommand
          : "npx";
    const args = command === "npx" ? ["-y", "notebooklm-mcp@latest"] : [];

    const proc = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    });

    let nextId = 1;
    let outputBuffer = "";
    let stderrBuffer = "";
    let settled = false;

    const pending = new Map<
      number,
      {
        resolve: (response: JsonRpcResponse) => void;
        reject: (error: Error) => void;
      }
    >();

    const finish = (err?: Error, answer?: string) => {
      if (settled) {
        return;
      }
      settled = true;

      clearTimeout(timer);
      for (const [, handlers] of pending) {
        handlers.reject(err ?? new Error("NotebookLM request terminated"));
      }
      pending.clear();

      proc.kill("SIGTERM");

      if (err) {
        reject(err);
        return;
      }

      resolve(answer ?? "");
    };

    const timer = setTimeout(() => {
      finish(new Error(`NotebookLM request timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    const send = (message: JsonRpcRequest | Omit<JsonRpcRequest, "id">) => {
      proc.stdin.write(`${JSON.stringify(message)}\n`);
    };

    const request = (method: string, params: Record<string, unknown> = {}) => {
      return new Promise<JsonRpcResponse>((innerResolve, innerReject) => {
        const id = nextId++;
        pending.set(id, { resolve: innerResolve, reject: innerReject });
        send({ jsonrpc: "2.0", id, method, params });
      });
    };

    proc.stdout.on("data", (chunk) => {
      outputBuffer += chunk.toString("utf8");

      let lineBreak = outputBuffer.indexOf("\n");
      while (lineBreak >= 0) {
        const line = outputBuffer.slice(0, lineBreak).trim();
        outputBuffer = outputBuffer.slice(lineBreak + 1);

        if (line) {
          try {
            const message = JSON.parse(line) as JsonRpcResponse;
            if (typeof message.id === "number" && pending.has(message.id)) {
              const handlers = pending.get(message.id)!;
              pending.delete(message.id);

              if (message.error) {
                handlers.reject(
                  new Error(
                    `NotebookLM MCP error ${message.error.code}: ${message.error.message}`,
                  ),
                );
              } else {
                handlers.resolve(message);
              }
            }
          } catch {
            // Ignore non-JSON log lines from MCP process.
          }
        }

        lineBreak = outputBuffer.indexOf("\n");
      }
    });

    proc.stderr.on("data", (chunk) => {
      stderrBuffer += chunk.toString("utf8");
    });

    proc.on("error", (err) => {
      finish(new Error(`Failed to spawn notebooklm-mcp: ${err.message}`));
    });

    proc.on("exit", (code) => {
      if (!settled && code !== 0) {
        finish(
          new Error(
            `NotebookLM MCP exited with code ${code}. ${stderrBuffer.trim()}`.trim(),
          ),
        );
      }
    });

    (async () => {
      try {
        await request("initialize", {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "ai-focus-hub", version: "0.1.0" },
        });

        send({
          jsonrpc: "2.0",
          method: "notifications/initialized",
          params: {},
        });

        const toolsResponse = await request("tools/list", {});
        const toolNames = parseToolsList(toolsResponse.result);
        const hasNotebookQuery = toolNames.includes("notebook_query");
        const hasRefreshAuth = toolNames.includes("refresh_auth");

        if (hasRefreshAuth) {
          await request("tools/call", {
            name: "refresh_auth",
            arguments: {},
          });
        }

        const answerResponse = hasNotebookQuery
          ? await request("tools/call", {
              name: "notebook_query",
              arguments: {
                notebook_id: extractNotebookId(options.notebookUrl),
                query: options.question,
              },
            })
          : await request("tools/call", {
              name: "ask_question",
              arguments: {
                notebook_url: options.notebookUrl,
                question: options.question,
              },
            });

        const answer = parseNotebookAnswer(answerResponse.result);
        if (!answer) {
          throw new Error("NotebookLM returned an empty answer");
        }

        finish(undefined, answer);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown NotebookLM error";
        finish(new Error(message));
      }
    })();
  });
}
