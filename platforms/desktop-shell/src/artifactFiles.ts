export type ArtifactKind = "document" | "spreadsheet" | "presentation" | "pdf";

export interface ArtifactSlide {
  title: string;
  body: string;
}

export interface ArtifactSpec {
  kind: ArtifactKind;
  title: string;
  content: string;
  rows?: string[][];
  slides?: ArtifactSlide[];
}

export interface GeneratedArtifact {
  name: string;
  mimeType: string;
  blob: Blob;
}

export async function buildArtifact(spec: ArtifactSpec): Promise<GeneratedArtifact> {
  const baseName = safeBaseName(spec.title);
  if (spec.kind === "spreadsheet") {
    return {
      name: `${baseName}.xlsx`,
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      blob: await buildSpreadsheet(spec.rows ?? [])
    };
  }
  if (spec.kind === "presentation") {
    return {
      name: `${baseName}.pptx`,
      mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      blob: await buildPresentation(spec.title, spec.slides ?? [])
    };
  }
  if (spec.kind === "pdf") {
    return {
      name: `${baseName}.pdf`,
      mimeType: "application/pdf",
      blob: await buildPdf(spec.title, spec.content)
    };
  }
  return {
    name: `${baseName}.docx`,
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    blob: await buildDocument(spec.title, spec.content)
  };
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

async function buildDocument(title: string, content: string): Promise<Blob> {
  const { Document, HeadingLevel, Packer, Paragraph, TextRun } = await import("docx");
  const paragraphs = content.split(/\r?\n/).map((line) => {
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const levels = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3];
      return new Paragraph({
        text: heading[2] ?? "",
        heading: levels[Math.min(heading[1]?.length ?? 1, 3) - 1] ?? HeadingLevel.HEADING_1
      });
    }
    const bullet = line.match(/^\s*[-*]\s+(.+)$/);
    if (bullet) return new Paragraph({ text: bullet[1] ?? "", bullet: { level: 0 } });
    return new Paragraph({ children: [new TextRun(line || " ")] });
  });
  const document = new Document({
    creator: "SlyOS",
    title,
    description: "Created through the SlyOS brain",
    sections: [{ children: paragraphs }]
  });
  return Packer.toBlob(document);
}

async function buildSpreadsheet(rows: string[][]): Promise<Blob> {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const normalized = rows.length ? rows : [["SlyOS"], ["No rows were generated."]];
  const data = normalized.map((row, rowIndex) =>
    row.map((value) => rowIndex === 0
      ? { value: String(value ?? ""), type: String, fontWeight: "bold" as const, backgroundColor: "#F3EDE3", wrap: true }
      : { value: String(value ?? ""), type: String, wrap: true })
  );
  return writeXlsxFile(
    data as unknown as import("write-excel-file/browser").SheetData,
    { columns: normalized[0]?.map(() => ({ width: 24 })) ?? [] }
  ).toBlob();
}

async function buildPresentation(title: string, slides: ArtifactSlide[]): Promise<Blob> {
  const { default: PptxGenJS } = await import("pptxgenjs");
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "SlyOS";
  pptx.company = "SlyOS";
  pptx.subject = title;
  pptx.title = title;
  pptx.theme = {
    headFontFace: "Arial",
    bodyFontFace: "Arial"
  };
  const usableSlides = slides.length ? slides : [{ title, body: "No slide content was generated." }];
  for (const item of usableSlides.slice(0, 40)) {
    const slide = pptx.addSlide();
    slide.background = { color: "F7F2E9" };
    slide.addText(item.title || title, {
      x: 0.75,
      y: 0.55,
      w: 11.8,
      h: 0.72,
      fontFace: "Arial",
      fontSize: 25,
      bold: true,
      color: "171512",
      margin: 0
    });
    slide.addShape(pptx.ShapeType.line, { x: 0.75, y: 1.42, w: 1.35, h: 0, line: { color: "F15A24", width: 2 } });
    const bodyOptions = {
      x: 0.8,
      y: 1.75,
      w: 11.6,
      h: 4.9,
      fontFace: "Arial",
      fontSize: 19,
      color: "3F3A34",
      breakLine: false,
      valign: "top",
      margin: 0.08
    } as const;
    slide.addText(item.body || "", item.body.includes("\n")
      ? { ...bodyOptions, bullet: { type: "bullet" } }
      : bodyOptions);
  }
  const output = await pptx.write({ outputType: "blob", compression: true });
  return output instanceof Blob ? output : new Blob([output as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  });
}

async function buildPdf(title: string, content: string): Promise<Blob> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  pdf.setAuthor("SlyOS");
  pdf.setCreator("SlyOS");
  pdf.setTitle(title);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 54;
  const fontSize = 11;
  const lineHeight = 16;
  const maxWidth = pageWidth - margin * 2;
  let page = pdf.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const addLine = (text: string, isHeading = false) => {
    if (y < margin + lineHeight) {
      page = pdf.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
    }
    page.drawText(toWinAnsi(text), {
      x: margin,
      y,
      size: isHeading ? 15 : fontSize,
      font: isHeading ? bold : regular,
      color: rgb(0.09, 0.08, 0.07)
    });
    y -= isHeading ? 24 : lineHeight;
  };

  addLine(title, true);
  y -= 6;
  for (const rawLine of content.split(/\r?\n/)) {
    const heading = rawLine.match(/^#{1,3}\s+(.+)$/);
    const line = heading?.[1] ?? rawLine;
    if (!line.trim()) {
      y -= lineHeight * 0.65;
      continue;
    }
    for (const wrapped of wrapPdfLine(toWinAnsi(line), heading ? bold : regular, heading ? 15 : fontSize, maxWidth)) {
      addLine(wrapped, Boolean(heading));
    }
  }
  const bytes = await pdf.save();
  const copy = Uint8Array.from(bytes);
  return new Blob([copy.buffer], { type: "application/pdf" });
}

function wrapPdfLine(text: string, font: { widthOfTextAtSize(value: string, size: number): number }, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (current && font.widthOfTextAtSize(next, size) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function toWinAnsi(value: string): string {
  return value
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
}

function safeBaseName(value: string): string {
  const cleaned = value
    .trim()
    .replace(/[/:\\?%*"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^[-. ]+|[-. ]+$/g, "")
    .slice(0, 80);
  return cleaned || "SlyOS Document";
}
