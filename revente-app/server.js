import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
loadEnv(path.join(ROOT, ".env"));

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.join(ROOT, "data");
const PHOTOS_DIR = path.join(DATA_DIR, "photos");
const DB_FILE = path.join(DATA_DIR, "items.json");
fs.mkdirSync(PHOTOS_DIR, { recursive: true });

const client = new Anthropic();
const MODEL = "claude-opus-5";

// ---------- Stockage simple (fichier JSON) ----------
function readDb() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, "utf8")); } catch { return []; }
}
function writeDb(items) {
  fs.writeFileSync(DB_FILE, JSON.stringify(items, null, 2));
}

// ---------- Analyse par Claude ----------
const SYSTEM = `Tu es un expert de la revente d'occasion en France (Vinted, Leboncoin, eBay, Rakuten, Back Market, Vestiaire Collective, Selency...).
À partir des photos d'un objet, tu dois :
1. L'identifier le plus précisément possible : marque, modèle exact, référence, année/collection, matière, couleur, taille/dimensions, état, défauts visibles. Lis toutes les étiquettes, logos, numéros de série. Si un point est incertain, dis-le et indique ton niveau de confiance.
2. Chercher sur le web des objets IDENTIQUES ou quasi identiques actuellement en vente ou déjà vendus (privilégie les prix de vente réels / annonces "vendu"). Fais plusieurs recherches ciblées (référence exacte, nom du modèle, sur chaque plateforme). Ne retiens que des comparables réellement proches, avec leur URL.
3. En déduire un prix : vente rapide, prix optimal, prix haut, en tenant compte de l'état.
4. Rédiger une annonce optimisée pour CHAQUE plateforme pertinente, en respectant ses usages et son référencement interne :
   - Vinted : titre court marque + type + taille/couleur, description conviviale, catégorie Vinted exacte, état selon la grille Vinted, hashtags/mots-clés.
   - Leboncoin : titre descriptif avec mots recherchés, description détaillée, catégorie Leboncoin exacte.
   - eBay : titre de 80 caractères max bourré de mots-clés, caractéristiques (item specifics), état selon la grille eBay.
   - Ajoute d'autres plateformes si elles sont plus adaptées à l'objet (ex : Vestiaire Collective pour le luxe, Back Market pour l'électronique).
Ne jamais inventer un comparable, un prix ou une URL.

Réponds en français. Termine OBLIGATOIREMENT ta réponse par un unique bloc \`\`\`json contenant exactement cette structure :
{
  "identification": { "titre": "", "marque": "", "modele": "", "reference": "", "categorie": "", "matiere": "", "couleur": "", "taille": "", "dimensions": "", "etat": "", "defauts": [""], "confiance": "haute|moyenne|faible", "a_verifier": [""] },
  "comparables": [ { "titre": "", "plateforme": "", "prix": 0, "statut": "en vente|vendu", "etat": "", "similarite": "identique|quasi identique|proche", "url": "" } ],
  "prix": { "rapide": 0, "optimal": 0, "haut": 0, "devise": "EUR", "justification": "" },
  "annonces": [ { "plateforme": "", "titre": "", "description": "", "categorie": "", "etat": "", "prix": 0, "mots_cles": [""], "attributs": { } } ],
  "conseils": [""]
}`;

function parseJson(text) {
  const blocks = [...text.matchAll(/```json\s*([\s\S]*?)```/g)];
  if (!blocks.length) throw new Error("Réponse inattendue du modèle (pas de JSON). Réessaie.");
  return JSON.parse(blocks[blocks.length - 1][1]);
}

// Gratuit : Google Gemini (clé sur https://aistudio.google.com/apikey)
async function analyzeGemini(images, note) {
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const parts = images.map((img) => ({ inline_data: { mime_type: img.mediaType, data: img.data } }));
  parts.push({ text: `Voici les photos de l'objet à revendre.${note ? ` Infos du vendeur : ${note}` : ""}` });
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: "user", parts }],
        tools: [{ google_search: {} }],
      }),
    },
  );
  const data = await r.json();
  if (!r.ok) {
    if (r.status === 429) throw new Error("Quota gratuit Gemini atteint pour le moment, réessaie plus tard.");
    throw new Error(`Erreur Gemini : ${data.error?.message || r.status}`);
  }
  const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("\n");
  return parseJson(text);
}

async function analyze(images, note) {
  if (!process.env.ANTHROPIC_API_KEY && process.env.GEMINI_API_KEY) return analyzeGemini(images, note);
  const content = images.map((img) => ({
    type: "image",
    source: { type: "base64", media_type: img.mediaType, data: img.data },
  }));
  content.push({
    type: "text",
    text: `Voici les photos de l'objet à revendre.${note ? ` Infos du vendeur : ${note}` : ""}`,
  });

  const messages = [{ role: "user", content }];
  const tools = [
    { type: "web_search_20260209", name: "web_search", max_uses: 15 },
    { type: "web_fetch_20260209", name: "web_fetch", max_uses: 10 },
  ];

  let response;
  // Les outils serveur peuvent mettre le tour en pause (pause_turn) : on relance.
  for (let i = 0; i < 5; i++) {
    response = await client.beta.messages
      .stream({
        model: MODEL,
        max_tokens: 64000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        thinking: { type: "adaptive" },
        output_config: { effort: "high" },
        system: SYSTEM,
        tools,
        messages,
      })
      .finalMessage();
    if (response.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: response.content });
  }

  if (response.stop_reason === "refusal") {
    throw new Error("La demande a été refusée par le modèle.");
  }
  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  return parseJson(text);
}

// ---------- Notifications ----------
async function notify(message) {
  console.log(`[notif] ${message}`);
  const { TELEGRAM_BOT_TOKEN: token, TELEGRAM_CHAT_ID: chat } = process.env;
  if (!token || !chat) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text: message }),
    });
  } catch (e) {
    console.error("Telegram :", e.message);
  }
}

// ---------- Serveur HTTP ----------
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function serveFile(res, file) {
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end("Introuvable"); }
    res.writeHead(200, { "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream" });
    res.end(buf);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  try {
    if (req.method === "GET" && url.pathname === "/api/items") {
      return send(res, 200, readDb());
    }

    if (req.method === "POST" && url.pathname === "/api/analyze") {
      const { images = [], note = "" } = await readJson(req);
      if (!images.length) return send(res, 400, { error: "Ajoute au moins une photo." });
      const id = crypto.randomUUID();
      const photos = images.map((img, i) => {
        const ext = img.mediaType.split("/")[1] || "jpg";
        const name = `${id}-${i}.${ext}`;
        fs.writeFileSync(path.join(PHOTOS_DIR, name), Buffer.from(img.data, "base64"));
        return `/photos/${name}`;
      });
      const analysis = await analyze(images, note);
      const item = { id, createdAt: new Date().toISOString(), note, photos, analysis, status: "analysé", listings: {} };
      const items = readDb();
      items.unshift(item);
      writeDb(items);
      return send(res, 200, item);
    }

    // Mise à jour du suivi : { plateforme, url, statut: "publiée"|"vendue" }
    const m = url.pathname.match(/^\/api\/items\/([\w-]+)\/listing$/);
    if (req.method === "POST" && m) {
      const { plateforme, url: listingUrl = "", statut } = await readJson(req);
      const items = readDb();
      const item = items.find((x) => x.id === m[1]);
      if (!item) return send(res, 404, { error: "Objet introuvable" });
      item.listings[plateforme] = { url: listingUrl, statut, date: new Date().toISOString() };
      item.status = Object.values(item.listings).some((l) => l.statut === "vendue") ? "vendu" : "en vente";
      writeDb(items);
      const titre = item.analysis.identification?.titre || "Objet";
      await notify(statut === "vendue"
        ? `💰 Vendu sur ${plateforme} : ${titre}`
        : `✅ Annonce publiée sur ${plateforme} : ${titre}${listingUrl ? `\n${listingUrl}` : ""}`);
      return send(res, 200, item);
    }

    const d = url.pathname.match(/^\/api\/items\/([\w-]+)$/);
    if (req.method === "DELETE" && d) {
      writeDb(readDb().filter((x) => x.id !== d[1]));
      return send(res, 200, { ok: true });
    }

    if (req.method === "GET" && url.pathname.startsWith("/photos/")) {
      return serveFile(res, path.join(PHOTOS_DIR, path.basename(url.pathname)));
    }
    if (req.method === "GET") {
      const file = url.pathname === "/" ? "index.html" : path.basename(url.pathname);
      return serveFile(res, path.join(ROOT, "public", file));
    }
    res.writeHead(404); res.end();
  } catch (err) {
    console.error(err);
    if (err instanceof Anthropic.AuthenticationError) return send(res, 500, { error: "Clé API Anthropic invalide : vérifie le fichier .env" });
    if (err instanceof Anthropic.RateLimitError) return send(res, 429, { error: "Trop de demandes, réessaie dans une minute." });
    if (err instanceof Anthropic.APIError) return send(res, 502, { error: `Erreur API : ${err.message}` });
    send(res, 500, { error: err.message });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`\nApp de revente lancée ✔\n  Sur cet ordinateur : http://localhost:${PORT}`);
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family === "IPv4" && !a.internal) console.log(`  Sur ton réseau (téléphone…) : http://${a.address}:${PORT}`);
    }
  }
  if (process.env.ANTHROPIC_API_KEY) console.log("\n  Moteur : Claude");
  else if (process.env.GEMINI_API_KEY) console.log("\n  Moteur : Gemini (gratuit)");
  else console.log("\n⚠️  Aucune clé : copie .env.example en .env et colle ta clé GEMINI_API_KEY.");
});

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
