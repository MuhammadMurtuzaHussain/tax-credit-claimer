import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { extractText, getDocumentProxy, renderPageAsImage } from "unpdf";
import type { InputDoc } from "./model/extractor";

// Turns the shoebox folder into documents the model can read. Everything
// happens on this machine: PDFs are parsed with pdf.js, and scanned pages are
// drawn to PNG with a local canvas.

const MIME: Record<string, string> = {
  ".txt": "text/plain",
  ".md": "text/plain",
  ".eml": "text/plain",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
};

/** A PDF with less text than this per page is treated as a scan. */
const MIN_TEXT_PER_PAGE = 20;
/** Scanned PDFs are drawn page by page for the vision model; more than this is a stack of documents, not one. */
const MAX_SCANNED_PAGES = 3;

export async function readShoebox(dir: string): Promise<{ docs: InputDoc[]; skipped: { name: string; why: string }[] }> {
  const docs: InputDoc[] = [];
  const skipped: { name: string; why: string }[] = [];
  for (const name of (await readdir(dir)).sort()) {
    if (name.startsWith(".") || name === "profile.json") continue;
    const mime = MIME[path.extname(name).toLowerCase()];
    if (!mime) {
      skipped.push({ name, why: "unsupported file type" }); // HEIC is v2
      continue;
    }
    const bytes = await readFile(path.join(dir, name));
    if (mime === "text/plain") {
      const text = bytes.toString("utf8");
      docs.push({ name, mime, text, pages: [text], images: [] });
    } else if (mime === "application/pdf") {
      try {
        docs.push(await readPdf(name, bytes));
      } catch (e) {
        skipped.push({ name, why: `couldn't open the PDF (${(e as Error).message})` });
      }
    } else {
      docs.push({ name, mime, text: null, pages: null, images: [bytes] });
    }
  }
  return { docs, skipped };
}

export async function readPdf(name: string, bytes: Buffer): Promise<InputDoc> {
  const data = () => new Uint8Array(bytes); // pdf.js detaches the buffer it's given
  const pdf = await getDocumentProxy(data());
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  const chars = text.reduce((s, t) => s + t.trim().length, 0);
  if (chars >= MIN_TEXT_PER_PAGE * totalPages) {
    return { name, mime: "application/pdf", text: text.join("\n\n"), pages: text, images: [] };
  }
  // No text layer: a scan or a photo saved as PDF. Let the vision model read the pages.
  if (totalPages > MAX_SCANNED_PAGES) {
    throw new Error(`a ${totalPages}-page scan; split it into one file per document`);
  }
  const images: Buffer[] = [];
  for (let page = 1; page <= totalPages; page++) {
    const png = await renderPageAsImage(data(), page, { canvasImport: () => import("@napi-rs/canvas"), scale: 2 });
    images.push(Buffer.from(png));
  }
  return { name, mime: "application/pdf", text: null, pages: null, images };
}
