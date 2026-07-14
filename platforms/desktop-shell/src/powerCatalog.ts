export type PowerType = "skill" | "connect" | "tool";

export interface CatalogPower {
  id: string;
  name: string;
  tagline: string;
  type: PowerType;
  category: string;
  repo: string;
  stars: number;
  starLabel: string;
  description: string;
  instructions: string;
  rating: number;
  featured: boolean;
  trending: boolean;
}

const power = (
  id: string,
  name: string,
  tagline: string,
  type: PowerType,
  category: string,
  repo: string,
  starLabel: string,
  description: string,
  options: Partial<Pick<CatalogPower, "instructions" | "rating" | "featured" | "trending">> = {}
): CatalogPower => ({
  id,
  name,
  tagline,
  type,
  category,
  repo,
  stars: parseStars(starLabel),
  starLabel,
  description,
  instructions: options.instructions ?? "",
  rating: options.rating ?? 4.7,
  featured: options.featured ?? false,
  trending: options.trending ?? false
});

export const POWER_CATALOG: CatalogPower[] = [
  power("perplexica", "Perplexica", "see the live web, with sources", "connect", "See", "ItzCrazyKns/Perplexica", "35k", "Answers from the live web with citations, self-hosted.", { rating: 4.8, featured: true }),
  power("deep-research", "Deep Research", "research any topic while you sleep", "skill", "See", "dzhng/deep-research", "19k", "An iterative research agent that reads, cross-checks, and writes a sourced brief.", { instructions: "For deep research, break the topic into sub-questions, search each one, cross-check primary sources, write a structured cited brief, and flag uncertainty.", trending: true }),
  power("openvoice", "OpenVoice", "speak in your own voice", "tool", "Speak", "myshell-ai/OpenVoice", "37k", "Clone a voice from a short sample and narrate text.", { rating: 4.9, featured: true }),
  power("audiblez", "Audiblez", "turn any book into audio", "tool", "Speak", "santinic/audiblez", "8k", "Generate an audiobook from an ebook or PDF."),
  power("comfyui", "ComfyUI", "make any image", "connect", "Create", "comfyanonymous/ComfyUI", "119k", "A modular image and video pipeline for a connected GPU.", { rating: 4.8, featured: true }),
  power("huashu-design", "Huashu Design", "design things that actually look good", "skill", "Create", "alchaincyf/huashu-design", "21k", "HTML-native design guidance for slides, carousels, and posters.", { instructions: "For visual work, use clear hierarchy, generous whitespace, a restrained palette, expressive typography, one confident accent, and clean self-contained output." }),
  power("rembg", "rembg", "cut the background off any photo", "tool", "Create", "danielgatis/rembg", "23k", "Remove the background from an image in one step."),
  power("spleeter", "Spleeter", "pull the vocals out of any song", "tool", "Create", "deezer/spleeter", "28k", "Split audio into vocals, drums, bass, and other stems."),
  power("pyvideotrans", "pyvideotrans", "dub any video into another language", "tool", "Create", "jianchang512/pyvideotrans", "18k", "Transcribe, translate, re-voice, and subtitle video."),
  power("video-use", "video-use", "edit your videos by just typing", "tool", "Create", "browser-use/video-use", "14k", "Edit video through natural-language instructions."),
  power("ocrmypdf", "OCRmyPDF", "read any scan", "tool", "Remember", "ocrmypdf/OCRmyPDF", "34k", "Add a searchable text layer to scanned PDFs."),
  power("immich", "Immich", "search your whole photo library", "connect", "Remember", "immich-app/immich", "60k", "A self-hosted photo library that a connected brain can search.", { rating: 4.9, trending: true }),
  power("appflowy", "AppFlowy", "own your notes and docs", "connect", "Remember", "AppFlowy-IO/AppFlowy", "73k", "A self-hosted docs, wiki, and database workspace."),
  power("anytype", "Anytype", "a private safe haven for your notes", "connect", "Remember", "anyproto/anytype-ts", "10k", "Local-first encrypted notes and objects."),
  power("n8n", "n8n", "automate your whole workflow", "connect", "Automate", "n8n-io/n8n", "195k", "Connect apps and AI through self-hosted automations.", { rating: 4.8, trending: true }),
  power("twenty", "Twenty CRM", "run your contacts and deals", "connect", "Automate", "twentyhq/twenty", "30k", "An open-source CRM for people, companies, and deals."),
  power("cal", "Cal.com", "booking links, no monthly fee", "connect", "Automate", "calcom/cal.com", "46k", "Open-source scheduling and booking links."),
  power("listmonk", "listmonk", "email your whole list for pennies", "connect", "Automate", "knadh/listmonk", "22k", "A self-hosted newsletter and mailing-list manager."),
  power("nocodb", "NocoDB", "a team database, no seat fees", "connect", "Own your data", "nocodb/nocodb", "63k", "Turn a database into an Airtable-style workspace."),
  power("formbricks", "Formbricks", "forms and surveys, no response cap", "connect", "Own your data", "formbricks/formbricks", "12k", "Self-hosted forms and surveys."),
  power("open-webui", "Open WebUI", "run your own free model", "connect", "Own your data", "open-webui/open-webui", "144k", "A local model interface commonly connected to Ollama."),
  power("papermark", "Papermark", "share documents and track them", "connect", "Own your data", "mfts/papermark", "8k", "Open-source tracked document sharing."),
  power("taste-skill", "Taste", "have actual taste", "skill", "Taste", "Leonx1nx/taste-skill", "55k", "Editorial and visual critique guidance for more original output.", { instructions: "Before finalizing creative work, critique what feels generic, make it more specific and surprising, and favor originality, restraint, and quality over cliche.", rating: 4.9, trending: true })
];

function parseStars(value: string): number {
  const normalized = value.trim().toLowerCase();
  if (normalized.endsWith("k")) return Math.round((Number.parseFloat(normalized.slice(0, -1)) || 0) * 1000);
  return Number.parseInt(normalized, 10) || 0;
}
