import {
  PLATFORM_CAPABILITIES,
  createBrainSyncClient,
  createBrowserMemoryStore,
  planPrompt,
  type AgentPlan,
  type BrainSyncClient
} from "@badscientist/agent-core";
import "./styles.css";

const memoryStore = createBrowserMemoryStore(window.localStorage);
let lastPlan: AgentPlan = planPrompt("");
let syncClient: BrainSyncClient | null = null;

const appRoot = document.querySelector<HTMLDivElement>("#app");
if (!appRoot) throw new Error("Missing #app root.");
const app = appRoot;

render();

function render(): void {
  const memories = memoryStore.list();
  const settings = memoryStore.listSettings();

  app.innerHTML = `
    <main class="shell">
      <aside class="sidebar" aria-label="BADSCIENTIST navigation">
        <div>
          <p class="eyebrow">BADSCIENTIST</p>
          <h1>Cross-platform SlyOS shell</h1>
          <p class="lede">Android stays the reference. This surface tests the shared brain, action gates, memory, and sync contracts for macOS, Linux, Windows, and iOS.</p>
        </div>
        <nav>
          <a href="#command">Command</a>
          <a href="#memory">Memory</a>
          <a href="#sync">Sync</a>
          <a href="#parity">Parity</a>
        </nav>
      </aside>

      <section class="workspace">
        <section id="command" class="panel command-panel">
          <div class="section-head">
            <div>
              <p class="eyebrow">Agent loop</p>
              <h2>One prompt, confirmation-gated actions</h2>
            </div>
            <span class="status">local demo</span>
          </div>
          <form id="prompt-form" class="prompt-form">
            <textarea id="prompt-input" rows="4" placeholder="Try: find Anna's email and send her the invite, then remember this as a customer follow-up"></textarea>
            <button type="submit">Plan</button>
          </form>
          ${renderPlan(lastPlan)}
        </section>

        <section id="memory" class="panel">
          <div class="section-head">
            <div>
              <p class="eyebrow">Memory brain</p>
              <h2>Local memory and settings</h2>
            </div>
            <span class="status">${memories.length} memories · ${settings.length} settings</span>
          </div>
          <form id="memory-form" class="memory-form">
            <input id="memory-title" placeholder="Title" />
            <input id="memory-tags" placeholder="tags, comma separated" />
            <textarea id="memory-body" rows="3" placeholder="What should the brain remember?"></textarea>
            <button type="submit">Remember</button>
          </form>
          <div class="memory-list">
            ${memories.length ? memories.map(renderMemory).join("") : `<p class="empty">No local memories yet.</p>`}
          </div>
        </section>

        <section id="sync" class="panel">
          <div class="section-head">
            <div>
              <p class="eyebrow">Supabase</p>
              <h2>Optional cross-device brain sync</h2>
            </div>
            <span class="status" id="sync-status">not connected</span>
          </div>
          <div class="sync-grid">
            <label>Project URL<input id="supabase-url" placeholder="https://project-ref.supabase.co" /></label>
            <label>Publishable key<input id="supabase-key" placeholder="publishable or anon key" /></label>
            <label>Email for magic link<input id="supabase-email" placeholder="you@example.com" /></label>
          </div>
          <div class="button-row">
            <button id="sync-configure" type="button">Configure</button>
            <button id="sync-login" type="button">Send magic link</button>
            <button id="sync-push" type="button">Push local brain</button>
            <button id="sync-pull" type="button">Pull cloud brain</button>
          </div>
          <p class="hint">Uses authenticated Supabase rows with RLS. Never put service-role keys in this client.</p>
        </section>

        <section id="parity" class="panel">
          <div class="section-head">
            <div>
              <p class="eyebrow">OS parity</p>
              <h2>How close each platform can get</h2>
            </div>
          </div>
          <div class="capability-list">
            ${PLATFORM_CAPABILITIES.map(renderCapability).join("")}
          </div>
        </section>
      </section>
    </main>
  `;

  wireEvents();
}

function renderPlan(plan: AgentPlan): string {
  return `
    <div class="plan">
      <p class="plan-summary">${escapeHtml(plan.summary)}</p>
      <div class="actions">
        ${plan.actions
          .map(
            (action) => `
          <article class="action ${action.requiresConfirmation ? "gated" : ""}">
            <div>
              <strong>${escapeHtml(action.title)}</strong>
              <span>${escapeHtml(action.type)} · ${escapeHtml(action.risk)}</span>
            </div>
            <b>${action.requiresConfirmation ? "confirm" : "auto"}</b>
          </article>
        `
          )
          .join("")}
      </div>
      <ul class="notes">
        ${plan.platformNotes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}
      </ul>
    </div>
  `;
}

function renderMemory(item: { title: string; body: string; tags: string[]; updatedAt: string }): string {
  return `
    <article class="memory-item">
      <div>
        <strong>${escapeHtml(item.title)}</strong>
        <span>${new Date(item.updatedAt).toLocaleString()}</span>
      </div>
      <p>${escapeHtml(item.body)}</p>
      <small>${item.tags.map(escapeHtml).join(" · ")}</small>
    </article>
  `;
}

function renderCapability(capability: (typeof PLATFORM_CAPABILITIES)[number]): string {
  return `
    <article class="capability">
      <div>
        <strong>${escapeHtml(capability.feature)}</strong>
        <span>Android: ${escapeHtml(capability.androidReference)}</span>
      </div>
      <div class="badges">
        <span>iOS ${capability.ios}</span>
        <span>macOS ${capability.macos}</span>
        <span>Linux ${capability.linux}</span>
        <span>Windows ${capability.windows}</span>
      </div>
      <p>${escapeHtml(capability.approach)}</p>
    </article>
  `;
}

function wireEvents(): void {
  document.querySelector("#prompt-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const input = document.querySelector<HTMLTextAreaElement>("#prompt-input");
    lastPlan = planPrompt(input?.value ?? "");
    render();
  });

  document.querySelector("#memory-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const title = document.querySelector<HTMLInputElement>("#memory-title")?.value.trim() || "Untitled";
    const body = document.querySelector<HTMLTextAreaElement>("#memory-body")?.value.trim() || "";
    const tags = (document.querySelector<HTMLInputElement>("#memory-tags")?.value ?? "")
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    if (!body) return;
    memoryStore.add({ kind: "fact", title, body, tags, source: "desktop-shell" });
    render();
  });

  document.querySelector("#sync-configure")?.addEventListener("click", () => {
    const url = document.querySelector<HTMLInputElement>("#supabase-url")?.value.trim();
    const publishableKey = document.querySelector<HTMLInputElement>("#supabase-key")?.value.trim();
    if (!url || !publishableKey) return setSyncStatus("Missing URL or key.");
    syncClient = createBrainSyncClient({ url, publishableKey });
    setSyncStatus("Configured. Sign in next.");
  });

  document.querySelector("#sync-login")?.addEventListener("click", async () => {
    try {
      const email = document.querySelector<HTMLInputElement>("#supabase-email")?.value.trim();
      if (!syncClient || !email) return setSyncStatus("Configure sync and enter email first.");
      await syncClient.signInWithOtp(email);
      setSyncStatus("Magic link sent.");
    } catch (error) {
      setSyncStatus(errorMessage(error));
    }
  });

  document.querySelector("#sync-push")?.addEventListener("click", async () => {
    try {
      if (!syncClient) return setSyncStatus("Configure sync first.");
      await syncClient.pushMemory(memoryStore.list());
      await syncClient.pushSettings(memoryStore.listSettings());
      setSyncStatus("Pushed local brain.");
    } catch (error) {
      setSyncStatus(errorMessage(error));
    }
  });

  document.querySelector("#sync-pull")?.addEventListener("click", async () => {
    try {
      if (!syncClient) return setSyncStatus("Configure sync first.");
      const remote = await syncClient.pullMemory();
      for (const item of remote) {
        memoryStore.add({
          kind: item.kind,
          title: item.title,
          body: item.body,
          tags: item.tags,
          source: item.source
        });
      }
      setSyncStatus(`Pulled ${remote.length} memories.`);
      render();
    } catch (error) {
      setSyncStatus(errorMessage(error));
    }
  });
}

function setSyncStatus(message: string): void {
  const status = document.querySelector("#sync-status");
  if (status) status.textContent = message;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };
    return entities[char] ?? char;
  });
}
