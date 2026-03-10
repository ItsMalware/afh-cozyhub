import { NextResponse } from "next/server";

type SynthesisInput = {
  sourceText?: string;
  title?: string;
};

function sentenceChunks(input: string): string[] {
  return input
    .split(/[.!?]\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function buildTrivia(source: string): Array<{ question: string; answer: string }> {
  const chunks = sentenceChunks(source).slice(0, 3);
  return chunks.map((chunk, index) => ({
    question: `Q${index + 1}: What key point should the team remember?`,
    answer: chunk,
  }));
}

export async function POST(req: Request) {
  try {
    const payload = (await req.json()) as SynthesisInput;
    const sourceText = payload.sourceText?.trim() ?? "";
    const title = payload.title?.trim() || "Untitled Brief";
    if (!sourceText) {
      return NextResponse.json({ error: "sourceText is required" }, { status: 400 });
    }

    const chunks = sentenceChunks(sourceText);
    const hostA = chunks[0] ?? "No opening insight available.";
    const hostB = chunks[1] ?? chunks[0] ?? "No counterpoint available.";
    const closing = chunks[2] ?? "Next step: convert insights into one concrete task.";

    return NextResponse.json(
      {
        title,
        podcastDebate: {
          hostA,
          hostB,
          closing,
          interactivePrompt:
            "User can interrupt with: 'Pause and explain that point in plain language.'",
        },
        triviaBossBattle: buildTrivia(sourceText),
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Knowledge synthesis failed", error);
    return NextResponse.json({ error: "Unable to synthesize knowledge output" }, { status: 500 });
  }
}
