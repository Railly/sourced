import { extractText, getDocumentProxy } from "unpdf";
import { extractIntake, hasModelAccess, type IntakeLocale, modelAccessMessage, SourceInputError } from "@/lib/intake-extract";

export const runtime = "nodejs";
export const maxDuration = 120;

const maxFileBytes = 10 * 1024 * 1024;

function localized(locale: IntakeLocale, english: string, spanish: string): string {
  return locale === "es" ? spanish : english;
}

async function textFromFile(file: File, locale: IntakeLocale): Promise<string> {
  if (file.size > maxFileBytes) throw new SourceInputError(localized(locale, "The source file must be smaller than 10 MB.", "El archivo debe pesar menos de 10 MB."));
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    try {
      const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
      const result = await extractText(pdf, { mergePages: true });
      return result.text;
    } catch {
      throw new SourceInputError(localized(locale, "The PDF could not be read. Upload a valid, unencrypted PDF.", "No se pudo leer el PDF. Sube un PDF válido y sin cifrar."));
    }
  }
  if (file.type.startsWith("text/") || file.name.toLowerCase().endsWith(".txt")) {
    return file.text();
  }
  throw new SourceInputError(localized(locale, "Upload a PDF or plain-text clinical note.", "Sube un PDF o una nota clínica en texto plano."));
}

export async function POST(request: Request): Promise<Response> {
  let locale: IntakeLocale = "en";
  try {
    const data = await request.formData();
    locale = data.get("locale") === "es" ? "es" : "en";
    const typed = typeof data.get("text") === "string" ? String(data.get("text")) : "";
    const fileValue = data.get("file");
    const fileText = fileValue instanceof File && fileValue.size > 0 ? await textFromFile(fileValue, locale) : "";
    if (typed.trim() && fileText.trim()) {
      throw new SourceInputError(localized(locale, "Submit one clinical source at a time. Remove either the pasted note or the attachment.", "Envía una sola fuente clínica por vez. Quita la nota pegada o el archivo adjunto."));
    }
    const source = typed.trim() || fileText.trim();
    if (source.length < 20) {
      return Response.json({ error: localized(locale, "Paste a clinical note, dictate context, or attach a PDF.", "Pega una nota clínica, dicta el contexto o adjunta un PDF.") }, { status: 400 });
    }
    if (!hasModelAccess()) {
      return Response.json({ error: modelAccessMessage(locale) }, { status: 503 });
    }

    const extraction = await extractIntake(source, locale);
    return Response.json(extraction);
  } catch (error) {
    const message = error instanceof SourceInputError
      ? error.message
      : localized(locale, "The source could not be extracted.", "No se pudo extraer la fuente.");
    return Response.json({ error: message.slice(0, 500) }, { status: error instanceof SourceInputError ? 400 : 500 });
  }
}
