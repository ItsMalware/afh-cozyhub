import { askNotebookLM } from "@/lib/notebooklm-mcp";
import { BriefPayload, NotebookBriefService } from "@/lib/types";

function parseNotebookMap(): Record<string, string> {
  const raw = process.env.NOTEBOOKLM_NOTEBOOK_MAP_JSON;
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string" && value.trim().length > 0) {
        result[key] = value.trim();
      }
    }
    return result;
  } catch {
    return {};
  }
}

function resolveNotebookUrl(businessId: string, businessName: string): string | undefined {
  const map = parseNotebookMap();

  return (
    map[businessId] ??
    map[businessName] ??
    map[businessName.toLowerCase()] ??
    process.env.NOTEBOOKLM_DEFAULT_NOTEBOOK_URL ??
    undefined
  );
}

function errorToMessage(error: unknown): string {
  const normalize = (value: string): string => {
    const lower = value.toLowerCase();
    if (
      lower.includes("launchpersistentcontext") ||
      lower.includes("chromium distribution") ||
      lower.includes("patchright install chrome")
    ) {
      return "local browser runtime unavailable";
    }
    return value.length > 180 ? `${value.slice(0, 177)}...` : value;
  };

  if (error instanceof Error) {
    return normalize(error.message);
  }
  if (typeof error === "string") {
    return normalize(error);
  }
  try {
    return normalize(JSON.stringify(error));
  } catch {
    return "Unknown NotebookLM error";
  }
}

function fallbackBrief(
  businessId: string,
  businessName: string,
  source: string,
  reason?: string,
): BriefPayload {
  const reasonSuffix = reason ? ` (${reason})` : "";
  return {
    businessId,
    businessName,
    brief: [
      `NotebookLM brief is temporarily unavailable${reasonSuffix}.`,
      `Proceed with today’s highest-impact task for ${businessName}, capture blockers, and log outcomes.`,
    ].join(" "),
    source,
    fetchedAt: new Date().toISOString(),
  };
}

function extractNotebookFailureReason(answer: string): string | null {
  const raw = answer.trim();
  if (!raw) {
    return "empty NotebookLM response";
  }

  try {
    const parsed = JSON.parse(raw) as {
      success?: unknown;
      error?: unknown;
      message?: unknown;
    };
    if (parsed.success === false) {
      const reason =
        typeof parsed.error === "string"
          ? parsed.error
          : typeof parsed.message === "string"
            ? parsed.message
            : "NotebookLM returned success=false";
      return errorToMessage(reason);
    }
  } catch {
    // Non-JSON answer is valid content.
  }

  const normalized = raw.toLowerCase();
  if (
    normalized.includes("launchpersistentcontext") ||
    normalized.includes("chromium distribution") ||
    normalized.includes("patchright install chrome")
  ) {
    return "local browser runtime unavailable";
  }

  return null;
}

async function fetchBriefFromGateway(
  endpoint: string,
  businessId: string,
  businessName: string,
): Promise<BriefPayload> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.NOTEBOOKLM_API_KEY
        ? { Authorization: `Bearer ${process.env.NOTEBOOKLM_API_KEY}` }
        : {}),
    },
    body: JSON.stringify({ businessId, businessName }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`NotebookLM brief request failed (${response.status})`);
  }

  const payload = (await response.json()) as { brief?: string; source?: string };
  return {
    businessId,
    businessName,
    brief:
      payload.brief ??
      `${businessName} brief unavailable from upstream connector. Continue with session goals and capture outcomes manually.`,
    source: payload.source ?? "notebooklm-gateway",
    fetchedAt: new Date().toISOString(),
  };
}

class NotebookLMLocalService implements NotebookBriefService {
  async getBrief(businessId: string, businessName: string): Promise<BriefPayload> {
    const endpoint = process.env.NOTEBOOKLM_BRIEF_ENDPOINT;
    const useLocalMcp = process.env.NOTEBOOKLM_USE_MCP === "true";
    const notebookUrl = resolveNotebookUrl(businessId, businessName);

    if (useLocalMcp && notebookUrl) {
      try {
        const question = [
          "Create a short pre-session brief for this business.",
          "Return 4 bullets max:",
          "1) primary priority today",
          "2) biggest risk/blocker",
          "3) key evidence/data point to cite",
          "4) one recommended next action",
          "Keep total length under 120 words.",
        ].join(" ");

        const answer = await askNotebookLM({
          notebookUrl,
          question,
        });
        const notebookFailure = extractNotebookFailureReason(answer);
        if (notebookFailure) {
          throw new Error(notebookFailure);
        }

        return {
          businessId,
          businessName,
          brief: answer,
          source: "notebooklm-mcp-cli",
          fetchedAt: new Date().toISOString(),
        };
      } catch (error) {
        const localError = errorToMessage(error);
        if (endpoint) {
          try {
            return await fetchBriefFromGateway(endpoint, businessId, businessName);
          } catch (gatewayError) {
            const gatewayMessage = errorToMessage(gatewayError);
            return fallbackBrief(
              businessId,
              businessName,
              "notebooklm-fallback",
              `local MCP failed: ${localError}; gateway failed: ${gatewayMessage}`,
            );
          }
        }
        return fallbackBrief(
          businessId,
          businessName,
          "notebooklm-fallback",
          `local MCP failed: ${localError}`,
        );
      }
    }

    if (!endpoint) {
      return fallbackBrief(
        businessId,
        businessName,
        "notebooklm-fallback",
        "no endpoint configured",
      );
    }

    try {
      return await fetchBriefFromGateway(endpoint, businessId, businessName);
    } catch (error) {
      return fallbackBrief(
        businessId,
        businessName,
        "notebooklm-fallback",
        errorToMessage(error),
      );
    }
  }
}

export function createNotebookBriefService(): NotebookBriefService {
  return new NotebookLMLocalService();
}
