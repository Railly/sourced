import { gateway } from "@ai-sdk/gateway";
import { transcribe } from "ai";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  let locale: "en" | "es" = "en";
  try {
    const data = await request.formData();
    locale = data.get("locale") === "es" ? "es" : "en";
    const audio = data.get("audio");
    if (!(audio instanceof File) || audio.size === 0) {
      return Response.json({ error: locale === "es" ? "Primero graba una nota de voz breve." : "Record a short voice note first." }, { status: 400 });
    }
    if (audio.size > 15 * 1024 * 1024) {
      return Response.json({ error: locale === "es" ? "Las notas de voz deben pesar menos de 15 MB." : "Voice notes must be smaller than 15 MB." }, { status: 413 });
    }
    const result = await transcribe({
      model: gateway.transcriptionModel("openai/gpt-4o-transcribe"),
      audio: new Uint8Array(await audio.arrayBuffer()),
    });
    return Response.json({ text: result.text });
  } catch {
    const message = locale === "es" ? "No se pudo transcribir el audio." : "Transcription failed.";
    return Response.json({ error: message.slice(0, 500) }, { status: 500 });
  }
}
