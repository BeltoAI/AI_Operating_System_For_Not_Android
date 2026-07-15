export interface OutboundPrompt {
  app: "Mail" | "Messages" | "X";
  contact: string;
  context: string;
}

export function parseOutboundPrompt(prompt: string): OutboundPrompt {
  const app: OutboundPrompt["app"] = /\bemail\b/i.test(prompt) ? "Mail" : /\bdm\b/i.test(prompt) ? "X" : "Messages";
  const email = prompt.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i);
  if (email?.[0]) {
    const suffix = prompt.slice((email.index ?? 0) + email[0].length);
    const context = suffix
      .replace(/^\s*(?:[,;:\u2014-]\s*)?(?:(?:that|saying|about)\s+|telling\s+(?:him|her|them)?\s*)?/i, "")
      .trim();
    return { app: "Mail", contact: email[0], context: context || prompt };
  }

  const direct = prompt.match(
    /\b(?:text|message|dm|email|reply to|send(?: an)? email to|(?:write|draft|compose)(?: an?)? email(?: for me)? to)\s+(.+?)(?:\s+(?:that|saying|about|and|telling\s+(?:him|her|them)?)\s+|:\s*|$)(.*)$/i
  );
  const toTarget = prompt.match(/\bto\s+(.+?)(?:\s+(?:that|saying|about|and)\s+|:\s*|$)(.*)$/i);
  const match = direct ?? toTarget;
  const contact = cleanOutboundContact(match?.[1] ?? "Someone");
  const context = (match?.[2] ?? "").trim();
  return { app, contact, context: context || prompt };
}

export function emailSubjectFromContext(context: string, contact: string): string {
  const cleaned = cleanSubject(
    context.replace(/^(?:that|saying|about)\s+/i, "").replace(/^telling\s+(?:him|her|them)?\s*/i, "")
  );
  const words = cleaned.split(/\s+/).filter(Boolean).slice(0, 8).join(" ");
  if (words) return words.charAt(0).toUpperCase() + words.slice(1);
  return `Message for ${firstName(contact)}`;
}

function cleanOutboundContact(value: string): string {
  return value
    .replace(/^(?:to|at)\s+/i, "")
    .replace(/[.,;:!?]+$/g, "")
    .trim()
    .slice(0, 60) || "Someone";
}

function cleanSubject(value: string): string {
  return value
    .replace(/^["'\u201c\u201d]+|["'\u201c\u201d]+$/g, "")
    .replace(/[.?!]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

function firstName(value: string): string {
  const first = value.trim().split(/[\s@._-]+/)[0];
  return first || "you";
}
