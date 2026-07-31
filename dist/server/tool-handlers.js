// server/tool-handlers.ts
import { readdirSync as readdirSync2 } from "fs";
import { resolve as resolve5 } from "path";

// server/asset-registry.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync, createReadStream, statSync, renameSync } from "fs";
import { extname, isAbsolute, relative, resolve, sep } from "path";
function manifestPath(dir) {
  return resolve(dir, "manifest.json");
}
function mediaDir(dir) {
  return resolve(dir, "media");
}
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function isMediaAsset(value) {
  return isRecord(value) && typeof value.id === "string" && (value.kind === "image" || value.kind === "video") && typeof value.productionType === "string";
}
function isProviderBacked(value) {
  return isRecord(value) && isRecord(value.provider);
}
function normalizeMediaAsset(value) {
  if (!isMediaAsset(value)) return null;
  const source = value;
  const providerBacked = isProviderBacked(source);
  return {
    ...source,
    label: source.label ?? (typeof source.name === "string" ? source.name : void 0),
    mime: source.mime ?? (typeof source.mimeType === "string" ? source.mimeType : void 0),
    meta: providerBacked ? { ...source.meta ?? {}, upload: true } : source.meta
  };
}
function validateAssetRecords(assets) {
  const ids = /* @__PURE__ */ new Set();
  for (const asset of assets) {
    if (!isRecord(asset)) throw new Error("Invalid shared asset manifest record");
    if (typeof asset.id !== "string" || asset.id.length === 0 || typeof asset.kind !== "string" || asset.kind.length === 0 || ids.has(asset.id)) {
      throw new Error("Invalid or duplicate shared asset id");
    }
    ids.add(asset.id);
  }
}
function readManifest(dir) {
  const path = manifestPath(dir);
  if (!existsSync(path)) return { version: 2, assets: [] };
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, "utf-8"));
  } catch (error) {
    throw new Error(`Invalid shared asset manifest JSON: ${path}`, { cause: error });
  }
  if (parsed.version !== 2 || !Array.isArray(parsed.assets)) {
    throw new Error(`Unsupported shared asset manifest: ${path}`);
  }
  validateAssetRecords(parsed.assets);
  return { ...parsed, version: 2, assets: parsed.assets };
}
function writeManifest(dir, manifest) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const target = manifestPath(dir);
  const temp = `${target}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(temp, `${JSON.stringify({ ...manifest, version: 2 }, null, 2)}
`);
  renameSync(temp, target);
}
function listAssets(dir, filter) {
  let out = readManifest(dir).assets.map(normalizeMediaAsset).filter((asset) => asset !== null);
  if (filter?.kind) out = out.filter((a) => a.kind === filter.kind);
  if (filter?.productionType) out = out.filter((a) => a.productionType === filter.productionType);
  if (filter?.sceneNodeId) out = out.filter((a) => a.sceneNodeId === filter.sceneNodeId);
  return out;
}
function getAsset(dir, id) {
  const asset = readManifest(dir).assets.find((a) => isRecord(a) && a.id === id);
  return normalizeMediaAsset(asset);
}
function upsertAsset(dir, asset) {
  const m = readManifest(dir);
  const idx = m.assets.findIndex((a) => a.id === asset.id);
  if (idx >= 0 && (!isMediaAsset(m.assets[idx]) || isProviderBacked(m.assets[idx]))) {
    throw new Error(`Asset id is owned by another asset domain: ${asset.id}`);
  }
  const now = Date.now();
  const next = { ...asset, updatedAt: now, createdAt: asset.createdAt || now };
  if (idx >= 0) m.assets[idx] = next;
  else m.assets.push(next);
  writeManifest(dir, m);
  return next;
}
function updateAsset(dir, id, patch) {
  const m = readManifest(dir);
  const idx = m.assets.findIndex((a) => isMediaAsset(a) && !isProviderBacked(a) && a.id === id);
  if (idx < 0) return null;
  const merged = { ...m.assets[idx], ...patch, id, updatedAt: Date.now() };
  m.assets[idx] = merged;
  writeManifest(dir, m);
  return merged;
}
function getStyleAxes(dir) {
  return readManifest(dir).styleAxes;
}
function writeMediaFile(dir, id, ext, bytes) {
  const md = mediaDir(dir);
  if (!existsSync(md)) mkdirSync(md, { recursive: true });
  const cleanExt = ext.replace(/^\./, "").toLowerCase() || "bin";
  const rel = `media/${id}.${cleanExt}`;
  writeFileSync(resolve(dir, rel), bytes);
  return rel;
}
function resolveAssetFilePath(dir, asset) {
  if (asset.file) {
    const mediaRoot = resolve(dir, "media");
    const candidate = resolve(dir, asset.file);
    const rel = relative(mediaRoot, candidate);
    return rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel) ? candidate : null;
  }
  if (asset.externalPath && isAbsolute(asset.externalPath)) {
    const gameRoot = resolve(dir, "..");
    const candidate = resolve(asset.externalPath);
    const rel = relative(gameRoot, candidate);
    return rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel) ? candidate : null;
  }
  return null;
}
var MIME_BY_EXT = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif"
};
function mimeForPath(p) {
  return MIME_BY_EXT[extname(p).toLowerCase()] ?? "application/octet-stream";
}

// src/editor/assets/registry-types.ts
function makeAssetId(productionType) {
  const tag = productionType === "video_clip" ? "vid" : productionType === "shot_image" ? "img" : productionType === "grid_storyboard" ? "grid" : productionType === "character_ref" ? "char" : "scene";
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  return `a-${tag}-${t}-${r}`;
}

// server/engine/llm/config/styleSkillLoader.ts
function parseFrontmatter(raw) {
  const s = raw.replace(/^\uFEFF/, "");
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(s);
  if (!m) return { meta: {}, body: s };
  const meta = {};
  for (const line of (m[1] ?? "").split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    const key = kv?.[1];
    if (!kv || !key) continue;
    let v = (kv[2] ?? "").trim();
    if (v.startsWith('"') && v.endsWith('"') || v.startsWith("'") && v.endsWith("'")) {
      v = v.slice(1, -1);
    }
    meta[key] = v;
  }
  return { meta, body: s.slice(m[0].length) };
}
function parseSections(body) {
  const heads = [];
  const re = /^##[ \t]+(.+?)[ \t]*$/gm;
  let m;
  while (m = re.exec(body)) {
    heads.push({ title: (m[1] ?? "").trim(), contentStart: re.lastIndex, headStart: m.index });
  }
  const out = {};
  for (let i = 0; i < heads.length; i++) {
    const h = heads[i];
    if (!h) continue;
    const next = heads[i + 1];
    const end = next ? next.headStart : body.length;
    out[h.title] = body.slice(h.contentStart, end).trim();
  }
  return out;
}
function parseStyleSkill(raw) {
  const { meta, body } = parseFrontmatter(raw);
  return { meta, sections: parseSections(body) };
}
function needMeta(p, key, where) {
  const v = (p.meta[key] ?? "").trim();
  if (!v) throw new Error(`[styleSkillLoader] ${where} \u7F3A frontmatter:${key}`);
  return v;
}
function needSection(p, key, where) {
  const v = (p.sections[key] ?? "").trim();
  if (!v) throw new Error(`[styleSkillLoader] ${where} \u7F3A section:${key}`);
  return v;
}
function assertId(p, expectedId) {
  const id = (p.meta.name ?? "").trim();
  if (id !== expectedId) {
    throw new Error(
      `[styleSkillLoader] id \u4E0D\u5339\u914D: \u76EE\u5F55=${expectedId} frontmatter.name=${id}`
    );
  }
}
function parseSwatch(raw, where) {
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const a = parts[0];
  const b = parts[1];
  if (!a || !b) {
    throw new Error(`[styleSkillLoader] ${where} swatch \u9700\u8981\u4E24\u4E2A\u989C\u8272: "${raw}"`);
  }
  return [a, b];
}

// server/engine/llm/_raw.ts
import { readFileSync as readFileSync2 } from "fs";
import { fileURLToPath } from "url";
function readRaw(metaUrl, relPath) {
  return readFileSync2(fileURLToPath(new URL(relPath, metaUrl)), "utf8");
}

// server/engine/llm/config/filmLookPresets.ts
var retroFutureRaw = readRaw(import.meta.url, "../skills/film-looks/retro-future/SKILL.md");
var baroqueRaw = readRaw(import.meta.url, "../skills/film-looks/baroque-chiaroscuro/SKILL.md");
var tealOrangeRaw = readRaw(import.meta.url, "../skills/film-looks/teal-orange/SKILL.md");
var bleachBypassRaw = readRaw(import.meta.url, "../skills/film-looks/bleach-bypass/SKILL.md");
var pastelRaw = readRaw(import.meta.url, "../skills/film-looks/pastel-symmetry/SKILL.md");
var noirRaw = readRaw(import.meta.url, "../skills/film-looks/noir-lowkey/SKILL.md");
var warmNostalgiaRaw = readRaw(import.meta.url, "../skills/film-looks/warm-nostalgia/SKILL.md");
var clinicalRaw = readRaw(import.meta.url, "../skills/film-looks/clinical-scifi/SKILL.md");
var morandiRaw = readRaw(import.meta.url, "../skills/film-looks/morandi-muted/SKILL.md");
var bronzeRaw = readRaw(import.meta.url, "../skills/film-looks/bronze-epic/SKILL.md");
var REGISTRY = [
  ["retro-future", retroFutureRaw],
  ["baroque-chiaroscuro", baroqueRaw],
  ["teal-orange", tealOrangeRaw],
  ["bleach-bypass", bleachBypassRaw],
  ["pastel-symmetry", pastelRaw],
  ["noir-lowkey", noirRaw],
  ["warm-nostalgia", warmNostalgiaRaw],
  ["clinical-scifi", clinicalRaw],
  ["morandi-muted", morandiRaw],
  ["bronze-epic", bronzeRaw]
];
function toPreset(id, raw) {
  const p = parseStyleSkill(raw);
  assertId(p, id);
  return {
    id,
    label: needMeta(p, "label", id),
    hint: needMeta(p, "hint", id),
    swatch: parseSwatch(needMeta(p, "swatch", id), id),
    tagline: needMeta(p, "tagline", id),
    colorPrefix: needSection(p, "\u8C03\u8272\u951A\u70B9", id),
    sceneAdapt: needSection(p, "\u573A\u666F\u81EA\u9002\u5E94", id),
    authoringHint: needSection(p, "\u4F5C\u8005\u6587\u98CE", id),
    posterPrompt: needSection(p, "\u6D77\u62A5\u6837\u5F20", id)
  };
}
var FILM_LOOK_PRESETS = Object.fromEntries(
  REGISTRY.map(([id, raw]) => [id, toPreset(id, raw)])
);
var FILM_LOOK_LIST = REGISTRY.map(
  ([id]) => FILM_LOOK_PRESETS[id]
);
function filmLookColorPrefix(look) {
  if (!look) return "";
  return FILM_LOOK_PRESETS[look]?.colorPrefix ?? "";
}
function coerceFilmLookId(v) {
  if (typeof v !== "string") return void 0;
  const id = v.trim();
  return id in FILM_LOOK_PRESETS ? id : void 0;
}
function filmLookAuthoringHint(look) {
  if (!look) return "";
  const p = FILM_LOOK_PRESETS[look];
  if (!p) return "";
  return `${p.authoringHint}
\u573A\u666F\u81EA\u9002\u5E94\uFF1A${p.sceneAdapt}`;
}

// server/engine/llm/config/visualStylePresets.ts
var photorealRaw = readRaw(import.meta.url, "../skills/art-media/photoreal/SKILL.md");
var animeRaw = readRaw(import.meta.url, "../skills/art-media/anime/SKILL.md");
var cartoonRaw = readRaw(import.meta.url, "../skills/art-media/cartoon/SKILL.md");
var pixelartRaw = readRaw(import.meta.url, "../skills/art-media/pixelart/SKILL.md");
var watercolorRaw = readRaw(import.meta.url, "../skills/art-media/watercolor/SKILL.md");
var inkRaw = readRaw(import.meta.url, "../skills/art-media/ink/SKILL.md");
var render3d2dRaw = readRaw(import.meta.url, "../skills/art-media/render3d2d/SKILL.md");
var REGISTRY2 = [
  ["photoreal", photorealRaw],
  ["anime", animeRaw],
  ["cartoon", cartoonRaw],
  ["pixelart", pixelartRaw],
  ["watercolor", watercolorRaw],
  ["ink", inkRaw],
  ["render3d2d", render3d2dRaw]
];
function toPreset2(id, raw) {
  const p = parseStyleSkill(raw);
  assertId(p, id);
  return {
    id,
    label: needMeta(p, "label", id),
    hint: needMeta(p, "hint", id),
    swatch: parseSwatch(needMeta(p, "swatch", id), id),
    tagline: needMeta(p, "tagline", id),
    promptPrefix: needSection(p, "\u51FA\u56FE\u524D\u7F00", id),
    authoringHint: needSection(p, "\u4F5C\u8005\u6587\u98CE", id),
    posterPrompt: needSection(p, "\u6D77\u62A5\u6837\u5F20", id)
  };
}
var VISUAL_STYLE_PRESETS = Object.fromEntries(
  REGISTRY2.map(([id, raw]) => [id, toPreset2(id, raw)])
);
var VISUAL_STYLE_LIST = REGISTRY2.map(
  ([id]) => VISUAL_STYLE_PRESETS[id]
);
function composeVisualPrompt(rawPrompt, style, look) {
  const colorPrefix = filmLookColorPrefix(look);
  const mediumPrefix = style ? VISUAL_STYLE_PRESETS[style]?.promptPrefix ?? "" : "";
  const prefix = [colorPrefix, mediumPrefix].filter(Boolean).join("\n\n");
  if (!prefix) return rawPrompt;
  if (!rawPrompt) return prefix;
  return `${prefix}

${rawPrompt}`;
}
function getAuthoringHint(style, look) {
  const mediumHint = style ? VISUAL_STYLE_PRESETS[style]?.authoringHint ?? "" : "";
  const lookHint = filmLookAuthoringHint(look);
  return [mediumHint, lookHint].filter(Boolean).join("\n");
}

// server/engine/llm/config/directorSkillLoader.ts
var principleRaw = readRaw(import.meta.url, "../skills/directors/_shared/directing-principle.md");
var minimalEpicRaw = readRaw(import.meta.url, "../skills/directors/minimal-epic/SKILL.md");
var precisionNoirRaw = readRaw(import.meta.url, "../skills/directors/precision-noir/SKILL.md");
var foreknowledgeSuspenseRaw = readRaw(import.meta.url, "../skills/directors/foreknowledge-suspense/SKILL.md");
var moodNeonRaw = readRaw(import.meta.url, "../skills/directors/mood-neon/SKILL.md");
var luminousAnimeRaw = readRaw(import.meta.url, "../skills/directors/luminous-anime/SKILL.md");
var kineticClarityRaw = readRaw(import.meta.url, "../skills/directors/kinetic-clarity/SKILL.md");
var cyberpunkRaw = readRaw(import.meta.url, "../skills/directors/cyberpunk-neonoir/SKILL.md");
var unseenHorrorRaw = readRaw(import.meta.url, "../skills/directors/unseen-horror/SKILL.md");
var nonlinearScifiRaw = readRaw(import.meta.url, "../skills/directors/nonlinear-scifi/SKILL.md");
var pulpDialogueRaw = readRaw(import.meta.url, "../skills/directors/pulp-dialogue/SKILL.md");
var DIRECTING_PRINCIPLE = principleRaw.replace(/^\uFEFF/, "").trim();
function parseFrontmatter2(raw) {
  const s = raw.replace(/^\uFEFF/, "");
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(s);
  if (!m) return { meta: {}, body: s };
  const meta = {};
  for (const line of (m[1] ?? "").split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    const key = kv?.[1];
    if (!kv || !key) continue;
    let v = (kv[2] ?? "").trim();
    if (v.startsWith('"') && v.endsWith('"') || v.startsWith("'") && v.endsWith("'")) {
      v = v.slice(1, -1);
    }
    meta[key] = v;
  }
  return { meta, body: s.slice(m[0].length) };
}
function parseSections2(body) {
  const heads = [];
  const re = /^##[ \t]+(.+?)[ \t]*$/gm;
  let m;
  while (m = re.exec(body)) {
    heads.push({ title: (m[1] ?? "").trim(), contentStart: re.lastIndex, headStart: m.index });
  }
  const out = {};
  for (let i = 0; i < heads.length; i++) {
    const h = heads[i];
    if (!h) continue;
    const next = heads[i + 1];
    const end = next ? next.headStart : body.length;
    out[h.title] = body.slice(h.contentStart, end).trim();
  }
  return out;
}
function parse(raw) {
  const { meta, body } = parseFrontmatter2(raw);
  return { meta, sections: parseSections2(body) };
}
function toPersona(expectedId, raw) {
  const { meta, sections } = parse(raw);
  const need = (obj, key, where) => {
    const v = (obj[key] ?? "").trim();
    if (!v) throw new Error(`[directorSkillLoader] ${expectedId} \u7F3A ${where}:${key}`);
    return v;
  };
  const id = need(meta, "name", "frontmatter");
  if (id !== expectedId) {
    throw new Error(`[directorSkillLoader] id \u4E0D\u5339\u914D: \u76EE\u5F55=${expectedId} frontmatter.name=${id}`);
  }
  return {
    id: expectedId,
    displayName: need(meta, "displayName", "frontmatter"),
    tagline: need(meta, "tagline", "frontmatter"),
    identity: need(sections, "\u8EAB\u4EFD", "section"),
    editingGrammar: need(sections, "\u526A\u8F91\u8BED\u6CD5", "section"),
    cameraLanguage: need(sections, "\u955C\u5934\u8BED\u8A00", "section"),
    pacing: need(sections, "\u8282\u594F", "section"),
    downstreamBinding: need(sections, "\u4E0B\u6E38\u7ED1\u5B9A", "section"),
    posterPrompt: need(sections, "\u6D77\u62A5\u6837\u5F20", "section")
  };
}
var REGISTRY3 = [
  ["minimal-epic", minimalEpicRaw],
  ["precision-noir", precisionNoirRaw],
  ["foreknowledge-suspense", foreknowledgeSuspenseRaw],
  ["mood-neon", moodNeonRaw],
  ["luminous-anime", luminousAnimeRaw],
  ["kinetic-clarity", kineticClarityRaw],
  ["cyberpunk-neonoir", cyberpunkRaw],
  ["unseen-horror", unseenHorrorRaw],
  ["nonlinear-scifi", nonlinearScifiRaw],
  ["pulp-dialogue", pulpDialogueRaw]
];
var DIRECTOR_PERSONAS = Object.fromEntries(REGISTRY3.map(([id, raw]) => [id, toPersona(id, raw)]));
var DIRECTOR_ORDER = REGISTRY3.map(
  ([id]) => id
);

// server/engine/llm/config/directorPersonas.ts
var DEFAULT_DIRECTOR_STYLE = "minimal-epic";
var PERSONAS = DIRECTOR_PERSONAS;
function resolveDirectorPersona(id, custom) {
  if (id === "custom" && custom && custom.trim()) {
    return {
      id: "custom",
      displayName: "\u81EA\u5B9A\u4E49",
      tagline: "\u4F5C\u8005\u81EA\u586B persona",
      identity: custom.trim(),
      editingGrammar: "\uFF08\u4F5C\u8005\u81EA\u5B9A\u4E49\u2014\u2014\u4EE5 identity \u6BB5\u63CF\u8FF0\u4E3A\u51C6\uFF1B\u5982\u672A\u6307\u5B9A\uFF0C\u9ED8\u8BA4\u8282\u62CD\u4E2D\u901F\u3001\u526A\u8F91\u4E0D\u8FC7\u5EA6\u98CE\u683C\u5316\uFF09",
      cameraLanguage: "\uFF08\u4F5C\u8005\u81EA\u5B9A\u4E49\u2014\u2014\u4EE5 identity \u6BB5\u63CF\u8FF0\u4E3A\u51C6\uFF1B\u5982\u672A\u6307\u5B9A\uFF0C\u9ED8\u8BA4 medium+close \u6DF7\u5408\u3001\u81EA\u7136\u5149\u3001\u4E2D\u6027\u8272\u5F69\uFF09",
      pacing: "\uFF08\u4F5C\u8005\u81EA\u5B9A\u4E49\u2014\u2014\u4EE5 identity \u6BB5\u63CF\u8FF0\u4E3A\u51C6\uFF1B\u5982\u672A\u6307\u5B9A\uFF0C\u9ED8\u8BA4\u6839\u636E\u573A\u666F\u60C5\u7EEA\u81EA\u8C03\uFF09",
      downstreamBinding: '\uFF08\u4F5C\u8005\u81EA\u5B9A\u4E49\u2014\u2014\u6309 identity \u63CF\u8FF0\u7684\u98CE\u683C\uFF0C\u9075\u5FAA"\u955C\u5934\u8C03\u5EA6\u901A\u5219"\uFF1A\u666F\u522B\u968F\u620F\u8D70\u3001\u7B7E\u540D\u70B9\u775B\u4E0D\u9010\u955C\u5957\u7528\u3001\u7D27\u5F20\u5904\u5FEB\u5207\u3001\u8FDE\u8D2F\u6865\u6BB5\u5C3D\u91CF 15 \u79D2\u5185\u4E00\u955C\u5230\u5E95\u3001\u77ED\u62CD\u7EA6 4 \u79D2\u7559\u88C1\u526A\uFF09',
      posterPrompt: "Cinematic film poster, balanced dramatic composition, natural cinematic lighting, neutral filmic color grade, evocative mood, no text, vertical 2:3"
    };
  }
  const chosen = id && id !== "custom" ? id : DEFAULT_DIRECTOR_STYLE;
  return PERSONAS[chosen] ?? PERSONAS[DEFAULT_DIRECTOR_STYLE];
}
function serializePersonaToPrompt(p) {
  return [
    `# \u5BFC\u6F14\u6D41\u6D3E\uFF1A${p.displayName} \u2014\u2014 ${p.tagline}`,
    "",
    `**\u8EAB\u4EFD**\uFF1A${p.identity}`,
    "",
    `**\u526A\u8F91\u8BED\u6CD5**\uFF1A${p.editingGrammar}`,
    "",
    `**\u955C\u5934\u8BED\u8A00**\uFF1A${p.cameraLanguage}`,
    "",
    `**\u955C\u5934\u8C03\u5EA6\u901A\u5219\uFF08\u51CC\u9A7E\u4E8E\u4E0A\u9762\u7684\u98CE\u683C\u4E4B\u4E0A\uFF0C\u6240\u6709\u5BFC\u6F14\u901A\u7528\uFF09**\uFF1A${DIRECTING_PRINCIPLE}`,
    "",
    `**\u8282\u594F\u504F\u597D**\uFF1A${p.pacing}`,
    "",
    `**\u4E0B\u6E38\u7ED1\u5B9A\uFF08\u843D\u5230\u9010\u955C\u51FA\u7247 / \u526A\u8F91\uFF1B\u60C5\u5883\u5316\u8C03\u5EA6\uFF0C\u975E\u9010\u955C\u5957\u7528\uFF09**\uFF1A
${p.downstreamBinding}`
  ].join("\n");
}
function coerceDirectorStyleId(v) {
  if (typeof v !== "string") return void 0;
  const t = v.trim();
  return DIRECTOR_ORDER.includes(t) ? t : void 0;
}

// server/engine/axes.ts
function coerceVisualStyleId(v) {
  if (typeof v !== "string") return void 0;
  const id = v.trim();
  return id in VISUAL_STYLE_PRESETS ? id : void 0;
}
function composeAxes(axes, custom) {
  const artMedia = coerceVisualStyleId(axes?.artMedia);
  const filmLook = coerceFilmLookId(axes?.filmLook);
  const director = coerceDirectorStyleId(axes?.director);
  const uiStylePrompt = composeVisualPrompt("", artMedia, filmLook);
  const authoringHint = getAuthoringHint(artMedia, filmLook);
  const persona = resolveDirectorPersona(director, custom);
  const directorSystem = serializePersonaToPrompt(persona);
  const styleKeywords = authoringHint.split("\n").map((s) => s.trim()).filter(Boolean);
  return {
    ...artMedia ? { artMedia } : {},
    ...filmLook ? { filmLook } : {},
    uiStylePrompt,
    authoringHint,
    directorSystem,
    styleKeywords
  };
}

// server/engine/fmv/templates.ts
function buildPerspectiveLockBlock(perspective, context = "video") {
  if (!perspective) return "";
  const suffix = context === "phase3" ? " \xB7 \u6240\u6709\u955C\u5934\u5FC5\u987B\u9075\u5FAA" : "";
  const prefix = context === "phase3" ? "seedancePrompt \u4E2D" : "\u753B\u9762\u4E2D";
  switch (perspective) {
    case "\u7B2C\u4E00\u4EBA\u79F0":
      return [
        `\u3010\u89C6\u89D2\u9501\u5B9A \xB7 \u7B2C\u4E00\u4EBA\u79F0 POV${suffix}\u3011`,
        "\u6444\u5F71\u673A = \u4E3B\u89D2\u773C\u775B\u3002\u786C\u7EA6\u675F\uFF1A",
        `1. ${prefix}\u6C38\u8FDC\u4E0D\u51FA\u73B0\u4E3B\u89D2\u7684\u6B63\u9762\u3001\u4FA7\u9762\u6216\u80CC\u5F71\uFF08\u6444\u5F71\u673A\u5373\u4E3B\u89D2\u89C6\u91CE\uFF09\uFF1B`,
        "2. \u5176\u4ED6\u89D2\u8272\u9762\u671D\u6444\u5F71\u673A\u65B9\u5411\u8BF4\u8BDD/\u4E92\u52A8\uFF08\u5236\u9020\u300C\u5BF9\u7740\u89C2\u4F17\u300D\u7684\u6C89\u6D78\u611F\uFF09\uFF1B",
        "3. \u4E3B\u89D2\u80A2\u4F53\u4EC5\u5141\u8BB8\u51FA\u73B0\uFF1A\u4F38\u51FA\u7684\u624B/\u624B\u81C2\u3001\u4F4E\u5934\u770B\u5230\u7684\u8EAF\u5E72\u5C40\u90E8\u3001\u5F71\u5B50\uFF1B",
        "4. \u955C\u5934\u8F7B\u5FAE\u547C\u5438\u6D6E\u52A8 + \u89C6\u7EBF\u968F\u6CE8\u610F\u529B\u8F6C\u79FB\u81EA\u7136\u6446\u52A8\uFF08\u6A21\u62DF\u771F\u5B9E\u4EBA\u773C\uFF09\uFF1B",
        "5. \u8FD0\u955C\u4E0D\u5F97\u51FA\u73B0\u73AF\u7ED5 / \u7B2C\u4E09\u4EBA\u79F0\u5916\u90E8\u673A\u4F4D / \u4FEF\u77B0\u2014\u2014\u4EFB\u4F55\u66B4\u9732\u4E3B\u89D2\u5168\u8C8C\u7684\u673A\u4F4D\u90FD\u4E0D\u5408\u89C4\u3002"
      ].join("\n");
    default:
      return [
        `\u3010\u89C6\u89D2\u57FA\u7EBF \xB7 \u7B2C\u4E09\u4EBA\u79F0\u7535\u5F71\u955C\u5934${suffix}\u3011`,
        "\u6309\u6B63\u5E38\u7535\u5F71\u955C\u5934\u89C4\u5212\u5904\u7406\uFF0C\u4E0D\u505A\u4EBA\u79F0\u673A\u4F4D\u786C\u9650\u5236\uFF1A",
        `1. ${prefix}\u53EF\u4EE5\u6839\u636E\u53D9\u4E8B\u9700\u8981\u4F7F\u7528\u8FDC\u666F\u3001\u822A\u62CD\u3001\u9E1F\u77B0\u3001\u4FEF\u62CD\u3001\u8FC7\u80A9\u3001\u7279\u5199\u3001\u7A7A\u955C\u6216\u591A\u89D2\u8272\u8C03\u5EA6\uFF1B`,
        "2. \u4E0D\u8981\u6C42\u6444\u5F71\u673A\u7D27\u968F\u4E3B\u89D2\uFF0C\u4E5F\u4E0D\u8981\u6C42\u4E3B\u89D2\u59CB\u7EC8\u5165\u753B\uFF1B",
        "3. \u53EA\u9700\u4FDD\u6301\u573A\u9762\u8C03\u5EA6\u3001\u89D2\u8272\u5173\u7CFB\u548C\u4FE1\u606F\u63ED\u793A\u6E05\u6670\uFF0C\u4E0D\u5F97\u8BEF\u5199\u6210\u7B2C\u4E00\u4EBA\u79F0 POV\u3002"
      ].join("\n");
  }
}
var VIDEO_EXTEND_HEADER_BLOCK = [
  "\u3010\u89C6\u9891\u5EF6\u957F\u4EFB\u52A1 \xB7 V-PROMPT-15\u3011",
  "\u5EF6\u7EED\u4E0A\u4E00\u6BB5\u89C6\u9891\u5185\u5BB9\uFF0C\u4ECE @\u89C6\u98911 \u7684\u5C3E\u5E27\u65E0\u7F1D\u63A5\u7EED\u3002",
  "\u6865\u63A5\u5E27\u7B56\u7565\uFF1A\u5F00\u573A\u77ED\u6682\u4FDD\u6301 @\u89C6\u98911 \u672B\u5E27\u7684\u4EBA\u7269\u59FF\u6001\u3001\u8868\u60C5\u3001\u5149\u5F71\u548C\u955C\u5934\u4F4D\u7F6E\u9AD8\u5EA6\u4E00\u81F4\uFF0C\u4EC5\u5141\u8BB8\u5FAE\u5E45\u81EA\u7136\u8FD0\u52A8\uFF0C\u968F\u540E\u63A8\u8FDB\u65B0\u52A8\u4F5C\u3002",
  "\u8854\u63A5\u7B56\u7565\uFF1A\u4E0A\u4E00\u6BB5\u82E5\u5728\u5207\u955C\u6216\u8F6C\u573A\u540E\u7ED3\u675F\uFF0C\u672C\u6BB5\u5E94\u4ECE\u5207\u955C\u540E\u7684\u65B0\u753B\u9762\u81EA\u7136\u8D77\u59CB\uFF1B\u7981\u6B62\u56DE\u9000\u5230\u4E0A\u4E00\u6BB5\u5DF2\u5B8C\u6210\u52A8\u4F5C\u3002",
  "\u8BED\u4E49\u8FB9\u754C\uFF1A@\u89C6\u98911 \u53EA\u7528\u4E8E\u65F6\u5E8F\u5EF6\u957F\uFF0C\u4E0D\u4F5C\u4E3A\u7279\u6548\u53C2\u8003\u89C6\u9891\uFF1B\u7279\u6548\u8FD0\u52A8\u903B\u8F91\u5FC5\u987B\u4F7F\u7528\u72EC\u7ACB\u7279\u6548\u53C2\u8003\u7D20\u6750\u8BF4\u660E\u3002",
  "\u786C\u7EA6\u675F\uFF087 \u7C7B\u5168\u90E8\u6EE1\u8DB3\u624D\u5408\u89C4\uFF09\uFF1A",
  "1. \u4EBA\u7269\u8EAB\u4EFD\uFF1A\u4E3B\u89D2 / \u914D\u89D2\u7684\u9762\u90E8\u3001\u53D1\u578B\u3001\u670D\u88C5\u3001\u77B3\u8272\u4E25\u683C\u6CBF\u7528 @\u89C6\u98911\uFF0C\u4E0D\u5F97\u66FF\u6362\u6216\u53D8\u5F62\uFF1B",
  "2. \u955C\u5934\u4F4D\u7F6E\uFF1A\u8D77\u59CB\u673A\u4F4D\u3001\u7126\u8DDD\u3001\u89C6\u89D2\u4E0E @\u89C6\u98911 \u672B\u5E27\u4E00\u81F4\u6216\u5408\u7406\u63A8\u8FDB\uFF0C\u7981\u6B62\u8DF3\u5207\u5230\u65E0\u5173\u673A\u4F4D\uFF1B",
  "3. \u5149\u5F71\u8272\u6E29\uFF1A\u4E3B\u5149\u6E90\u65B9\u5411\u3001\u8272\u6E29\u3001\u9634\u5F71\u67D4\u548C\u5EA6\u4E0E @\u89C6\u98911 \u9501\u5B9A\uFF0C\u7981\u6B62\u8DF3\u53D8\uFF1B",
  "4. \u8868\u6F14\u8282\u594F\uFF1A\u89D2\u8272\u59FF\u6001 / \u8868\u60C5 / \u52A8\u4F5C\u5F27\u7EBF\u4ECE @\u89C6\u98911 \u672B\u5E27\u81EA\u7136\u63A8\u8FDB\uFF0C\u7981\u6B62\u300C\u91CD\u65B0\u5F00\u59CB\u300D\u6216\u91CD\u7F6E\uFF1B",
  "5. \u573A\u666F\u7A7A\u95F4\uFF1A\u5730\u7406\u65B9\u4F4D\u3001\u9053\u5177\u4F4D\u7F6E\u3001\u5165\u753B\u65B9\u4F4D\u4E0E @\u89C6\u98911 \u4E00\u81F4\uFF0C\u7981\u6B62\u91CD\u7F6E\u573A\u666F\uFF1B",
  "6. \u5E27\u95F4\u4E00\u81F4\u6027\uFF1A\u76F8\u90BB\u5E27\u4E4B\u95F4\u7269\u4F53\u4F4D\u7F6E\u3001\u989C\u8272\u3001\u5149\u5F71\u53D8\u5316\u81EA\u7136\u8FDE\u7EED\uFF0C\u65E0\u95EA\u70C1\u3001\u65E0\u8DF3\u53D8\u3001\u65E0\u7269\u4F53\u53D8\u5F62\u2014\u2014\u7981\u6B62\u4EFB\u4F55\u5E27\u95F4\u4E0D\u4E00\u81F4\uFF1B",
  "7. \u7981\u6B62\u91CD\u590D\uFF1A\u4E0D\u5F97\u590D\u523B @\u89C6\u98911 \u672B\u5C3E\u5DF2\u5B8C\u6210\u7684\u52A8\u4F5C / \u8868\u60C5 / \u53F0\u8BCD\uFF0C\u76F4\u63A5\u4ECE\u65B0\u52A8\u4F5C\u5F00\u59CB\u3002",
  "**7 \u7C7B\u5168\u8FC7\u624D\u5408\u89C4\uFF0C\u4EFB\u4E00\u7C7B\u8FDD\u53CD\u9700\u91CD\u5199\u3002**"
].join("\n");

// server/engine/fmv/shot-script.ts
var MIN_SHOT_DURATION = 4;
var MAX_SHOT_DURATION = 15;
var OPTIMAL_SHOT_DURATION = 8;
var DURATION_TOLERANCE_SECONDS = 5;
var MIN_PROMPT_LENGTH = 80;
var MAX_PROMPT_LENGTH = 700;
var PHASE3_TASK_HEADLINE = `\u4F60\u662F\u4E13\u4E1A\u7684 Seedance 2 \u5206\u955C\u5BFC\u6F14 AI\u3002\u672C\u6B21\u552F\u4E00\u4EFB\u52A1\uFF1A\u4E3A\u5355\u4E2A\u5267\u60C5\u8282\u70B9\u751F\u6210 Seedance 2 \u53EF\u76F4\u63A5\u6267\u884C\u7684\u7B80\u6D01\u955C\u5934\u5E8F\u5217 Prompt\u3002

\u2705 \u6838\u5FC3\u539F\u5219\uFF1A
- \u50CF\u5199 Seedance \u5DE5\u7A0B\u6307\u4EE4\u4E00\u6837\u5199 Prompt\uFF0C\u4E0D\u662F\u5199\u6587\u5B66\u63CF\u8FF0
- \u4F7F\u7528\u300C\u955C\u59341 / \u955C\u59342 / \u2026\u300D\u8868\u8FBE\u4E8B\u4EF6\u987A\u5E8F\uFF0C\u4E0D\u5199\u7EDD\u5BF9\u79D2\u6570
- \u6240\u6709\u63CF\u8FF0\u5FC5\u987B\u662F\u53EF\u62CD\u6444\u7684\u7269\u7406\u52A8\u4F5C\u548C\u89C6\u89C9\u5143\u7D20
- \u4E0D\u8F93\u51FA JSON \u7ED3\u6784\u5316\u5B57\u6BB5\uFF08\u5982 shotSize / cameraMovement \u7B49\u679A\u4E3E\uFF09\uFF0C\u5168\u90E8\u8F6C\u5316\u4E3A\u81EA\u7136\u8BED\u8A00\u63CF\u8FF0

\u274C \u7EDD\u5BF9\u7981\u6B62\uFF1A
- seedancePrompt \u4E2D\u51FA\u73B0\u4EFB\u4F55\u53F0\u8BCD\u5B57\u9762\uFF08\u65E0\u8BBA\u662F\u5426\u5E26\u5F15\u53F7\uFF09
- \u4F7F\u7528\u300C\u8BF4\uFF1A\u300D\u300C\u95EE\u9053\uFF1A\u300D\u300C\u558A\uFF1A\u300D\u7B49\u8A00\u8BF4\u52A8\u8BCD
- \u51FA\u73B0\u300C\u4E3B\u89D2\u7684\u8868\u60C5\u5F88\u7D27\u5F20\u300D\u8FD9\u7C7B\u62BD\u8C61\u60C5\u7EEA\u63CF\u8FF0\uFF08\u5FC5\u987B\u8F6C\u5316\u4E3A\u7269\u7406\u52A8\u4F5C\uFF09
- \u8F93\u51FA\u4EFB\u4F55 JSON \u7ED3\u6784\u5316\u5B57\u6BB5\uFF08\u5982 shotSize: "\u7279\u5199"\uFF09
- \u51FA\u73B0\u300C0-3s\u300D\u300C3-5\u79D2\u300D\u7B49\u7EDD\u5BF9\u65F6\u95F4\u5207\u7247
- \u628A\u300CA/B/C \u9009\u62E9\u9879\u300D\u300C\u9009\u62E9\u6D6E\u73B0\u300D\u8FD9\u7C7B\u6E38\u620F\u903B\u8F91\u6587\u672C\u5199\u8FDB seedancePrompt

\u3010\u53F0\u8BCD\u8868\u6F14\u56DB\u8981\u7D20\u516C\u5F0F \xB7 \u542B\u53F0\u8BCD\u955C\u5934\u7684\u753B\u9762\u5185\u5BB9\u6BB5\u5FC5\u987B\u9075\u5FAA\u3011
\u573A\u666F\u6C1B\u56F4\uFF08\u5149\u7EBF/\u7A7A\u95F4\u5982\u4F55\u5F71\u54CD\u89D2\u8272\u60C5\u7EEA\u7A7A\u6C14\uFF09
\u2192 \u4EBA\u7269\u5185\u5FC3\u72B6\u6001\uFF08\u75B2\u60EB/\u7D27\u5F20/\u72B9\u8C6B/\u6124\u6012/\u91CA\u7136\uFF09
\u2192 \u53D1\u58F0\u65B9\u5F0F\uFF08\u58F0\u97F3\u5927\u5C0F + \u8BED\u901F\u5FEB\u6162 + \u505C\u987F\u4F4D\u7F6E + \u5C3E\u97F3\u53D8\u5316\uFF09
\u2192 \u53E3\u578B\u7269\u7406\u52A8\u4F5C\uFF08\u4E0D\u5199\u53F0\u8BCD\u6587\u5B57\u672C\u8EAB\uFF0C\u53EA\u5199\u5634\u578B/\u5589\u7ED3/\u4E0B\u988C\u7684\u7269\u7406\u8868\u6F14\uFF09

\u6807\u70B9\u7B26\u53F7 \u2192 \u5634\u578B\u8BED\u6C14\u951A\u5B9A\uFF1A
  \xB7 \u95EE\u53F7\uFF08\uFF1F\uFF09\u2192 \u5C3E\u97F3\u4E0A\u626C\uFF0C\u5634\u578B\u6536\u7A84\u540E\u5FAE\u5F20\uFF0C\u7709\u6BDB\u8F7B\u63D0
  \xB7 \u611F\u53F9\u53F7\uFF08\uFF01\uFF09\u2192 \u52A0\u91CD\u54AC\u5B57\uFF0C\u5634\u578B\u5F20\u5F00\u5E45\u5EA6\u5927\uFF0C\u4E0B\u988C\u7528\u529B
  \xB7 \u7834\u6298\u53F7\uFF08\u2014\u2014\uFF09\u2192 \u62D6\u957F\u97F3/\u8F6C\u6298\uFF0C\u5634\u578B\u4FDD\u6301\u6216\u7A81\u7136\u53D8\u5316\uFF0C\u6C14\u606F\u62C9\u957F
  \xB7 \u7701\u7565\u53F7\uFF08\u2026\u2026\uFF09\u2192 \u8FDF\u7591\u7559\u767D\uFF0C\u5634\u5507\u7F13\u6162\u95ED\u5408\uFF0C\u6C14\u606F\u51CF\u5F31\uFF0C\u76EE\u5149\u6E38\u79FB
  \xB7 \u9017\u53F7\u505C\u987F \u2192 \u8F7B\u54BD\u4E00\u6B21\uFF0C\u5507\u8F7B\u95ED 0.3s`;
function buildSeedanceShotSequenceProtocol(artStylePreset) {
  const isStylized = [
    "anime",
    "anime-cel",
    "anime-painterly",
    "anime-dark",
    "chibi-kawaii",
    "illustration",
    "watercolor",
    "concept-art",
    "comic-strip",
    "storybook",
    "ukiyo-e"
  ].includes(String(artStylePreset ?? ""));
  const styleHint = isStylized ? "\u5982\u4E3A\u52A8\u6F2B/\u63D2\u753B/\u975E\u5199\u5B9E\u9879\u76EE\uFF0C\u5FC5\u987B\u5728\u672B\u53E5\u660E\u786E\u76EE\u6807\u98CE\u683C\uFF0C\u4F8B\u5982\u300C2D \u65E5\u6F2B\u98CE\u683C\u300D\u300C\u56FD\u98CE\u6F2B\u753B\u8D28\u611F\u300D\uFF0C\u907F\u514D\u6F02\u79FB\u6210\u771F\u4EBA\u5199\u5B9E\u3002" : "\u5982\u4E3A\u5199\u5B9E\u9879\u76EE\uFF0C\u4F7F\u7528\u300C\u7535\u5F71\u8D28\u611F\u3001\u8272\u5F69\u81EA\u7136\u3001\u5149\u5F71\u67D4\u548C\u300D\u8FD9\u7C7B\u8F7B\u91CF\u98CE\u683C\u8BCD\uFF0C\u4E0D\u5806\u6444\u5F71\u673A\u578B\u53F7\u6216\u955C\u5934\u54C1\u724C\u3002";
  return `\u3010Seedance 2 V2 \u955C\u5934\u5E8F\u5217\u534F\u8BAE\uFF08\u6BCF\u4E2A shot \u7684 seedancePrompt \u5FC5\u987B\u9075\u5FAA\uFF09\u3011

\u8F93\u51FA\u5F62\u6001\uFF1A
- \u6BCF\u4E2A seedancePrompt \u53EA\u5199 1-4 \u884C\u300C\u955C\u5934N\uFF1A...\u300D\u3002
- \u4F7F\u7528\u300C\u955C\u59341 / \u955C\u59342 / \u2026\u300D\u8868\u8FBE\u4E8B\u4EF6\u987A\u5E8F\uFF1B\u7981\u6B62\u5199\u300C0-3s\u300D\u300C3-5\u79D2\u300D\u7B49\u7EDD\u5BF9\u65F6\u95F4\u5207\u7247\u3002
- \u4E0D\u5199\u300C\u7B2C 1 \u6BB5 / \u6C1B\u56F4\u4E0E\u753B\u8D28 / \u771F\u5B9E\u8D28\u611F / \u58F0\u97F3\u73AF\u5883\u300D\u7B49\u4E94\u6BB5\u5F0F\u6807\u9898\u3002

\u6BCF\u884C\u516C\u5F0F\uFF1A
\`\u955C\u5934N\uFF1A\u5355\u4E00\u8FD0\u955C\u6216\u5207\u6362\u65B9\u5F0F\uFF0C\u666F\u522B/\u89D2\u5EA6\uFF0C\u4E3B\u4F53\u5177\u4F53\u52A8\u4F5C\u4E0E\u8868\u60C5\uFF0C\u4F4D\u7F6E/\u7A7A\u95F4\u53D8\u5316\uFF0C\u53EF\u9009\u58F0\u97F3\u6216\u73AF\u5883\u53CD\u9988\u3002\`

\u5199\u4F5C\u8981\u6C42\uFF1A
1. \u4E3B\u4F53\u6E05\u6670\uFF1A\u4F7F\u7528\u89D2\u8272\u540D\u6216\u7A33\u5B9A\u79F0\u8C13\uFF0C\u4E0D\u7528\u300C\u4ED6/\u5979/\u8FD9\u4E2A\u4EBA\u300D\u7B49\u6A21\u7CCA\u6307\u4EE3\u3002
2. \u52A8\u4F5C\u5177\u4F53\uFF1A\u5199\u624B\u3001\u817F\u3001\u5934\u3001\u80A9\u80CC\u3001\u773C\u795E\u3001\u5634\u578B\u3001\u547C\u5438\u7B49\u8EAB\u4F53\u7EC6\u8282\uFF0C\u8865\u5145\u5E45\u5EA6/\u901F\u5EA6/\u529B\u5EA6\u3002
3. \u60C5\u7EEA\u5916\u5316\uFF1A\u7981\u6B62\u53EA\u5199\u300C\u7D27\u5F20\u3001\u60B2\u4F24\u3001\u6124\u6012\u3001\u5F20\u529B\u4E0A\u626C\u300D\uFF1B\u5FC5\u987B\u6539\u6210\u300C\u6307\u8282\u6536\u7D27\u3001\u5589\u7ED3\u8F7B\u6EDA\u3001\u80A9\u8180\u5FAE\u98A4\u3001\u76EE\u5149\u56DE\u907F\u300D\u3002
4. \u4E00\u955C\u4E00\u8FD0\u955C\uFF1A\u5355\u4E2A\u300C\u955C\u5934N\u300D\u53EA\u80FD\u6307\u5B9A\u4E00\u79CD\u4E3B\u8FD0\u955C\uFF1B\u56FA\u5B9A\u673A\u4F4D / \u63A8\u955C / \u62C9\u955C / \u6A2A\u79FB / \u6447\u955C / \u8DDF\u62CD / \u73AF\u7ED5 / \u5347\u964D\u53EA\u80FD\u62E9\u4E00\u3002
5. \u4F4E\u7F13\u4F18\u5148\uFF1A\u65E0\u660E\u786E\u53C2\u8003\u89C6\u9891\u65F6\uFF0C\u4F18\u5148\u4F4E\u7F13\u3001\u8FDE\u7EED\u3001\u5C0F\u5E45\u52A8\u4F5C\uFF1B\u907F\u514D\u72C2\u5954\u3001\u5927\u8DF3\u3001\u7FFB\u6EDA\u7B49\u9AD8\u7206\u53D1\u52A8\u6001\u3002
6. \u4E92\u52A8\u9694\u79BB\uFF1A\u9009\u62E9\u9879\u3001\u6309\u94AE\u3001\u5206\u652F\u6587\u6848\u3001A/B/C \u65B9\u6848\u53EA\u5C5E\u4E8E\u6E38\u620F\u903B\u8F91\uFF0C\u7981\u6B62\u5199\u5165 seedancePrompt\uFF1B\u53EA\u8868\u73B0\u201C\u9009\u62E9\u538B\u529B\u201D\u5BF9\u5E94\u7684\u53EF\u89C1\u8EAB\u4F53\u53CD\u5E94\u6216\u9053\u5177\u7126\u70B9\u3002
7. \u53F0\u8BCD\u9694\u79BB\uFF1A\u53F0\u8BCD\u539F\u6587\u653E dialogueLine / voiceover \u5B57\u6BB5\uFF1BseedancePrompt \u53EA\u5199\u53E3\u578B\u3001\u505C\u987F\u3001\u547C\u5438\u3001\u4E0B\u988C\u3001\u5589\u7ED3\u7B49\u53EF\u89C6\u5316\u8868\u6F14\u3002
8. \u6536\u675F\u7EA6\u675F\uFF1A\u672B\u5C3E\u53EF\u7528\u4E00\u53E5\u8F7B\u91CF\u7EA6\u675F\uFF0C\u5305\u542B\u9AD8\u6E05\u3001\u7EC6\u8282\u4E30\u5BCC\u3001\u7535\u5F71\u8D28\u611F\u3001\u65E0\u5B57\u5E55\u3001\u65E0\u6C34\u5370\u3001\u65E0 Logo\u3001\u4EBA\u7269\u7A33\u5B9A\u4E0D\u53D8\u5F62\u3002${styleHint}

\u6B63\u4F8B\uFF1A
\u955C\u59341\uFF1A\u56FA\u5B9A\u673A\u4F4D\uFF0C\u4E2D\u666F\uFF0C\u6797\u665A\u5DE6\u624B\u538B\u4F4F\u65B9\u5411\u76D8\u8FB9\u7F18\uFF0C\u6307\u8282\u6162\u6162\u6CDB\u767D\uFF0C\u96E8\u5237\u53CD\u5149\u5212\u8FC7\u5979\u7D27\u7EF7\u7684\u4E0B\u988C\u3002
\u955C\u59342\uFF1A\u7F13\u6162\u63A8\u955C\uFF0C\u8FD1\u666F\uFF0C\u963F\u73CD\u53CC\u5507\u5FAE\u5F20\u53C8\u95ED\u5408\uFF0C\u5589\u7ED3\u8F7B\u6EDA\u4E00\u6B21\uFF0C\u53F3\u624B\u53CD\u590D\u6469\u6332\u5B89\u5168\u5E26\u6263\u3002
\u955C\u59343\uFF1A\u8F7B\u5FAE\u6A2A\u79FB\uFF0C\u5168\u666F\uFF0C\u8F66\u5185\u4E24\u4EBA\u4FDD\u6301\u539F\u6709\u65B9\u4F4D\uFF0C\u8FDC\u5904\u6E2F\u53E3\u96FE\u706F\u5728\u96E8\u5E55\u4E2D\u95EA\u70C1\uFF0C\u5239\u8F66\u58F0\u77ED\u4FC3\u54CD\u8D77\u3002

\u53CD\u4F8B\uFF1A
- \u7EDD\u5BF9\u79D2\u7EA7\u5207\u7247\uFF1A\u6797\u665A\u5F88\u7D27\u5F20\uFF0C\u955C\u5934\u63A8\u62C9\u6447\u79FB\uFF0C\u6C14\u6C1B\u5F20\u529B\u4E0A\u626C\u3002
- \u9009\u62E9\u6D6E\u73B0\uFF1AA\u6551\u4EBA\u53CD\u5835 / B\u593A\u5907\u4EFD\u76D8 / C\u903C\u4F4F\u6237\u4F5C\u8BC1\u3002
- \u89C6\u89C9\u57FA\u8C03\uFF1A\u5806\u53E0\u6444\u5F71\u673A\u578B\u53F7\u3001\u955C\u5934\u54C1\u724C\u548C\u65E7\u534F\u8BAE\u6807\u9898\u3002`;
}
var PHASE3_ANTI_SUBTITLE_RULES = `\u3010\u9632\u5B57\u5E55\u4E09\u94C1\u5F8B \xB7 \u6700\u9AD8\u4F18\u5148\u7EA7 \xB7 \u8FDD\u53CD\u5373\u5931\u8D25\u3011
Seedance 2 \u4F1A\u628A Prompt \u4E2D\u7684\u4EFB\u4F55\u6587\u5B57\u70E7\u5F55\u4E3A\u5C4F\u5E55\u5B57\u5E55\uFF0C\u5FC5\u987B\u4E25\u683C\u9075\u5B88\uFF1A

1. \u274C seedancePrompt \u4E2D\u4E25\u7981\u51FA\u73B0\u4EFB\u4F55\u53F0\u8BCD\u5B57\u9762\uFF08\u4E0D\u8BBA\u662F\u5426\u5E26\u5F15\u53F7\uFF09
   \u2705 \u6B63\u786E\uFF1A\u300C\u6797\u665A\u53E3\u578B\u6025\u4FC3\u5F00\u5408\uFF08\u7EA6 8 \u5B57\u8BED\u6D41\uFF09\uFF0C\u4E0B\u988C\u808C\u5FAE\u6296\uFF0C\u624B\u6307\u6263\u7D27\u65B9\u5411\u76D8\u4E0A\u6CBF\u300D
   \u274C \u9519\u8BEF\uFF1A\u300C\u6797\u665A\u8BF4"\u518D\u665A\u5341\u5206\u949F\u5C31\u6765\u4E0D\u53CA\u4E86"\uFF0C\u63E1\u7D27\u65B9\u5411\u76D8\u300D

2. \u274C \u7981\u6B62\u300C\u8BF4\uFF1A\u300D\u300C\u95EE\u9053\uFF1A\u300D\u300C\u558A\uFF1A\u300D\u7B49"\u8A00\u8BF4\u52A8\u8BCD+\u5192\u53F7"\u53E5\u5F0F
   \u2705 \u6B63\u786E\uFF1A\u300C\u53CC\u5507\u7D27\u62BF\u540E\u7F13\u7F13\u5F20\u5F00\uFF0C\u53D1\u51FA\u58F0\u97F3\u300D
   \u274C \u9519\u8BEF\uFF1A\u300C\u6797\u665A\u95EE\u9053\uFF1A'\u4F60\u662F\u8C01\uFF1F'\u300D

3. \u274C \u7981\u6B62\u300C<\u89D2\u8272\u540D>\uFF1A"\u2026"\u300D\u683C\u5F0F
   \u2705 \u6B63\u786E\uFF1A\u300C\u5BF9\u9762\u7684\u5973\u4EBA\u5634\u5507\u5FAE\u52A8\uFF0C\u76EE\u5149\u9501\u5B9A\u955C\u5934\u300D
   \u274C \u9519\u8BEF\uFF1A\u300C\u6797\u665A\uFF1A'\u6211\u77E5\u9053\u771F\u76F8\u4E86'\u300D

\u3010\u8868\u8FBE"\u5728\u8BF4\u8BDD"\u7684\u5408\u89C4\u5199\u6CD5\u3011
- \u53E3\u578B\u8282\u594F\uFF1A\u300C\u53E3\u578B\u6025\u4FC3\u5F00\u5408\uFF08\u7EA6 X \u5B57\u8BED\u6D41\uFF09\u300D\u300C\u53CC\u5507\u7D27\u62BF\u540E\u7F13\u7F13\u5F20\u5F00\u300D
- \u503E\u542C\u53CD\u5E94\uFF1A\u300C\u7709\u68A2\u4E0A\u6311\u534A\u5EA6\u300D\u300C\u6307\u8282\u5728\u684C\u9762\u65E0\u610F\u8BC6\u6536\u7D27\u300D
- \u975E\u8A00\u8BED\u56DE\u5E94\uFF1A\u300C\u4EE5\u4E00\u6B21\u7F13\u6162\u541E\u54BD\u4F5C\u7B54\u300D\u300C\u4E0B\u988C\u808C\u8F7B\u5FAE\u7D27\u7EF7\u4E09\u6B21\u300D`;
var PHASE3_CROSS_SHOT_CONSISTENCY = `\u3010\u8DE8\u955C\u5934\u4E00\u81F4\u6027\u786C\u7EA6\u675F \xB7 \u8F93\u51FA\u524D\u5FC5\u987B\u81EA\u68C0\u3011
\u540C\u8282\u70B9\u5185\u6240\u6709\u955C\u5934\u5FC5\u987B\u4FDD\u6301\u4EE5\u4E0B 5 \u9879 100% \u4E00\u81F4\uFF0C\u4EFB\u4F55\u4E0D\u4E00\u81F4\u5373\u4E3A\u7A7F\u5E2E\uFF1A

1. \u3010\u5149\u7EBF\u6307\u7EB9\u3011\u5149\u6E90\u65B9\u5411 + \u8272\u6E29 + \u5F3A\u5EA6\u5B8C\u5168\u4E00\u81F4
   \u2705 \u6B63\u786E\uFF1A\u6240\u6709\u955C\u5934\u90FD\u662F\u300C\u5934\u9876\u51B7\u767D\u65E5\u5149\u706F\uFF0C\u6B63\u4E0A\u65B9\u7167\u5C04\uFF0C6500K\u300D
   \u274C \u9519\u8BEF\uFF1A\u524D\u955C\u662F\u6696\u5149\uFF0C\u540E\u955C\u53D8\u6210\u51B7\u5149

2. \u3010\u7A7A\u95F4\u65B9\u4F4D\u3011\u4E3B\u4F53\u4F4D\u7F6E + \u9762\u671D\u65B9\u5411 + \u5DE6\u53F3\u5173\u7CFB\u4E0D\u53D8
   \u2705 \u6B63\u786E\uFF1A\u4E3B\u89D2\u59CB\u7EC8\u5728\u753B\u9762\u5DE6 1/3\uFF0C\u9762\u671D\u53F3\u65B9
   \u274C \u9519\u8BEF\uFF1A\u524D\u955C\u4E3B\u89D2\u5728\u5DE6\u8FB9\uFF0C\u540E\u955C\u7A81\u7136\u8DD1\u5230\u53F3\u8FB9

3. \u3010\u670D\u88C5\u9053\u5177\u3011\u670D\u88C5\u6B3E\u5F0F\u989C\u8272\u3001\u9053\u5177\u4F4D\u7F6E\u72B6\u6001\u4E0D\u53D8
   \u2705 \u6B63\u786E\uFF1A\u4E3B\u89D2\u4E00\u76F4\u7A7F\u7740\u84DD\u8272\u5916\u5957\uFF0C\u5DE6\u624B\u62FF\u7740\u624B\u673A
   \u274C \u9519\u8BEF\uFF1A\u524D\u955C\u5916\u5957\u662F\u84DD\u8272\uFF0C\u540E\u955C\u53D8\u6210\u9ED1\u8272

4. \u3010\u65F6\u95F4\u5929\u6C14\u3011\u65F6\u95F4\u3001\u5929\u6C14\u3001\u5B63\u8282\u4E0D\u53D8\uFF08\u9664\u975E\u660E\u786E\u95EA\u56DE\uFF09
   \u2705 \u6B63\u786E\uFF1A\u6240\u6709\u955C\u5934\u90FD\u662F\u300C\u591C\u665A\uFF0C\u4E0B\u7740\u5C0F\u96E8\u300D
   \u274C \u9519\u8BEF\uFF1A\u524D\u955C\u5728\u4E0B\u96E8\uFF0C\u540E\u955C\u96E8\u505C\u4E86

5. \u3010\u6807\u5FD7\u7269\u56DE\u58F0\u3011\u9996\u955C\u5EFA\u7ACB\u7684\u6838\u5FC3\u6807\u5FD7\u7269\u81F3\u5C11\u5728\u540E\u7EED\u955C\u5934\u590D\u73B0 1 \u6B21`;
var PHASE3_POV_WRITING_RULES = `\u3010\u7B2C\u4E00\u4EBA\u79F0 POV \u955C\u5934\u5E8F\u5217\u5199\u6CD5\u786C\u7EA6\u675F \xB7 \u6240\u6709\u955C\u5934\u5FC5\u987B\u9075\u5FAA\u3011

\u672C\u9879\u76EE\u91C7\u7528\u7B2C\u4E00\u4EBA\u79F0 POV \u89C6\u89D2\uFF08\u6444\u5F71\u673A = \u4E3B\u89D2\u773C\u775B\uFF09\u3002\u751F\u6210\u6BCF\u4E2A seedancePrompt \u65F6\u5FC5\u987B\u9075\u5FAA\u4EE5\u4E0B\u89C4\u5219\uFF1A

\u8FD0\u955C\uFF08POV \u4E13\u7528\uFF09\uFF1A
- \u666F\u522B**\u7981\u6B62\u5199**\u300C\u7279\u5199\u300D\u300C\u8FD1\u666F\u300D\u2014\u2014POV \u89C6\u89D2\u6CA1\u6709"\u62CD\u81EA\u5DF1"\u7684\u6982\u5FF5
- \u666F\u522B\u6539\u5199\u4E3A\u5BF9**\u6240\u770B\u4E8B\u7269**\u7684\u63CF\u8FF0\uFF1A\u300C\u773C\u524D\u4E2D\u666F\u300D\u300C\u89C6\u7EBF\u8303\u56F4\u5185\u8FDC\u666F\u300D\u300C\u4F4E\u5934\u8FD1\u8DDD\u79BB\u300D
- \u8FD0\u955C**\u53EA\u5141\u8BB8**\uFF1A\u81EA\u7136\u5934\u90E8\u8F6C\u52A8 / \u89C6\u7EBF\u8F6C\u79FB / \u524D\u8FDB/\u540E\u9000\u6B65\u4F10\u5E26\u52A8 / \u8F7B\u5FAE\u624B\u6301\u547C\u5438\u6D6E\u52A8
- \u8FD0\u955C**\u7981\u6B62**\uFF1A\u73AF\u7ED5 / \u5F27\u5F62 / \u5347\u964D / \u4FEF\u77B0 / \u4EFB\u4F55\u66B4\u9732\u4E3B\u89D2\u5168\u8C8C\u7684\u673A\u4F4D
- \u6BCF\u955C\u5934**\u5FC5\u987B\u5199**\uFF1A\u300C\u624B\u6301\u62CD\u6444\uFF0C\u5168\u7A0B\u8F7B\u5FAE\u81EA\u7136\u547C\u5438\u6D6E\u52A8\u4E0E\u5934\u90E8\u5FAE\u6446\u300D

\u753B\u9762\u5185\u5BB9\uFF08POV \u4E13\u7528\uFF09\uFF1A
- **\u4E3B\u89D2\u4E0D\u4F5C\u4E3A\u753B\u9762\u4E2D\u88AB\u89C2\u5BDF\u7684\u5BF9\u8C61**\uFF08\u7981\u6B62\u5199\u300C\u4E3B\u89D2\u7AD9\u5728...\u300D\u300C\u4E3B\u89D2\u7684\u8868\u60C5...\u300D\uFF09
- \u6539\u4E3A\u5199**\u4E3B\u89D2\u770B\u5230\u7684\u4E16\u754C**\uFF1A\u300C\u773C\u524D\u51FA\u73B0...\u300D\u300C\u89C6\u7EBF\u4E0B\u79FB\u770B\u5230\u81EA\u5DF1\u7684\u624B...\u300D\u300C\u5BF9\u9762\u7684\u4EBA\u5F00\u53E3\u8BF4...\u300D
- \u4E3B\u89D2\u624B\u90E8\u52A8\u4F5C\u7528\u300C\u624B\u4ECE\u753B\u9762\u4E0B\u65B9\u4F38\u51FA\u300D\u300C\u53F3\u624B\u62AC\u8D77\u89E6\u78B0\u300D\u7B49\u5165\u753B\u5F0F\u63CF\u5199
- \u5176\u4ED6\u89D2\u8272**\u9762\u671D\u955C\u5934\u65B9\u5411**\u8BF4\u8BDD/\u4E92\u52A8\uFF08\u5236\u9020\u5BF9\u7740\u89C2\u4F17\u7684\u6C89\u6D78\u611F\uFF09
- \u60C5\u7EEA\u901A\u8FC7**\u751F\u7406\u53CD\u5E94**\u4F20\u9012\u800C\u975E\u9762\u90E8\u63CF\u5199\uFF08\u5FC3\u8DF3\u52A0\u901F\u2192\u753B\u9762\u8F7B\u5FAE\u6296\u52A8 / \u7D27\u5F20\u2192\u624B\u6307\u98A4\u6296 / \u7729\u6655\u2192\u753B\u9762\u503E\u659C\uFF09

\u58F0\u97F3\uFF08POV \u4E13\u7528\uFF09\uFF1A
- **\u5FC5\u987B\u542B\u4E3B\u89D2\u751F\u7406\u97F3\u6548**\uFF1A\u547C\u5438\u58F0 / \u5FC3\u8DF3 / \u541E\u54BD / \u8863\u6599\u6469\u64E6
- \u5BF9\u8BDD\u7C7B\u8282\u70B9\uFF1A\u5176\u4ED6\u89D2\u8272\u7684\u58F0\u97F3\u4ECE\u300C\u6B63\u524D\u65B9/\u4FA7\u65B9\u300D\u4F20\u6765\uFF08\u7ED9\u7A7A\u95F4\u5B9A\u4F4D\u611F\uFF09

\u2501\u2501\u2501 POV \u7981\u6B62\u4E8B\u9879\uFF08\u6700\u9AD8\u4F18\u5148\u7EA7\uFF09 \u2501\u2501\u2501
- \u7981\u6B62\u5199\u300C\u4E3B\u89D2\u8F6C\u8EAB\u300D\u300C\u4E3B\u89D2\u56DE\u5934\u770B\u300D\u7B49\u4F1A\u66B4\u9732\u4E3B\u89D2\u5168\u8C8C\u7684\u63CF\u5199
- \u7981\u6B62\u5199\u4E3B\u89D2\u7684\u9762\u90E8\u8868\u60C5\uFF08\u6444\u5F71\u673A\u662F\u773C\u775B\uFF0C\u770B\u4E0D\u5230\u81EA\u5DF1\u7684\u8138\uFF09
- \u7981\u6B62\u51FA\u73B0\u4E3B\u89D2\u6B63\u9762/\u4FA7\u9762/\u80CC\u5F71\u7684\u4EFB\u4F55\u63CF\u5199
- \u552F\u4E00\u5141\u8BB8\u7684\u4E3B\u89D2\u8EAB\u4F53\u63CF\u5199\uFF1A\u624B/\u624B\u81C2/\u4F4E\u5934\u53EF\u89C1\u7684\u8EAF\u5E72\u524D\u90E8/\u5F71\u5B50`;
var PHASE3_CHARACTER_INFO_HEADER = "\u3010\u89D2\u8272\u4FE1\u606F\u3011";
var PHASE3_LOCATION_INFO_HEADER = "\u3010\u573A\u666F\u8BE6\u7EC6\u4FE1\u606F\u3011";
var PHASE3_PREV_VISUAL_ANCHORS_HEADER = "\u3010\u524D\u7F6E\u6536\u5C3E\u753B\u9762\u3011\u524D\u4E00\u8282\u70B9\u672B\u5C3E\u89C6\u89C9\u951A\u70B9\uFF0C\u672C\u8282\u70B9\u9996\u955C\u5F00\u573A\u6784\u56FE\u5E94\u4E0E\u4E4B\u5728\u7A7A\u95F4/\u5149\u5F71\u4E0A\u8FDE\u7EED\uFF1A";
var PHASE3_PREV_VISUAL_ANCHORS_FALLBACK = "\uFF08\u6B64\u4E3A\u5F00\u573A\u8282\u70B9\uFF0C\u65E0\u524D\u7F6E\uFF09";
var PHASE3_NEXT_ANCHORS_HEADER = "\u3010\u540E\u7EED\u9996\u5E27\u951A\u70B9\u3011\u672C\u8282\u70B9\u672B\u955C\u5934\u5E94\u4E3A\u4E0B\u6E38\u8282\u70B9\u9996\u5E27\u7559\u51FA\u89C6\u89C9\u63A5\u53E3\uFF1A";
var PHASE3_NEXT_ANCHORS_FALLBACK = "\uFF08\u672C\u8282\u70B9\u4E3A\u7ED3\u5C40\u6216\u65E0\u540E\u7EED\uFF09";
var PHASE3_DIALOGUE_BIBLE_HEADER = "\u3010\u5BF9\u767D\u5723\u7ECF\u3011\uFF08\u53F0\u8BCD\u5206\u914D\u5230 dialogueLine \u5B57\u6BB5\uFF0CseedancePrompt \u4E2D\u53EA\u5199\u53E3\u578B/\u8868\u6F14\u52A8\u4F5C\uFF09\uFF1A";
var PHASE3_SCREENPLAY_SOURCE_HEADER = "\u3010\u539F\u59CB\u5267\u672C\u6BB5\u843D \xB7 \u5206\u955C\u552F\u4E00\u6743\u5A01\u6765\u6E90\u3011";
var PHASE3_SCREENPLAY_FIDELITY_RULES = `\u3010\u5267\u672C\u5FE0\u5B9E\u5EA6\u94C1\u5F8B \xB7 \u6700\u9AD8\u4F18\u5148\u7EA7\u3011
\u672C\u8282\u70B9\u7684\u5206\u955C\u5FC5\u987B 100% \u57FA\u4E8E\u4E0A\u65B9\u3010\u539F\u59CB\u5267\u672C\u6BB5\u843D\u3011\u7684\u5185\u5BB9\u521B\u4F5C\uFF0C\u4E0D\u53EF\u81EA\u7531\u53D1\u6325\uFF1A

1. \u274C \u7981\u6B62\u65B0\u589E\u5267\u672C\u4E2D\u4E0D\u5B58\u5728\u7684\u89D2\u8272\u3001\u52A8\u4F5C\u3001\u53F0\u8BCD\u3001\u9053\u5177\u6216\u4E8B\u4EF6
2. \u274C \u7981\u6B62\u7BE1\u6539\u89D2\u8272\u95F4\u7684\u5BF9\u8BDD\u5185\u5BB9\u6216\u5148\u540E\u987A\u5E8F
3. \u274C \u7981\u6B62\u9057\u6F0F\u5267\u672C\u6BB5\u843D\u4E2D\u7684\u5173\u952E\u52A8\u4F5C\u6807\u8BB0\uFF08\u25B3\uFF09\u3001OS/VO\u3001\u7A7A\u955C\u548C\u53F0\u8BCD
4. \u2705 \u6BCF\u4E2A shot \u7684\u753B\u9762\u5185\u5BB9\u6BB5\u5FC5\u987B\u80FD\u5728\u539F\u59CB\u5267\u672C\u6BB5\u843D\u4E2D\u627E\u5230\u5BF9\u5E94\u7684\u6587\u672C\u951A\u70B9
5. \u2705 dialogueLine \u5B57\u6BB5\u5FC5\u987B\u5B8C\u5168\u5F15\u7528\u5267\u672C\u4E2D\u7684\u53F0\u8BCD\u539F\u6587\uFF08\u4E00\u5B57\u4E0D\u6539\uFF09
6. \u2705 \u53EF\u4EE5\u8865\u5145\u955C\u5934\u8FD0\u52A8\u3001\u5149\u5F71\u7EC6\u8282\u3001\u7269\u7406\u8D28\u611F\u7B49"\u89C6\u89C9\u5BFC\u6F14\u5C42"\u63CF\u5199\uFF0C\u4F46\u53D9\u4E8B\u9AA8\u67B6\u5FC5\u987B\u5FE0\u4E8E\u5267\u672C
7. \u2705 \u5267\u672C\u4E2D\u7684\u821E\u53F0\u52A8\u4F5C\uFF08\u25B3\u5F00\u5934\uFF09\u548C\u3010\u7A7A\u955C\u3011\u662F\u753B\u9762\u5185\u5BB9\u6BB5\u7684\u76F4\u63A5\u7D20\u6750\u6765\u6E90

\u81EA\u68C0\uFF1A\u9010 shot \u68C0\u67E5\uFF0C\u6BCF\u4E2A shot \u7684\u6838\u5FC3\u4E8B\u4EF6\u662F\u5426\u90FD\u6765\u81EA\u3010\u539F\u59CB\u5267\u672C\u6BB5\u843D\u3011\u3002\u5982\u6709\u4EFB\u4F55\u81EA\u7531\u521B\u4F5C\u6210\u5206\uFF0C\u5220\u9664\u5E76\u91CD\u5199\u3002`;
var PHASE3_FINAL_CHECKLIST = `\u3010\u8F93\u51FA\u524D\u5FC5\u987B\u5B8C\u6210\u7684\u81EA\u68C0\u6E05\u5355\u3011
\u2705 \u6240\u6709 seedancePrompt \u90FD\u4E25\u683C\u9075\u5FAA Seedance V2 \u955C\u5934\u5E8F\u5217\u7ED3\u6784
\u2705 seedancePrompt \u4E2D\u6CA1\u6709\u4EFB\u4F55\u53F0\u8BCD\u6587\u5B57\u6216\u8A00\u8BF4\u52A8\u8BCD
\u2705 \u6240\u6709\u60C5\u7EEA\u90FD\u901A\u8FC7\u5177\u4F53\u7269\u7406\u52A8\u4F5C\u8868\u8FBE\uFF08\u65E0"\u5F88\u7D27\u5F20""\u5F88\u5F00\u5FC3"\u7B49\u62BD\u8C61\u63CF\u8FF0\uFF09
\u2705 \u6CA1\u6709 0-3s / 3-5\u79D2 \u7B49\u7EDD\u5BF9\u65F6\u95F4\u5207\u7247
\u2705 \u6CA1\u6709\u9009\u62E9\u6D6E\u73B0\u3001A/B/C \u9009\u9879\u6587\u6848\u6216\u6309\u94AE\u6587\u672C
\u2705 \u6BCF\u4E2A\u955C\u5934\u53EA\u5305\u542B\u4E00\u79CD\u4E3B\u8FD0\u955C
\u2705 \u540C\u8282\u70B9\u5185\u5149\u7EBF\u3001\u670D\u88C5\u3001\u9053\u5177\u3001\u65B9\u4F4D\u5B8C\u5168\u4E00\u81F4\uFF085 \u9879\u4E00\u81F4\u6027\uFF09
\u2705 \u6240\u6709\u955C\u5934\u65F6\u957F\u4E4B\u548C\u7B49\u4E8E\u603B\u65F6\u957F\uFF08\xB1${DURATION_TOLERANCE_SECONDS}s\uFF09
\u2705 \u5355\u955C\u5934\u65F6\u957F\u5728 ${MIN_SHOT_DURATION}-${MAX_SHOT_DURATION}s \u4E4B\u95F4
\u2705 POV \u955C\u5934\u6CA1\u6709\u51FA\u73B0\u4E3B\u89D2\u7684\u9762\u90E8\u6216\u5168\u8EAB
\u2705 \u4E92\u52A8\u8282\u70B9\u672B\u955C\u5934\u7B26\u5408\u9009\u62E9\u63ED\u793A\u89C4\u5219\uFF08\u773C\u795E/\u9053\u5177/\u73AF\u5883\u4E09\u9009\u4E00\uFF09

\u5C11\u4E00\u6761\u90FD\u4E0D\u8981\u8F93\u51FA\uFF0C\u56DE\u53BB\u4FEE\u6539\u76F4\u5230\u5168\u90E8\u6EE1\u8DB3\u3002`;
function buildPhase3OutputSchemaBlock(input) {
  return `\u3010\u8F93\u51FA\u683C\u5F0F \xB7 JSON \u6570\u7EC4\u3011
\u4E3A\u6B64\u8282\u70B9\u751F\u6210 ${input.shotCountRange} \u4E2A\u955C\u5934\uFF0C\u8FD4\u56DE\u4E25\u683C JSON \u6570\u7EC4\u3002\u6BCF\u4E2A\u5143\u7D20\u7ED3\u6784\uFF1A

{
  "shotNumber": 1,
  "durationSeconds": ${OPTIMAL_SHOT_DURATION},
  "seedancePrompt": "\uFF08Seedance V2 \u955C\u5934\u5E8F\u5217\u81EA\u7136\u8BED\u8A00 prompt\uFF0C\u89C1\u4E0A\u65B9\u534F\u8BAE\uFF09",
  "dialogueLine": "\u53F0\u8BCD\u539F\u6587\uFF08\u53EF\u9009\uFF0C\u65E0\u53F0\u8BCD\u65F6\u7701\u7565\u6B64\u5B57\u6BB5\uFF09",
  "voiceover": "\u65C1\u767D\u6587\u672C\uFF08\u53EF\u9009\uFF0C\u65E0\u65C1\u767D\u65F6\u7701\u7565\u6B64\u5B57\u6BB5\uFF09"
}

\u786C\u7EA6\u675F\uFF1A
- \u6240\u6709\u955C\u5934 durationSeconds \u4E4B\u548C\u5FC5\u987B\u7B49\u4E8E\u8282\u70B9\u7684 ${input.durationSeconds}s\uFF08\xB1${DURATION_TOLERANCE_SECONDS}s \u8BEF\u5DEE\uFF09
- \u5355\u955C\u5934\u65F6\u957F ${MIN_SHOT_DURATION}-${MAX_SHOT_DURATION}s\uFF0C\u63A8\u8350 ${OPTIMAL_SHOT_DURATION}s\uFF08Seedance 2 \u5355\u6BB5\u80FD\u529B\u533A\u95F4\uFF09
- seedancePrompt \u5FC5\u987B\u4E25\u683C\u9075\u5FAA Seedance V2 \u955C\u5934\u5E8F\u5217\u7ED3\u6784\uFF0C\u7EAF\u4E2D\u6587
- seedancePrompt \u5B57\u6570 ${MIN_PROMPT_LENGTH}-${MAX_PROMPT_LENGTH} \u5B57\uFF1B\u5B81\u53EF\u77ED\u800C\u5177\u4F53\uFF0C\u4E0D\u8981\u4E94\u6BB5\u5F0F\u957F\u6587
- dialogueLine \u53EA\u653E\u89D2\u8272\u53F0\u8BCD\u539F\u6587\uFF0C\u4E0D\u542B\u8868\u6F14\u63D0\u793A
- \u82E5\u586B\u5199 dialogueLine \u6216 voiceover\uFF0C\u8BE5\u955C\u5934 durationSeconds \u5FC5\u987B\u8DB3\u591F\u8986\u76D6\u5B8C\u6574\u53D1\u58F0\u3001\u6807\u70B9\u505C\u987F\u548C 0.5-1s \u53CD\u5E94\u7559\u767D\uFF1B\u4E0D\u5F97\u8BA9\u89C6\u9891\u5728\u8BDD\u6CA1\u8BF4\u5B8C\u524D\u7ED3\u675F
- \u4EC5\u8FD4\u56DE JSON \u6570\u7EC4\uFF0C\u4E0D\u8981\u8FFD\u52A0\u81EA\u7136\u8BED\u8A00\u8BF4\u660E\u6216 markdown \u4EE3\u7801\u5757`;
}
function buildPhase3ToneLockBlock(tone) {
  if (!tone) return "";
  return `\u3010\u9898\u6750\u9501\u5B9A\u3011\u672C\u9879\u76EE\u9898\u6750\u57FA\u8C03\u662F\u300C${tone}\u300D\uFF0C\u6240\u6709\u955C\u5934\u7684\u89C6\u89C9\u63CF\u8FF0\u3001\u6C1B\u56F4\u4E0E\u753B\u8D28\u6BB5\u5FC5\u987B\u5339\u914D\u300C${tone}\u300D\u9898\u6750\u65B9\u5411\u3002`;
}
function buildPhase3GlobalStyleBlock(globalStyle) {
  return `\u3010\u5168\u5C40\u98CE\u683C\u5173\u952E\u8BCD\u3011${globalStyle}
\uFF08LLM \u987B\u628A\u8FD9\u4E9B\u5173\u952E\u8BCD\u81EA\u7136\u878D\u5165\u6BCF\u4E2A seedancePrompt \u7684\u300C\u6C1B\u56F4\u4E0E\u753B\u8D28\u300D\u6BB5\uFF0C\u4E0D\u8981\u751F\u786C\u5806\u53E0\u3002\uFF09`;
}
function buildPhase3ChapterBlock(ctx) {
  if (!ctx) return "";
  return `\u3010\u7AE0\u8282\u80CC\u666F\u3011
- \u5F53\u524D\u7AE0\u8282\uFF1A\u7B2C ${ctx.chapterNumber} / ${ctx.totalChapters} \u5E55
- \u7AE0\u8282\u620F\u5267\u529F\u80FD\uFF1A${ctx.dramaticFunction}
- \u672C\u7AE0\u8282\u7B80\u62A5\uFF1A${ctx.chapterBrief}
- \u524D\u60C5\u6458\u8981\uFF1A${ctx.priorChaptersDigest || "\uFF08\u6B64\u4E3A\u5F00\u7BC7\u7AE0\u8282\uFF0C\u65E0\u524D\u60C5\uFF09"}`;
}
function buildPhase3NodeInfoBlock(input) {
  return `\u3010\u5F53\u524D\u8282\u70B9\u4FE1\u606F\u3011
- tempId\uFF1A${input.tempId}
- \u6807\u9898\uFF1A${input.title}
- \u5267\u60C5\u6B63\u6587\uFF1A${input.storyText}
- \u65F6\u957F\uFF1A${input.durationSeconds}s
- \u53D9\u4E8B\u89D2\u8272\uFF1A${input.narrativeRole || "\u5E38\u89C4"}
- \u89C6\u9891\u610F\u56FE\uFF1A${input.videoIntent}
- \u9009\u62E9\u94FA\u57AB\uFF1A${input.choiceSetup}
- \u89C6\u89C9\u951A\u70B9\uFF1A${input.visualAnchors}
- \u58F0\u97F3\u7EBF\u7D22\uFF1A${input.soundCues}`;
}
function buildPhase3InteractiveConstraintsBlock(input) {
  if (!input.applyChoiceRevealRule) {
    return "\u3010\u4E92\u52A8\u7EA6\u675F\u3011\u672C\u8282\u70B9\u4E0D\u89E6\u53D1\u9009\u62E9\u63ED\u793A\u955C\u5934\u89C4\u5219\uFF08\u7ED3\u5C40\u6216\u65E0\u5206\u652F\uFF09\u3002";
  }
  return `\u3010\u4E92\u52A8\u5F71\u6E38\u955C\u5934\u786C\u7EA6\u675F\u3011
\u672C\u8282\u70B9\u6709 ${input.choicesLength} \u4E2A\u9009\u62E9\u4E14\u975E\u7ED3\u5C40\uFF1A
1. \u672B\u955C\u5934\u5FC5\u987B\u6EE1\u8DB3\uFF1A\u955C\u5934\u63A8\u8FD1\u4E3B\u89D2\u773C\u775B(\u7279\u5199) / \u753B\u9762\u5B9A\u683C\u5728\u6289\u62E9\u7269\u4EF6 / \u7559 2-3s \u547C\u5438\u7A7A\u95F4
2. \u672B\u955C\u5934\u7684\u753B\u9762\u5185\u5BB9\u6BB5\u5FC5\u987B\u542B\u81F3\u5C11 1 \u6761\u808C\u8089\u52A8\u4F5C\u7EA7\u63CF\u8FF0\uFF08\u7709\u5FC3/\u5634\u89D2/\u6307\u8282/\u5589\u7ED3\uFF09
3. \u672B\u955C\u5934\u300C\u58F0\u97F3\u73AF\u5883\u300D\u6BB5\u5FC3\u8DF3\u6216\u6DF1\u547C\u5438\u4E0A\u626C\uFF0C\u6A21\u62DF\u73A9\u5BB6\u601D\u8003\u538B\u529B`;
}
function getShotCount(durationSeconds) {
  if (durationSeconds <= 0) return 1;
  return Math.max(1, Math.ceil(durationSeconds / MAX_SHOT_DURATION));
}
function deriveShotCountRange(durationSeconds) {
  const estimatedShots = Math.max(4, Math.min(6, Math.round(durationSeconds / OPTIMAL_SHOT_DURATION)));
  return `${Math.max(4, estimatedShots - 1)}-${Math.min(8, estimatedShots + 1)}`;
}
function buildNodeShotScriptPrompt(input) {
  const applyChoiceRevealRule = (input.choicesLength ?? 0) >= 2 && !input.isEnding;
  const isPov = input.perspective === "\u7B2C\u4E00\u4EBA\u79F0";
  const toneLockBlock = buildPhase3ToneLockBlock(input.tone);
  const perspectiveBlock = buildPerspectiveLockBlock(input.perspective, "phase3");
  const globalStyle = (input.styleKeywords ?? []).join("\uFF0C");
  const globalStyleBlock = globalStyle ? buildPhase3GlobalStyleBlock(globalStyle) : "";
  const chapterBlock = buildPhase3ChapterBlock(input.chapterContext);
  const involvedChars = (input.characters ?? []).length > 0 ? (input.characters ?? []).map((c) => {
    const head = c.role ? `${c.name}\uFF08${c.role}\uFF09` : c.name;
    return c.appearance ? `${head}\uFF1A${c.appearance}` : head;
  }).join("\n") : "\u65E0\u89D2\u8272\u4FE1\u606F";
  const locationBlock = input.location?.trim() || "\u672A\u6307\u5B9A\u573A\u666F";
  const nodeInfoBlock = buildPhase3NodeInfoBlock({
    tempId: input.nodeName,
    title: input.nodeName,
    storyText: input.storyText,
    durationSeconds: input.durationSeconds,
    narrativeRole: input.narrativeRole ?? "",
    videoIntent: input.videoIntent ?? "\u65E0",
    choiceSetup: input.choiceSetup ?? "\u65E0",
    visualAnchors: input.visualAnchors?.join("\u3001") ?? "\u65E0",
    soundCues: input.soundCues?.join("\u3001") ?? "\u65E0"
  });
  const screenplaySource = input.screenplay?.trim() ?? "";
  const variableSnapshotBlock = input.variableSnapshot && Object.keys(input.variableSnapshot).length > 0 ? `\u3010\u53D8\u91CF\u72B6\u6001 \u2192 \u8868\u6F14\u57FA\u8C03\u3011
\u5F53\u524D\u53D8\u91CF\uFF1A${Object.entries(input.variableSnapshot).map(([k, v]) => `${k}=${v}`).join("\uFF0C")}
\uFF08\u955C\u5934\u8BED\u8A00\u987B\u4F53\u73B0\u53D8\u91CF\u503C\u5BF9\u89D2\u8272\u72B6\u6001\u7684\u5F71\u54CD\uFF1A\u9AD8\u4FE1\u4EFB\u2192\u80A2\u4F53\u5F00\u653E/\u773C\u795E\u76F4\u89C6\uFF1B\u4F4E\u4FE1\u4EFB\u2192\u62D8\u8C28/\u56DE\u907F\uFF1B\u9AD8\u52C7\u6C14\u2192\u52A8\u4F5C\u679C\u51B3\uFF1B\u4F4E\u52C7\u6C14\u2192\u72B9\u8C6B/\u624B\u6307\u7EDE\u52A8\u3002\uFF09` : "";
  const prevVisualAnchors = (input.prevVisualAnchors ?? []).map((a) => `- ${a}`).join("\n");
  const nextAnchors = (input.nextAnchors ?? []).join("\n");
  const dialogueBibleBlock = input.dialogueBible?.trim() || "(\u672C\u8282\u70B9\u5728 dialogueBible \u4E2D\u65E0\u5BF9\u5E94\u6761\u76EE)";
  const outputSchemaBlock = buildPhase3OutputSchemaBlock({
    shotCountRange: input.shotCountRange ?? deriveShotCountRange(input.durationSeconds),
    durationSeconds: input.durationSeconds
  });
  const interactiveBlock = buildPhase3InteractiveConstraintsBlock({
    applyChoiceRevealRule,
    choicesLength: input.choicesLength ?? 0
  });
  const sections = [
    PHASE3_TASK_HEADLINE,
    buildSeedanceShotSequenceProtocol(input.artStyle),
    perspectiveBlock,
    isPov ? PHASE3_POV_WRITING_RULES : "",
    toneLockBlock,
    globalStyleBlock,
    chapterBlock,
    `${PHASE3_CHARACTER_INFO_HEADER}
${involvedChars}`,
    `${PHASE3_LOCATION_INFO_HEADER}
${locationBlock}`,
    nodeInfoBlock,
    variableSnapshotBlock,
    screenplaySource ? `${PHASE3_SCREENPLAY_SOURCE_HEADER}
${screenplaySource}` : "",
    screenplaySource ? PHASE3_SCREENPLAY_FIDELITY_RULES : "",
    `${PHASE3_PREV_VISUAL_ANCHORS_HEADER}
${prevVisualAnchors || PHASE3_PREV_VISUAL_ANCHORS_FALLBACK}`,
    `${PHASE3_NEXT_ANCHORS_HEADER}
${nextAnchors || PHASE3_NEXT_ANCHORS_FALLBACK}`,
    `${PHASE3_DIALOGUE_BIBLE_HEADER}
${dialogueBibleBlock}`,
    PHASE3_ANTI_SUBTITLE_RULES,
    PHASE3_CROSS_SHOT_CONSISTENCY,
    interactiveBlock,
    outputSchemaBlock,
    PHASE3_FINAL_CHECKLIST
  ];
  return sections.filter(Boolean).join("\n\n");
}

// server/engine/fmv/shot-image.ts
var VARIANT_HEADERS = {
  choice_pressure_frame: "\u7535\u5F71\u611F\u6289\u62E9\u538B\u529B\u5E27\u9759\u7167\uFF08\u9009\u62E9\u754C\u9762\u6D6E\u73B0\u77AC\u95F4\uFF09\u3002\u6838\u5FC3\u8981\u6C42\uFF1A\u5B9A\u683C\u5728\u547C\u5438\u505C\u987F\u7684\u5239\u90A3\uFF0C\u8425\u9020\u5F3A\u70C8\u7684\u51B3\u7B56\u5F20\u529B\uFF0C\u53F3\u4FA7\u9884\u7559 1/3 \u8D1F\u7A7A\u95F4\u7ED9\u9009\u9879 UI\u3002",
  video_first_frame: "\u7535\u5F71\u611F\u9996\u5E27\u9759\u7167\uFF08\u89C6\u9891\u751F\u6210\u89C6\u89C9\u951A\u70B9\uFF09\u3002\u6838\u5FC3\u8981\u6C42\uFF1A\u753B\u9762\u7A33\u5B9A\u3001\u6784\u56FE\u5B8C\u6574\u3001\u5149\u5F71\u51C6\u786E\uFF0C\u80FD\u591F\u4F5C\u4E3A\u89C6\u9891\u751F\u6210\u7684\u7B2C\u4E00\u5E27\u65E0\u7F1D\u5EF6\u7EED\u3002"
};
function buildNodeSummaryLine(title, trimmedBeat) {
  return `\u8282\u70B9\uFF1A${title}\u3002\u5267\u60C5\u8282\u62CD\uFF1A${trimmedBeat}\u3002`;
}
function buildPovLine(characterName) {
  return `\u6444\u50CF\u673A\u89C6\u89D2\uFF08POV\uFF09\uFF1A\u5B8C\u5168\u6A21\u62DF${characterName}\u7684\u773C\u775B\u6240\u89C1\u3002\u2705 \u53EF\u51FA\u73B0\uFF1A\u624B\u90E8\u3001\u524D\u81C2\u3001\u4F4E\u5934\u53EF\u89C1\u7684\u8EAF\u5E72\u524D\u90E8\u3001\u5F71\u5B50\u3002\u274C \u7EDD\u5BF9\u7981\u6B62\uFF1A${characterName}\u7684\u9762\u90E8\u3001\u5168\u8EAB\u3001\u80CC\u5F71\u3001\u4EFB\u4F55\u80FD\u770B\u5230\u5B8C\u6574\u8EAB\u4F53\u7684\u89D2\u5EA6\u3002\u753B\u9762\u4E3B\u4F53\u662F${characterName}\u6240\u89C2\u5BDF\u5230\u7684\u573A\u666F\u548C\u5176\u4ED6\u89D2\u8272\uFF0C\u6240\u6709\u4E92\u52A8\u5BF9\u8C61\u90FD\u9762\u5411\u955C\u5934\u65B9\u5411\u3002`;
}
var VISUAL_ANCHORS_LABEL = "\u89C6\u89C9\u951A\u70B9";
var VISUAL_ANCHORS_SEPARATOR = "\uFF0C";
var ACTION_VISUALIZATION_PROTOCOL = [
  "\u3010\u52A8\u4F5C\u89C6\u89C9\u5316\u3011",
  "\u52A8\u4F5C\u5199\u5177\u4F53\u8EAB\u4F53\u90E8\u4F4D\u3001\u901F\u5EA6\u548C\u529B\u5EA6\uFF1B\u60C5\u7EEA\u8F6C\u6210\u624B\u3001\u80A9\u3001\u773C\u795E\u3001\u8DDD\u79BB\u3001\u9053\u5177\u72B6\u6001\uFF1B\u753B\u9762\u6355\u6349\u52A8\u6001\u5173\u952E\u5E27\uFF0C\u7981\u6B62\u9759\u6001\u6446\u62CD\u3002"
].join("\n");
var DIALOGUE_VISUALIZATION_PROTOCOL = [
  "\u3010\u53F0\u8BCD\u89C6\u89C9\u5316\u3011",
  "\u7981\u6B62\u753B\u9762\u6587\u5B57\u548C\u5BF9\u8BDD\u6C14\u6CE1\uFF1B\u53F0\u8BCD\u53EA\u901A\u8FC7\u5634\u578B\u5E45\u5EA6\u3001\u4E0B\u988C\u3001\u773C\u795E\u3001\u8EAB\u4F53\u524D\u503E/\u540E\u64A4\u548C\u505C\u987F\u8868\u73B0\uFF1B\u975E\u8BF4\u8BDD\u8005\u5634\u5507\u81EA\u7136\u95ED\u5408\u3002"
].join("\n");
var SHOT_IMAGE_QUALITY_CHECKLIST = [
  "\u3010\u955C\u5934\u56FE\u81EA\u68C0\u3011",
  "\u5355\u5E45\u5B8C\u6574\u753B\u9762\uFF1B\u89D2\u8272/\u573A\u666F/\u9053\u5177\u627F\u63A5\u53C2\u8003\u56FE\uFF1B\u52A8\u4F5C\u548C\u53F0\u8BCD\u53EF\u88AB\u770B\u89C1\uFF1B\u955C\u5934\u8BED\u8A00\u81F3\u5C11\u4F53\u73B0\u7126\u70B9\u3001\u666F\u522B\u3001\u89D2\u5EA6\u3001\u6784\u56FE\u3001\u5BF9\u7126\u6216\u5E03\u5149\u4E2D\u7684 4 \u9879\uFF1B\u65E0\u6587\u5B57/UI/\u6C34\u5370\uFF1B\u65E0\u7578\u5F62\u4EBA\u4F53\u3002"
].join("\n");
var FORBIDDEN_LINE = [
  "\u3010\u7981\u6B62\u3011",
  "\u65E0\u5B57\u5E55\u3001\u65E0\u8BF4\u660E\u6587\u5B57\u3001\u65E0 Logo\u3001\u65E0\u6C34\u5370\u3001\u65E0 UI\uFF1B\u4E0D\u5F97\u6539\u53D8\u53C2\u8003\u56FE\u4E2D\u7684\u8EAB\u4EFD\u3001\u670D\u88C5\u3001\u573A\u666F\u7ED3\u6784\u3001\u5149\u6E90\u65B9\u5411\u548C\u9053\u5177\u6750\u8D28\uFF1B\u4E0D\u5F97\u51FA\u73B0\u4EBA\u4F53\u7578\u5F62\u6216\u4F4E\u8D28\u6A21\u7CCA\u3002"
].join("\n");
var FRAMING_DESCRIPTIONS = {
  wide: "Wide establishing shot. The camera is far from the subject, showing the full environment and spatial relationships.",
  medium: "Medium shot. The camera frames the subject from roughly waist-up, keeping context visible but with the subject dominant.",
  close: "Close-up. The camera tightly frames the subject, with strong emphasis on facial expression or the single key object.",
  insert: "Insert shot. Extreme close-up on a small but significant detail (a prop, a hand, a fragment of text). Background is minimized.",
  ots: "Over-the-shoulder shot. Framed from behind one character\u2019s shoulder, looking toward another subject, keeping both in the frame.",
  pov: "Point-of-view shot. The camera takes the subject\u2019s eyes as its position; what appears is what the subject would see."
};
function trimTrailingStop(s) {
  return s.replace(/[。.\s]+$/, "");
}
function buildShotImagePrompt(input) {
  const variant = input.variant ?? "video_first_frame";
  const parts = [];
  parts.push(VARIANT_HEADERS[variant]);
  parts.push(buildNodeSummaryLine(input.nodeName, trimTrailingStop(input.beat)));
  if (variant === "choice_pressure_frame" && input.choiceRevealMoment?.trim()) {
    parts.push(`\u753B\u9762\u610F\u56FE\uFF08\u6289\u62E9\u6D6E\u73B0\u77AC\u95F4\u4E09\u5408\u4E00\uFF09\uFF1A${trimTrailingStop(input.choiceRevealMoment.trim())}\u3002`);
  }
  if (input.perspective === "\u7B2C\u4E00\u4EBA\u79F0") {
    const povName = input.characters?.[0]?.name;
    if (povName) parts.push(buildPovLine(povName));
  }
  if (input.uiStylePrompt?.trim()) parts.push(`Visual style: ${input.uiStylePrompt.trim()}.`);
  if (input.location?.trim()) {
    parts.push(
      `Location: ${input.location.trim()}. Match the lighting, spatial orientation, and mood of the provided reference image of this location.`
    );
  }
  if (input.characters?.length) {
    const anchors = input.characters.map((c) => c.appearance?.trim() ? `${c.name} (${c.appearance.trim()})` : c.name).join("; ");
    parts.push(
      `Characters present (visual anchors up-front): ${anchors}. Keep each character consistent with their provided turnaround reference \u2014 face, wardrobe, proportions, distinctive accessories.`
    );
  }
  const shotHeader = input.shotIndex !== void 0 && input.shotTotal !== void 0 ? `Shot ${input.shotIndex + 1} of ${input.shotTotal}.` : "Current shot.";
  parts.push(shotHeader);
  if (input.framing) parts.push(FRAMING_DESCRIPTIONS[input.framing]);
  if (input.cameraHint?.trim()) parts.push(`Camera direction: ${input.cameraHint.trim()}.`);
  if (input.beat.trim()) parts.push(`This shot shows: ${input.beat.trim()}.`);
  const audio = input.soundCues?.filter(Boolean).join("\uFF0C");
  if (audio) {
    parts.push(
      `Audio cues to externalize visually (AI cannot render sound \u2014 translate to visible physical evidence): ${audio}. For each sonic element, render a matching physical cue \u2014 e.g. raindrops crown-splashing on metal, dust floating in a beam of light, breath condensing into white mist, ripples on a puddle.`
    );
  }
  const dialogueText = input.dialogueLines?.filter(Boolean).join(" / ");
  if (dialogueText || input.subtext?.trim() || input.performance?.trim()) {
    const perfBits = [];
    if (dialogueText) {
      perfBits.push(
        `Character speaks (do NOT render text/subtitles in the image \u2014 only show the body language of speaking): "${dialogueText}"`
      );
    }
    if (input.performance?.trim()) perfBits.push(`Performance direction: ${input.performance.trim()}`);
    if (input.subtext?.trim())
      perfBits.push(`Subtext to externalize through micro-expression and posture: ${input.subtext.trim()}`);
    parts.push(
      `Performance & subtext: ${perfBits.join(" \xB7 ")}. Translate emotion into tensed jaw, whitened knuckles, reddened eye rims, shoulder posture, not into written words.`
    );
  }
  parts.push(ACTION_VISUALIZATION_PROTOCOL);
  if (input.visualAnchors?.length) {
    parts.push(`${VISUAL_ANCHORS_LABEL}\uFF1A${input.visualAnchors.join(VISUAL_ANCHORS_SEPARATOR)}\u3002`);
  }
  parts.push(DIALOGUE_VISUALIZATION_PROTOCOL);
  if (input.transitionHint?.trim()) {
    parts.push(
      `Transition to next shot: ${input.transitionHint.trim()}. Compose the end of this frame so it flows naturally into that transition.`
    );
  }
  parts.push(
    "Cinematic widescreen composition, 2.39:1 anamorphic letterbox aesthetic, film grain texture, high detail, clean frame."
  );
  parts.push(SHOT_IMAGE_QUALITY_CHECKLIST);
  parts.push(FORBIDDEN_LINE);
  return parts.filter(Boolean).join("\n");
}

// server/engine/fmv/shot-grid-templates.ts
var GRID_PANEL_COUNT = 6;
var LAYOUT_INSTRUCTION = [
  "LAYOUT CONTRACT: 16:9 storyboard table with EXACTLY 6 PANELS TOTAL.",
  "Use exactly 2 rows and 3 columns: row 1 has \u9762\u677F1-3, row 2 has \u9762\u677F4-6.",
  "Stop the storyboard after \u9762\u677F6. The final panel must be the strongest climax or ending freeze-frame.",
  "Under EACH panel, render one short Chinese story caption line describing that panel's plot beat.",
  "Each panel is a complete rough previsualization sketch with clear borders and no overlapping elements between panels."
].join(" ");
var PANEL5_ANCHOR_PREFIX = " \u8282\u70B9\u7EA7\u6444\u5F71\u951A\u70B9\uFF1A";
var PANEL5_ANCHOR_FIELD_LABELS = {
  angle: "\u6444\u5F71\u89D2\u5EA6",
  composition: "\u6784\u56FE",
  depthOfField: "\u666F\u6DF1"
};
function buildPanelNarrativeProtocol(panel5CameraAnchor) {
  return [
    "\u9762\u677F1\uFF5C\u5EFA\u7ACB\u73AF\u5883\uFF5C\u8FDC\u666F / \u5E7F\u89D2\uFF5C\u89D2\u8272\u4E0E\u573A\u666F\u5173\u7CFB\u9996\u6B21\u51FA\u73B0\uFF1B\u7528\u7EFF\u8272\u6784\u56FE\u6807\u8BB0\u4E3B\u4F53\u4F4D\u7F6E\uFF0C\u7528\u6A59\u8272\u6807\u8BB0\u4E3B\u5149\u65B9\u5411\uFF1B\u9762\u677F\u4E0B\u65B9\u5199\u4E00\u884C\u4E2D\u6587\u6545\u4E8B\u60C5\u8282\u3002",
    "\u9762\u677F2\uFF5C\u884C\u52A8\u89E6\u53D1\uFF5C\u4E2D\u666F / \u8F7B\u5FAE\u8DDF\u62CD\uFF5C\u89D2\u8272\u8FDB\u5165\u52A8\u4F5C\u8282\u62CD\uFF0C\u76EE\u6807\u6216\u538B\u529B\u6E90\u88AB\u770B\u89C1\uFF1B\u7EA2\u8272\u7BAD\u5934\u6807\u51FA\u8EAB\u4F53\u8FD0\u52A8\u65B9\u5411\uFF1B\u9762\u677F\u4E0B\u65B9\u5199\u4E00\u884C\u4E2D\u6587\u6545\u4E8B\u60C5\u8282\u3002",
    "\u9762\u677F3\uFF5C\u5173\u952E\u53CD\u5E94\uFF5C\u8FD1\u666F / \u624B\u6301\u63A8\u8FD1\uFF5C\u624B\u3001\u773C\u775B\u3001\u9053\u5177\u6216\u538B\u529B\u6E90\u627F\u62C5\u4FE1\u606F\uFF0C\u89D2\u8272\u91CD\u5FC3\u548C\u89C6\u7EBF\u65B9\u5411\u6539\u53D8\uFF1B\u84DD\u8272\u7BAD\u5934\u6807\u51FA\u6444\u5F71\u673A\u63A8\u8FD1\u3002\u9762\u677F\u4E0B\u65B9\u5199\u4E00\u884C\u4E2D\u6587\u6545\u4E8B\u60C5\u8282\u3002",
    `\u9762\u677F4\uFF5C\u51B2\u7A81\u5347\u7EA7\uFF5C\u4E2D\u8FD1\u666F / \u659C\u89D2\u6216\u5C0F\u5E45\u73AF\u7ED5\uFF5C\u4EBA\u7269\u5173\u7CFB\u3001\u7A7A\u95F4\u538B\u529B\u6216\u9053\u5177\u72B6\u6001\u53D1\u751F\u53CD\u8F6C\uFF1B\u7528\u7D2B\u8272\u6807\u8BB0\u6CE8\u660E\u60C5\u7EEA\u3001\u58F0\u97F3\u6216\u53D9\u4E8B\u5F3A\u8C03\u3002${panel5CameraAnchor} \u9762\u677F\u4E0B\u65B9\u5199\u4E00\u884C\u4E2D\u6587\u6545\u4E8B\u60C5\u8282\u3002`,
    "\u9762\u677F5\uFF5C\u9AD8\u6F6E\u52A8\u4F5C\uFF5C\u5927\u52A8\u4F5C\u6784\u56FE / \u5FEB\u901F\u8DDF\u968F\uFF5C\u7EA2\u8272\u8EAB\u4F53\u7BAD\u5934\u548C\u84DD\u8272\u6444\u5F71\u673A\u7BAD\u5934\u540C\u65F6\u51FA\u73B0\uFF0C\u8868\u73B0\u6700\u5F3A\u52A8\u4F5C\u63A8\u8FDB\uFF1B\u9762\u677F\u4E0B\u65B9\u5199\u4E00\u884C\u4E2D\u6587\u6545\u4E8B\u60C5\u8282\u3002",
    "\u9762\u677F6\uFF5C\u540E\u679C\u5B9A\u683C\uFF5C\u4E2D\u8FDC\u666F\u6216\u5F3A\u6784\u56FE\u5B9A\u683C\uFF5C\u5C55\u793A\u52A8\u4F5C\u7ED3\u679C\u3001\u7A7A\u95F4\u53CD\u9988\u548C\u53EF\u63A5\u7EED\u672B\u5E27\uFF0C\u5F62\u6210\u6700\u5F3A\u89C6\u89C9\u51B2\u51FB\u548C\u60C5\u7EEA\u6536\u675F\uFF1B\u9762\u677F\u4E0B\u65B9\u5199\u4E00\u884C\u4E2D\u6587\u6545\u4E8B\u60C5\u8282\u3002"
  ];
}
var CAMERA_PROGRESSION_BLOCK = [
  "6 \u9762\u677F\u955C\u5934\u63A8\u8FDB\u89C4\u5219\uFF1A",
  "1. \u628A\u5267\u60C5\u62C6\u6210 6 \u4E2A\u8FDE\u7EED\u63A8\u8FDB\u7684\u5173\u952E\u955C\u5934\uFF0C\u800C\u4E0D\u662F 6 \u5F20\u5B64\u7ACB\u9759\u6001\u56FE\u3002",
  "2. \u6BCF\u4E2A\u9762\u677F\u5FC5\u987B\u5305\u542B\u53EF\u89C1\u52A8\u4F5C\u3001\u72B6\u6001\u53D8\u5316\u3001\u955C\u5934\u63A8\u8FDB\u6216\u60C5\u7EEA\u8282\u594F\u53D8\u5316\u3002",
  "3. \u4F7F\u7528\u7535\u5F71\u611F\u6444\u5F71\uFF1A\u624B\u6301\u611F\u3001\u5FEB\u901F\u5E73\u79FB\u3001\u63A8\u8FD1\u3001\u540E\u62C9\u3001\u73AF\u7ED5\u8FD0\u52A8\u3001\u4FEF\u89C6\u3001\u4F4E\u89D2\u5EA6\u3001\u7279\u5199\u3001\u957F\u7126\u538B\u7F29\u5747\u53EF\u6309\u5267\u60C5\u9700\u8981\u5206\u914D\u3002",
  "4. \u73AF\u5883\u4FDD\u6301\u7B80\u6D01\uFF0C\u53EA\u4FDD\u7559\u5BF9\u5267\u60C5\u6709\u5E2E\u52A9\u7684\u5173\u952E\u573A\u666F\u5143\u7D20\uFF1B\u91CD\u70B9\u7A81\u51FA\u4EBA\u7269\u3001\u52A8\u4F5C\u3001\u7A7A\u95F4\u5173\u7CFB\u3001\u5149\u7EBF\u65B9\u5411\u548C\u6C1B\u56F4\u3002",
  "5. \u6700\u540E\u4E00\u683C\u5FC5\u987B\u662F\u9AD8\u6F6E\u6216\u7ED3\u5C3E\u5B9A\u683C\uFF0C\u5F62\u6210\u6700\u5F3A\u89C6\u89C9\u51B2\u51FB\u548C\u60C5\u7EEA\u6536\u675F\u3002",
  "6. \u6BCF\u683C\u4E0B\u65B9\u5FC5\u987B\u6709\u4E00\u884C\u7B80\u77ED\u4E2D\u6587\u6545\u4E8B\u60C5\u8282\uFF0C\u8BF4\u660E\u8FD9\u4E00\u683C\u53D1\u751F\u4E86\u4EC0\u4E48\uFF1B\u4E0D\u662F\u5BF9\u767D\u5B57\u5E55\uFF0C\u4E5F\u4E0D\u662F UI\u3002"
].join("\n");
var LABEL_INSTRUCTION_WITH_LABELS = [
  "\u6545\u4E8B\u677F\u6807\u6CE8\u5951\u7EA6\uFF1A\u5728\u6BCF\u4E2A\u9762\u677F\u5185\u6E32\u67D3\u5C0F\u53F7\u9ED1\u8272\u9762\u677F\u5E8F\u53F7 1-6 \u548C\u7B80\u77ED\u4E2D\u6587\u955C\u5934\u7B14\u8BB0\uFF1B\u5728\u6BCF\u4E2A\u9762\u677F\u4E0B\u65B9\u6E32\u67D3\u4E00\u884C\u66F4\u5B8C\u6574\u7684\u4E2D\u6587\u6545\u4E8B\u60C5\u8282\u3002",
  "\u4F7F\u7528\u89C4\u5B9A\u7684\u5F69\u8272\u6807\u6CE8\u7CFB\u7EDF\uFF1A\u7EA2\u8272\u7BAD\u5934=\u8EAB\u4F53\u8FD0\u52A8\u65B9\u5411\uFF0C\u84DD\u8272\u7BAD\u5934=\u6444\u5F71\u673A\u8FD0\u52A8\uFF0C\u7EFF\u8272\u6807\u8BB0=\u6784\u56FE/\u53D6\u666F\u7B14\u8BB0\uFF0C\u6A59\u8272\u6807\u8BB0=\u4E3B\u5149\u65B9\u5411\uFF0C\u7D2B\u8272\u6807\u8BB0=\u60C5\u7EEA/\u58F0\u97F3/\u53D9\u4E8B\u5F3A\u8C03\uFF0C\u9ED1\u8272\u6587\u5B57=\u9762\u677F\u5E8F\u53F7\u3001\u955C\u5934\u7B14\u8BB0\u548C\u4E0B\u65B9\u6545\u4E8B\u60C5\u8282\u3002",
  "\u6807\u6CE8\u6587\u5B57\u4E00\u5F8B\u4F7F\u7528\u4E2D\u6587\u3002\u5141\u8BB8\u6BCF\u683C\u4E0B\u65B9\u4E00\u884C\u6545\u4E8B\u60C5\u8282\uFF1B\u7981\u6B62\u65F6\u95F4\u6233\u3001\u5BF9\u767D\u5B57\u5E55\u3001\u5BF9\u8BDD\u6C14\u6CE1\u3001UI \u5143\u7D20\u3001\u6C34\u5370\u3001Logo\u3001\u88C5\u9970\u6027\u6807\u9898\u680F\u3002"
].join(" ");
var LABEL_INSTRUCTION_WITHOUT_LABELS = [
  "\u4EC5\u4F7F\u7528\u6700\u5C11\u91CF\u6545\u4E8B\u677F\u6807\u6CE8\uFF1A\u5C0F\u53F7\u9ED1\u8272\u9762\u677F\u5E8F\u53F7 1-6\u3001\u89C4\u5B9A\u7684\u5F69\u8272\u7BAD\u5934/\u6807\u8BB0\uFF0C\u4EE5\u53CA\u6BCF\u683C\u4E0B\u65B9\u4E00\u884C\u4E2D\u6587\u6545\u4E8B\u60C5\u8282\u3002",
  "\u4E0D\u6E32\u67D3\u5BF9\u767D\u5B57\u5E55\u3001\u5BF9\u8BDD\u6C14\u6CE1\u3001\u65F6\u95F4\u6233\u3001UI \u5143\u7D20\u3001\u6C34\u5370\u3001Logo \u6216\u591A\u884C\u957F\u6BB5\u6587\u5B57\u3002",
  "\u4FDD\u6301\u9ED1\u8272\u6587\u5B57\u7CBE\u77ED\uFF0C\u4E00\u5F8B\u4F7F\u7528\u4E2D\u6587\uFF1B\u4E0B\u65B9\u6545\u4E8B\u60C5\u8282\u5FC5\u987B\u53EF\u8BFB\u4F46\u63A7\u5236\u5728\u4E00\u884C\u3002"
].join(" ");
var IMAGE_INTEGRITY_GUARDRAIL_LINES = {
  prefix: [
    "\u753B\u9762\u5B8C\u6574\u6027\u786C\u8D1F\u5411\uFF1A",
    "\u4E0D\u5141\u8BB8\u51FA\u73B0\uFF1A\u7834\u788E\u56FE\u7247\u3001\u574D\u584C\u9762\u677F\u3001\u91CD\u590D\u9762\u677F\u3001\u53D8\u5F62\u6545\u4E8B\u677F\u51E0\u4F55\u3001\u626D\u66F2\u5E27\u8FB9\u6846\u3001\u7F3A\u5931\u9762\u677F\u3002",
    "\u4E0D\u5141\u8BB8\u51FA\u73B0\uFF1A\u9A6C\u8D5B\u514B\u3001\u50CF\u7D20\u5316\u3001\u6545\u969C\u65B9\u5757\u3001\u635F\u574F\u50CF\u7D20\u3001\u538B\u7F29\u4F2A\u5F71\u3001\u8272\u5E26\u3001\u6495\u88C2\u3001\u6D82\u62B9\u3001\u6A21\u7CCA\u6216\u4F4E\u5206\u8FA8\u7387\u7455\u75B5\u3002",
    "\u4E0D\u5141\u8BB8\u51FA\u73B0\uFF1A\u7578\u5F62\u9762\u90E8\u3001\u9762\u90E8\u4E92\u6362\u3001\u91CD\u590D\u9762\u90E8\u3001\u878D\u5316\u76AE\u80A4\u3001\u626D\u66F2\u624B\u90E8\u3001\u591A\u4F59\u624B\u6307\u3001\u65AD\u80A2\u3001\u53D8\u5F02\u89E3\u5256\u6216\u4E0D\u4E00\u81F4\u7684\u89D2\u8272\u8EAB\u4EFD\u3002",
    "\u4E0D\u5141\u8BB8\u51FA\u73B0\uFF1A\u9759\u6001\u6446\u62CD\u6216\u50F5\u786C\u8EAB\u4F53\u8BED\u8A00\u2014\u2014\u6BCF\u4E2A\u9762\u677F\u5FC5\u987B\u5C55\u793A\u52A8\u4F5C\u3001\u72B6\u6001\u53D8\u5316\u3001\u955C\u5934\u63A8\u8FDB\u6216\u53EF\u8BFB\u7684\u5F20\u529B\u3002"
  ],
  withLabels: "\u9664\u89C4\u5B9A\u7684 1-6 \u9762\u677F\u5E8F\u53F7\u3001\u7B80\u77ED\u4E2D\u6587\u955C\u5934\u7B14\u8BB0\u548C\u6BCF\u683C\u4E0B\u65B9\u4E00\u884C\u6545\u4E8B\u60C5\u8282\u5916\uFF0C\u4E0D\u5F97\u51FA\u73B0\u5176\u4ED6\u53EF\u8BFB\u6587\u5B57\uFF1B\u7981\u6B62\u5B57\u5E55\u3001\u5BF9\u8BDD\u6C14\u6CE1\u3001UI \u53E0\u5C42\u3001\u6C34\u5370\u6216 Logo\u3002",
  withoutLabels: "\u4E0D\u5141\u8BB8\u51FA\u73B0\uFF1A\u591A\u884C\u957F\u6BB5\u6587\u5B57\u3001\u5B57\u5E55\u3001\u5BF9\u8BDD\u6C14\u6CE1\u3001UI \u53E0\u5C42\u3001\u6C34\u5370\u3001Logo\uFF1B\u6BCF\u683C\u4E0B\u65B9\u4E00\u884C\u4E2D\u6587\u6545\u4E8B\u60C5\u8282\u9664\u5916\u3002"
};
function buildHeaderLine(panelCount) {
  return `BLACK-AND-WHITE LINE ART CINEMATIC PREVIS STORYBOARD. Generate exactly ${panelCount} panels in a clean 16:9 storyboard table, arranged as 2 rows x 3 columns. Under each panel, add one short Chinese story caption line describing the plot beat. The actual storyboard drawing MUST be monochrome only: black pencil / black ink / graphite hatching on white paper, rough loose sketch lines, minimal detail, fast gesture energy, simple anatomy construction, strong readable silhouettes, lightweight and unfinished like early film previsualization. No color fill, no colored clothing, no colored background, no blue wash, no grey wash, no watercolor wash, no painterly rendering.`;
}
function buildReferenceCountLine(referenceCount) {
  return `Reference image count: ${referenceCount}. If references are attached, treat image 1 as the main character reference and image 2 as the scene reference when available. Use references as continuity anchors for character identity, wardrobe silhouette, props, scene architecture, and lighting direction \u2014 NOT as color/style references. Convert all reference colors into black-white line art and grey value contrast.`;
}
var UPSTREAM_REFERENCE_HEADER = "\u4E0A\u6E38\u53C2\u8003\u56FE\u6587\u672C\u951A\u70B9\uFF1A";
var STORYBOARD_CONTENT_ANCHOR_HEADER = "\u3010\u5267\u60C5\u63CF\u8FF0 \xB7 \u5FC5\u987B\u62C6\u89E3\u4E3A 6 \u4E2A\u8FDE\u7EED\u63A8\u8FDB\u7684\u5173\u952E\u955C\u5934\u3011";
var STORYBOARD_CONTENT_ANCHOR_FOOTER = "\u4EE5\u4E0A\u951A\u70B9\u662F\u672C\u6545\u4E8B\u677F\u7684\u5177\u4F53\u5267\u60C5\u8D1F\u8F7D\uFF1A\u628A\u52A8\u4F5C\u3001\u53F0\u8BCD\u3001\u8868\u6F14\u8282\u62CD\u548C\u955C\u5934\u63A8\u8FDB\u5206\u914D\u5230 6 \u4E2A\u9762\u677F\uFF1B\u6BCF\u683C\u90FD\u8981\u6709\u72B6\u6001\u53D8\u5316\uFF0C\u6BCF\u683C\u4E0B\u65B9\u5FC5\u987B\u6709\u4E00\u884C\u4E2D\u6587\u6545\u4E8B\u60C5\u8282\uFF0C\u6700\u540E\u4E00\u683C\u5FC5\u987B\u6210\u4E3A\u9AD8\u6F6E\u6216\u7ED3\u5C3E\u5B9A\u683C\u3002";
function buildStyleLockFallback() {
  return "Use the upstream reference text anchors only for character and scene continuity. The visual style is fixed: black-and-white rough pencil film storyboard, with color used only for annotation arrows/marks.";
}
function buildContinuityStyleLine() {
  return "Style priority: draw the actual scene/characters/props as black-and-white rough pencil line art only. Color is allowed only on annotation arrows/marks (red/blue/green/orange/purple). If the original prompt asks for color palette, cinematic color grading, polished stills, anime color, blue rain wash, or rendered lighting, ignore the color/rendering and keep the monochrome storyboard sketch style.";
}
function buildForceTextualLine() {
  return `Reference image upload is unavailable for this request. ${buildStyleLockFallback()}`;
}
function buildHardLayoutLimits(panelCount) {
  return [
    `Hard layout limit: the final image must contain exactly ${panelCount} rectangular frames and no extra frames.`,
    "Use only the 2x3 frame map described above. Keep the panel count exact.",
    "Each frame must reserve a small caption strip BELOW the drawing for one short Chinese story caption.",
    "Thin clean black borders, evenly spaced panels, professional storyboard sheet composition, no missing or merged panels."
  ];
}
function buildAtmosphereOverrideBlock(override) {
  return `[MANDATORY SCENE ATMOSPHERE OVERRIDE \u2014 the artist MUST follow this direction above all other atmosphere/weather descriptions in the prompt below]:
${override}
This override takes absolute priority. If any conflicting weather, atmosphere, or environment mood appears later in this prompt, ignore the conflicting description and follow ONLY this override.
`;
}
function buildTimeOfDayLockLine(lighting, colorShift, atmosphere) {
  return `TIME-OF-DAY LOCK for all 6 panels: ${lighting}. Atmosphere: ${atmosphere}. Interpret any color shift "${colorShift}" only as black-white value contrast and shadow density, never as visible color fill. This is the ONLY lighting state for this storyboard \u2014 do not drift to any other time period.`;
}
function buildPlaceholderRefReadyLine(sceneName) {
  return `Custom scene "${sceneName}" \u2014 visual identity is fully carried by the uploaded scene reference image. All 6 panels must inherit architecture, materials, lighting direction, atmosphere, and value contrast FROM THE REFERENCE IMAGE. Do NOT invent details that are not visible in the reference.`;
}
function buildVisualConsistencyKeywordsLine(keywords) {
  return `Visual consistency keywords (style anchors): ${keywords.join(", ")}.`;
}
var ENV_DETAIL_TEMPLATES = {
  lightProgression: (progression) => `Scene light arc reference (for cross-node continuity only, NOT for within-storyboard progression): ${progression}. Within this 6-panel storyboard, lighting must remain CONSTANT \u2014 do not simulate day-to-night within the storyboard.`,
  lightingLock: (sources, direction, quality) => `Scene lighting lock: source=${sources}, direction=${direction}, quality=${quality}. Maintain across all panels.`,
  keyMaterials: (materials) => `Key materials for texture continuity: ${materials.join(", ")}. At least 2 materials must be visible in Panels 1, 3, and 6.`,
  fixedProps: (props) => `Fixed props as spatial anchors: ${props.join(", ")}. Must appear consistently in wide and medium frames.`,
  spatialHierarchy: (hierarchy) => `Spatial depth layers: ${hierarchy}. Panel 1 must show all three layers; close-ups show foreground only with simplified background pencil lines.`,
  depthOfFieldHint: (hint) => `Depth of field guidance: ${hint}.`,
  colorPaletteStructured: (primary, secondary, accent) => `Value hierarchy reference only \u2014 Primary forms: ${primary.join(", ")}; Secondary forms: ${secondary.join(", ")}; Accent details: ${accent.join(", ")}. Convert all colors to monochrome line weight, hatching, and grey value contrast. Do not render visible color fills.`,
  colorPalette: (palette) => `Palette reference only: ${palette.join(", ")}. Convert these colors to black-white value contrast; do not render visible color fills.`,
  weatherLock: (weather) => `MANDATORY Weather/atmosphere lock: "${weather}". This weather condition MUST be visually rendered in EVERY panel \u2014 show physical weather effects (e.g. rain streaks, wet surfaces, puddles, fog, snow, wind, mist, condensation) consistently across all 6 panels. Do NOT default to clear/sunny skies if the weather specifies otherwise. No random weather changes between panels.`,
  groundTexture: (texture) => `Ground texture reference: ${texture}. Must be consistent in wide shots and the final panel.`,
  detailCloseups: (closeups) => `Scene detail close-up references: ${closeups.join("; ")}. Use as texture/detail anchors in Panels 3-4.`,
  productionNotes: (notes) => `PRODUCTION HARD CONSTRAINT: ${notes}`
};
var TIME_LOCK_FOOTER = "TIME LOCK (MANDATORY): All 6 panels represent a SINGLE continuous story beat (approximately 10-15 seconds of real time). Lighting direction, color temperature, shadow angle, weather state, and time-of-day must be IDENTICAL across all 6 panels. Do NOT create a sunrise-to-sunset, day-to-night, or any temporal progression within this storyboard. If reference images contain multi-panel time variations (e.g. Environment Production Sheet), only match the MAIN CENTER panel's lighting \u2014 ignore time variation panels.";
var ENV_DETAIL_BLOCK_HEADER = "Scene environment layer:";
var PROP_CONTINUITY_HEADER = "\u3010\u9053\u5177\u52A8\u4F5C\u4E0E\u8FDE\u7EED\u6027 \xB7 \u7279\u5199\u683C\u627F\u8F7D\u4E92\u52A8\uFF0C\u6536\u5C3E\u683C\u4FDD\u6301\u72B6\u6001\u3011";
var PROP_CONTINUITY_FOOTER = "When a prop appears in close-up panels, show distinguishing marks, material texture, and how the character is holding it. When a prop appears in wide panels, maintain correct silhouette and position relative to characters.";
var DIALOGUE_CUES_HEADER = "\u3010\u53F0\u8BCD / \u8868\u6F14\u5206\u914D \xB7 \u7528\u8868\u60C5\u3001\u5634\u578B\u3001\u80A2\u4F53\u548C\u7AD9\u4F4D\u8868\u73B0\uFF0C\u7981\u6B62\u753B\u6210\u6587\u5B57\u3011";
var DIALOGUE_CUES_FOOTER = "The quoted dialogue lines are INTERNAL performance cues only, never visible text. Speaking panels must show slightly parted lips, visible jaw movement tension, and matching emotional body language. Non-speaking panels show neutral closed-mouth resting state with appropriate emotional expression. Match dialogue intensity to physical performance: quiet lines = subtle movements; loud lines = exaggerated movements.";
var GRID_ENDING_CONTRACT_TITLE = "\u30106 \u9762\u677F\u7ED3\u5C40\u5B9A\u683C\u786C\u5951\u7EA6\u3011";
var GRID_ENDING_CONTRACT_FIXED_LINES = {
  panel9Final: "Panel 6 \u4E3A\u672B\u5E27\u5B9A\u683C\uFF1A\u4E3B\u4F53\u9501\u6B7B\u753B\u9762\u4E2D\u5FC3\uFF08\u5BF9\u79F0\u6216\u5F3A\u4E09\u5206\u6784\u56FE\uFF09\uFF0C\u4E0D\u5F97 fade out\uFF0C\u4E0D\u5F97\u7559\u6269\u5C55\u4F59\u5730\uFF1B\u7ED9\u89C6\u9891\u7EED\u63A5\u9884\u7559\u7A33\u5B9A\u4E00\u5E27\u3002\u52A8\u4F5C\u5B8C\u5168\u9759\u6B62\uFF0C\u8868\u60C5\u51DD\u56FA\u3002",
  lightingDirectionLock: "\u5149\u5F71\u65B9\u5411 / \u8272\u6E29 / \u5927\u6C14\u5FC5\u987B\u5BF9\u9F50\u7ED3\u5C40\u5149\u5F71\uFF0C\u4E0D\u5F97\u4E0E Panels 1-5 \u51FA\u73B0\u660E\u6697\u5012\u7F6E\u3002\u4F7F\u7528\u6A59\u8272\u6807\u8BB0\u6307\u793A\u4E3B\u5149\u65B9\u5411\u3002"
};
var GRID_KEY_CHOICE_CONTRACT_TITLE = "\u30106 \u9762\u677F\u5173\u952E\u6289\u62E9\u63A8\u8FDB\u786C\u5951\u7EA6\u3011";
var GRID_KEY_CHOICE_CONTRACT_FIXED_LINES = {
  panel9Freeze: "Panel 6 \u5FC5\u987B\u786C\u5B9A\u683C\u5728\u538B\u529B\u7126\u70B9\uFF08\u51DD\u6EDE 0.5 \u79D2\u7684\u77AC\u95F4 / \u547C\u5438\u505C\u987F / \u65F6\u95F4\u611F\u653E\u7F13\uFF09\uFF0C\u4E3A\u8FD0\u884C\u65F6\u9009\u9879\u6D6E\u73B0\u9884\u7559\u7A33\u5B9A\u5E27\u3002\u52A8\u4F5C\u5B8C\u5168\u9759\u6B62\uFF0C\u53EA\u6709\u773C\u775B\u5728\u52A8\u3002",
  panel9Composition: "Panel 6 \u7684\u6784\u56FE\uFF1A\u4E09\u5206\u6784\u56FE\uFF0C\u7126\u70B9\u504F\u5DE6 25%\uFF0C\u53F3\u4FA7\u4FDD\u7559 1/3 \u5F31\u7EB9\u7406/\u7EAF\u8272\u8D1F\u7A7A\u95F4\uFF08\u7ED9\u9009\u9879 UI \u7559\u4F4D\uFF09\u3002",
  forbidden: "\u7981\u6B62\uFF1A\u52A8\u4F5C\u4E2D\u6BB5\u6A21\u7CCA\u5FEB\u95E8\u3001\u9009\u9879 UI \u6587\u5B57\uFF08\u9009\u9879\u7531\u8FD0\u884C\u65F6\u53E0\u52A0\uFF09\u3001\u4EFB\u4F55\u52A8\u6001\u6A21\u7CCA\u6548\u679C\u3002"
};
var GRID_KEY_CHOICE_FOCUS_FALLBACK = "\u4E3B\u89D2\u9762\u90E8\u7279\u5199 + \u53EF\u89C1\u538B\u529B\u9053\u5177";
var CONTINUITY_BLOCK_LINES = {
  header: "\u8FDE\u7EED\u6027\u7EA6\u675F\uFF1A",
  same: "\u6240\u6709\u9762\u677F\u4FDD\u6301\u76F8\u540C\u89D2\u8272\u3001\u76F8\u540C\u670D\u88C5\u8F6E\u5ED3\u3001\u76F8\u540C\u53D1\u578B\u3001\u76F8\u540C\u4F53\u578B\u8F6E\u5ED3\u3001\u76F8\u540C\u573A\u666F\u5E03\u5C40\u3001\u76F8\u540C\u6750\u8D28\u3001\u76F8\u540C\u5149\u7167\u65B9\u5411\u3001\u76F8\u540C\u9ED1\u767D\u7EBF\u7A3F\u6545\u4E8B\u677F\u98CE\u683C\u3002",
  preserve: "\u4FDD\u7559\u53C2\u8003\u56FE\u4E2D\u7684\u89D2\u8272\u8EAB\u4EFD\u548C\u573A\u666F\u8BBE\u8BA1\uFF0C\u4E0D\u5F97\u91CD\u65B0\u8BBE\u8BA1\u89D2\u8272\u6216\u573A\u666F\uFF0C\u7CBE\u786E\u5339\u914D\u6F14\u5458\u5916\u8C8C\u3002",
  originalPromptRole: "\u539F\u59CB\u955C\u5934\u63D0\u793A\u8BCD\u4EC5\u7528\u4E8E\u786E\u5B9A\u52A8\u4F5C\u8282\u62CD\u3001\u53D6\u666F\u3001\u8FD0\u52A8\u8282\u594F\u3001\u60C5\u7EEA\u65F6\u673A\u548C\u9762\u677F\u6392\u5E8F\u3002",
  noVisibleDialogue: "\u53F0\u8BCD\u548C\u65C1\u767D\u4E0D\u5F97\u4EE5\u53EF\u89C1\u6587\u5B57\u51FA\u73B0\uFF0C\u901A\u8FC7\u9762\u90E8\u8868\u60C5\u3001\u80A2\u4F53\u8BED\u8A00\u3001\u821E\u53F0\u8C03\u5EA6\u3001\u9053\u5177\u548C\u5149\u5F71\u8868\u73B0\u8868\u6F14\u5185\u5BB9\u3002"
};
var VISUAL_RHYTHM_LINES = {
  header: "\u89C6\u89C9\u8282\u594F\u8981\u6C42\uFF1A",
  alternateShots: "\u4EA4\u66FF\u4F7F\u7528\u8FDC\u666F\u3001\u4E2D\u666F\u3001\u7279\u5199\u3001\u6781\u8FD1\u7279\u5199\u3001\u8FC7\u80A9\u955C\u5934\u3001\u4F4E\u89D2\u5EA6\u3001\u9AD8\u89D2\u5EA6\u3001\u8DDF\u62CD\u6784\u56FE\u548C\u53CD\u5E94\u7EC6\u8282\uFF0C\u540C\u4E00\u666F\u522B\u4E0D\u5F97\u8FDE\u7EED\u91CD\u590D\u4E09\u6B21\u3002",
  focalLengthMatch: "\u7126\u8DDD\u987B\u4E0E\u666F\u522B\u5339\u914D\uFF1A\u8FDC\u666F=24-35mm\uFF0C\u4E2D\u666F=35-50mm\uFF0C\u4E2D\u8FD1\u666F=50-85mm\uFF0C\u7279\u5199/\u6781\u8FD1\u7279\u5199=85-135mm\uFF1B\u666F\u6DF1\u987B\u4E0E\u60C5\u7EEA\u5339\u914D\uFF1A\u4EB2\u5BC6\u611F=\u6D45\u666F\u6DF1\uFF0C\u73AF\u5883\u611F=\u6DF1\u7126\u3002",
  screenDirection: "\u4FDD\u6301\u6E05\u6670\u7684\u94F6\u5E55\u65B9\u5411\u3001\u5165\u753B\u65B9\u5411\u548C\u51FA\u753B\u65B9\u5411\uFF0C\u907F\u514D\u8FDE\u7EED\u6027\u8DF3\u5207\u3001\u9053\u5177\u77AC\u79FB\u6216\u65E0\u5173\u8054\u7684\u66FF\u6362\u8BBE\u8BA1\uFF0C\u89D2\u8272\u5728\u9762\u677F\u95F4\u8FD0\u52A8\u65B9\u5411\u987B\u4FDD\u6301\u4E00\u81F4\u3002"
};
var AVOID_NEGATIVES = {
  withLabels: "\u7981\u6B62\uFF1A\u6C34\u5370\u3001Logo\u3001\u5B57\u5E55\u3001\u5BF9\u767D\u6587\u5B57\u3001\u5BF9\u8BDD\u6C14\u6CE1\u3001\u6807\u9898\u680F\u3001UI \u53E0\u5C42\u3001\u65F6\u95F4\u6233\u3001\u9A6C\u8D5B\u514B\u3001\u50CF\u7D20\u65B9\u5757\u3001\u635F\u574F\u4F2A\u5F71\u3001\u670D\u88C5\u4E0D\u4E00\u81F4\u3001\u53D1\u578B\u53D8\u5316\u3001\u9762\u90E8\u4E0D\u4E00\u81F4\u3001\u5149\u7167\u65B9\u5411\u4E0D\u4E00\u81F4\u3001\u591A\u4F59\u624B\u6307\u3001\u7578\u5F62\u624B\u90E8\u3001\u9762\u90E8\u626D\u66F2\u3001\u9759\u6001\u6446\u62CD\u3001\u50F5\u786C\u8EAB\u4F53\u8BED\u8A00\u3001\u7CBE\u81F4\u5F69\u8272\u63D2\u753B\u3001\u5F69\u8272\u586B\u5145\u3001\u5F69\u8272\u670D\u88C5\u3001\u5F69\u8272\u80CC\u666F\u3001\u84DD\u8272\u6C34\u6D17\u3001\u52A8\u6F2B\u7740\u8272\u3001\u6CB9\u753B\u6E32\u67D3\u3001\u4F4E\u8D28\u91CF\u3001\u6A21\u7CCA\u3002\u4EC5\u4FDD\u7559\u89C4\u5B9A\u7684\u9762\u677F\u5E8F\u53F7\u3001\u4E2D\u6587\u955C\u5934\u7B14\u8BB0\u3001\u6BCF\u683C\u4E0B\u65B9\u6545\u4E8B\u60C5\u8282\u548C\u5F69\u8272\u6545\u4E8B\u677F\u6807\u8BB0\u3002",
  withoutLabels: "\u7981\u6B62\uFF1A\u6C34\u5370\u3001Logo\u3001\u5B57\u5E55\u3001\u957F\u6BB5\u6587\u5B57\u3001\u5BF9\u8BDD\u6C14\u6CE1\u3001\u6807\u9898\u680F\u3001UI \u53E0\u5C42\u3001\u65F6\u95F4\u6233\u3001\u9A6C\u8D5B\u514B\u3001\u50CF\u7D20\u65B9\u5757\u3001\u635F\u574F\u4F2A\u5F71\u3001\u670D\u88C5\u4E0D\u4E00\u81F4\u3001\u53D1\u578B\u53D8\u5316\u3001\u9762\u90E8\u4E0D\u4E00\u81F4\u3001\u5149\u7167\u65B9\u5411\u4E0D\u4E00\u81F4\u3001\u591A\u4F59\u624B\u6307\u3001\u7578\u5F62\u624B\u90E8\u3001\u9762\u90E8\u626D\u66F2\u3001\u9759\u6001\u6446\u62CD\u3001\u50F5\u786C\u8EAB\u4F53\u8BED\u8A00\u3001\u7CBE\u81F4\u5F69\u8272\u63D2\u753B\u3001\u5F69\u8272\u586B\u5145\u3001\u5F69\u8272\u670D\u88C5\u3001\u5F69\u8272\u80CC\u666F\u3001\u84DD\u8272\u6C34\u6D17\u3001\u52A8\u6F2B\u7740\u8272\u3001\u6CB9\u753B\u6E32\u67D3\u3001\u4F4E\u8D28\u91CF\u3001\u6A21\u7CCA\u3002"
};
var STORYBOARD_MARK_SYSTEM = [
  "\u6545\u4E8B\u677F\u5F69\u8272\u6807\u6CE8\u7CFB\u7EDF\uFF08\u5F3A\u5236\u6267\u884C\uFF09\uFF1A",
  "\u7EA2\u8272\u7BAD\u5934 = \u8EAB\u4F53\u8FD0\u52A8\u65B9\u5411\u3002",
  "\u84DD\u8272\u7BAD\u5934 = \u6444\u5F71\u673A\u8FD0\u52A8\u3002",
  "\u7EFF\u8272\u6807\u8BB0 = \u53D6\u666F/\u6784\u56FE\u7B14\u8BB0\u3002",
  "\u6A59\u8272\u6807\u8BB0 = \u4E3B\u5149\u65B9\u5411\u3002",
  "\u7D2B\u8272\u6807\u8BB0 = \u60C5\u7EEA/\u58F0\u97F3/\u53D9\u4E8B\u5F3A\u8C03\u3002",
  "\u9ED1\u8272\u6587\u5B57 = \u7B80\u77ED\u955C\u5934\u7B14\u8BB0\u3001\u9762\u677F\u5E8F\u53F7\u548C\u6BCF\u683C\u4E0B\u65B9\u6545\u4E8B\u60C5\u8282\uFF08\u4E2D\u6587\uFF09\u3002",
  "\u5B9E\u9645\u7ED8\u56FE\u672C\u4F53\u5FC5\u987B\u4FDD\u6301\u9ED1\u767D\u7C97\u7CD9\u94C5\u7B14/\u58A8\u7EBF\u7EBF\u7A3F\u3002\u53EA\u6709\u6807\u6CE8\u7BAD\u5934\u548C\u6807\u8BB0\u53EF\u4EE5\u4F7F\u7528\u7EA2/\u84DD/\u7EFF/\u6A59/\u7D2B\u8272\u3002\u89D2\u8272\u3001\u670D\u88C5\u3001\u76AE\u80A4\u3001\u9053\u5177\u3001\u573A\u666F\u3001\u5929\u7A7A\u3001\u5929\u6C14\u3001\u9634\u5F71\u548C\u5149\u5F71\u4E0D\u5F97\u7740\u8272\u3002"
].join("\n");
var ABSOLUTE_VISUALIZATION_PROTOCOL = [
  "Absolute visualization protocol (5 mandatory rules \xB7 all must pass before output):",
  "1. Emotion-to-action: NEVER use abstract emotion words (sad, nervous, lazy, angry) in visual descriptions. Translate ALL emotions into concrete body language: 'sad' \u2192 'reddened eye rims, lower lip trembling, hands limp on knees'; 'nervous' \u2192 'fingers unconsciously clutching fabric, shoulders raised, visible throat swallow'.",
  "2. Audio-to-visual: ALL sound cues must become visible props or physical states in the frame: 'ticking clock' \u2192 'vintage brass clock on wall with visible hands'; 'rain' \u2192 'dense water droplet trails sliding down window glass'; 'heartbeat' \u2192 'chest fabric rising and falling with subtle breathing rhythm'.",
  "3. Material specificity: NEVER use vague adjectives ('nice clothes', 'pretty face'). Decompose into material + shape + wear level using monochrome cues: 'worn linen shirt with collar stain indicated by grey hatching', 'scuffed leather boots with visible sole wear in black line art'.",
  "4. Spatial positioning: specify element placement using composition terms: 'subject at right-third line', 'foreground blurred wire mesh', 'background depth fading into warm haze'.",
  "5. Dialogue-to-visual: ALL dialogue must be translated into facial expressions and body language as per the Dialogue Visualization Protocol. No text, subtitles, speech bubbles, or captions allowed in any frame.",
  "**All 5 rules must pass. If any panel description still contains abstract emotion words, raw sound cues, vague adjectives, unspecified spatial positions, or dialogue text, rewrite that panel until all 5 rules pass before output.**"
];
var VISUAL_STACKING_PRIORITY_LINES = [
  "Visual stacking priority per panel (generator reads top-to-bottom):",
  "Style \u2192 Character features (face/hair/wardrobe silhouette) \u2192 Shot size & lens \u2192 Subject action & body language \u2192 Dialogue expression (lips/jaw/body tension) \u2192 Scene props & materials \u2192 Lighting direction as monochrome value \u2192 Atmosphere as line/hatching density."
];
var DIALOGUE_VISUALIZATION_PROTOCOL2 = [
  "Dialogue visualization protocol (MANDATORY for all speaking panels):",
  "1. Never render any text, subtitles, speech bubbles, or dialogue captions inside the frames.",
  "2. Translate all dialogue into concrete visual cues:",
  "   - Speaking: Slightly parted lips, visible jaw movement, appropriate facial expression",
  "   - Whispering: Lips barely moving, hand covering mouth, leaning in",
  "   - Shouting: Wide open mouth, furrowed brows, tense neck muscles",
  "   - Crying: Reddened eyes, tear streaks, trembling lips",
  "   - Angry: Clenched jaw, flared nostrils, raised voice posture",
  "   - Happy: Smiling mouth, crinkled eyes, relaxed shoulders",
  "3. Match body language to dialogue tone: hesitant speech = fidgeting hands; confident speech = upright posture; nervous speech = shifting weight.",
  "4. Non-speaking panels show neutral closed-mouth resting state with appropriate emotional expression."
].join("\n");
var STORYBOARD_QUALITY_CHECKLIST = [
  "\u3010\u5206\u955C\u8D28\u91CF\u81EA\u68C0\u6E05\u5355 \xB7 \u5FC5\u987B\u5168\u90E8\u6EE1\u8DB3\u3011",
  "\u2705 \u6240\u67096\u4E2A\u9762\u677F\u90FD\u5DF2\u751F\u6210\uFF0C\u5E03\u5C40\u4E3A2\u884C3\u5217\u6545\u4E8B\u677F\u8868\u683C",
  "\u2705 \u6BCF\u4E2A\u9762\u677F\u4E0B\u65B9\u90FD\u6709\u4E00\u884C\u7B80\u77ED\u4E2D\u6587\u6545\u4E8B\u60C5\u8282\uFF0C\u8BF4\u660E\u8BE5\u683C\u5267\u60C5\u8FDB\u5C55",
  "\u2705 \u5B9E\u9645\u6545\u4E8B\u677F\u7ED8\u56FE\u4EC5\u4E3A\u9ED1\u767D\u7C97\u7CD9\u94C5\u7B14/\u58A8\u7EBF\u4E0E\u7070\u5EA6\u660E\u6697\uFF0C\u4EBA\u7269\u3001\u670D\u88C5\u3001\u80CC\u666F\u3001\u5929\u7A7A\u548C\u706F\u5149\u6CA1\u6709\u4EFB\u4F55\u5F69\u8272\u586B\u5145",
  "\u2705 \u5F69\u8272\u6807\u6CE8\u7CFB\u7EDF\u6B63\u786E\uFF1A\u7EA2=\u8EAB\u4F53\u8FD0\u52A8\uFF0C\u84DD=\u6444\u5F71\u673A\u8FD0\u52A8\uFF0C\u7EFF=\u6784\u56FE\uFF0C\u6A59=\u706F\u5149\uFF0C\u7D2B=\u60C5\u7EEA/\u58F0\u97F3/\u53D9\u4E8B\uFF0C\u9ED1=\u955C\u5934\u7B14\u8BB0",
  "\u2705 \u6240\u6709\u52A8\u4F5C\u90FD\u662F\u5177\u4F53\u53EF\u62CD\u6444\u7684\u7269\u7406\u52A8\u4F5C\uFF0C\u65E0\u62BD\u8C61\u60C5\u7EEA\u8BCD",
  "\u2705 \u6240\u6709\u53F0\u8BCD\u90FD\u901A\u8FC7\u9762\u90E8\u8868\u60C5\u548C\u80A2\u4F53\u8BED\u8A00\u8868\u73B0\uFF0C\u65E0\u5B57\u5E55\u6216\u5BF9\u767D\u6C14\u6CE1",
  "\u2705 \u8FD0\u955C\u4E0E\u60C5\u7EEA\u5339\u914D\uFF1A\u9759\u6001=\u5B89\u9759\u65F6\u523B\uFF0C\u624B\u6301=\u7D27\u5F20\uFF0C\u63A8\u955C=\u60C5\u7EEA\u9012\u8FDB",
  "\u2705 \u89D2\u8272\u3001\u670D\u88C5\u3001\u9053\u5177\u3001\u573A\u666F\u5728\u6240\u6709\u9762\u677F\u4E2D\u4FDD\u6301\u4E00\u81F4",
  "\u2705 \u5149\u5F71\u65B9\u5411\u3001\u8272\u6E29\u3001\u5929\u6C14\u5728\u6240\u6709\u9762\u677F\u4E2D\u4FDD\u6301\u4E00\u81F4",
  "\u2705 \u6CA1\u6709\u7578\u5F62\u4EBA\u4F53\u3001\u591A\u624B\u6307\u3001\u626D\u66F2\u9762\u90E8\u7B49 AI \u7F3A\u9677",
  "\u2705 \u6CA1\u6709\u6C34\u5370\u3001Logo\u3001\u5B57\u5E55\u3001UI\u3001\u65F6\u95F4\u6233\u7B49\u591A\u4F59\u5143\u7D20",
  "\u2705 \u7B2C 6 \u4E2A\u9762\u677F\u662F\u5168\u7247\u9AD8\u6F6E\u6216\u7ED3\u5C3E\u5B9A\u683C\uFF0C\u89C6\u89C9\u51B2\u51FB\u6700\u5F3A",
  "\u751F\u6210\u524D\u8BF7\u518D\u6B21\u68C0\u67E5\u4EE5\u4E0A\u6240\u6709\u9879\uFF0C\u786E\u4FDD\u5206\u955C\u8D28\u91CF\u7B26\u5408\u4E13\u4E1A\u7535\u5F71\u5236\u4F5C\u6807\u51C6\u3002"
].join("\n");
var PANEL_SEQUENCE_HEADER = "\u9762\u677F\u6267\u884C\u5E8F\u5217\uFF1A";
var ORIGINAL_SHOT_PROMPT_HEADER = "\u539F\u59CB\u955C\u5934\u63D0\u793A\u8BCD\uFF1A";
var SANITIZE_LEGACY_STYLE_PATTERN = /^Style:.*(?:anime|comix|comic|manga|ghibli|shinkai|illustration|photorealistic|live-action|live action).*$/gim;
var SANITIZE_NEGATIVE_PROMPT_PATTERN = /^Negative prompt:.*(?:anime|manga|comic|illustration|concept art|digital painting|painterly|cartoon|3D render|game art).*$/gim;
var SANITIZE_NEGATIVE_REPLACE = {
  withLabels: "Avoid: watermark, logo, subtitles, dialogue text, speech bubbles, title bars, UI overlays, timestamps, mosaic, pixelation, glitch blocks, corrupted pixels, inconsistent wardrobe, changed hairstyle, inconsistent face, inconsistent lighting direction, extra fingers, distorted hands, deformed faces, static poses, stiff body language, polished color illustration, color fill, colored clothing, colored background, blue wash, anime coloring, painterly rendering, low quality, blurry.",
  withoutLabels: "Avoid: watermark, logo, subtitles, long captions, speech bubbles, title bars, UI overlays, timestamps, mosaic, pixelation, glitch blocks, corrupted pixels, inconsistent wardrobe, changed hairstyle, inconsistent face, inconsistent lighting direction, extra fingers, distorted hands, deformed faces, static poses, stiff body language, polished color illustration, color fill, colored clothing, colored background, blue wash, anime coloring, painterly rendering, low quality, blurry."
};
var FINAL_MONOCHROME_OVERRIDE = "FINAL MONOCHROME OVERRIDE: The final image is a black-and-white hand-drawn line-art storyboard. All character drawings, clothing, props, architecture, weather, shadows, and backgrounds must be monochrome pencil/ink line work and graphite hatching only. Red/blue/green/orange/purple may appear ONLY as annotation arrows or tiny markup symbols. Never color the actual artwork. No colored fills, no colored clothes, no colored sky, no blue/grey wash, no watercolor wash, no painterly tonal blocks.";
var SANITIZE_LAYOUT_PATTERNS = [
  [/2\s*[x×]\s*2\s*(grid|layout|storyboard)?/gi, "2x3 six-panel storyboard table"],
  [/3\s*[x×]\s*2\s*(grid|layout|storyboard)?/gi, "2x3 six-panel storyboard table"],
  [/2\s*[x×]\s*3\s*(grid|layout|storyboard)?/gi, "2x3 six-panel storyboard table"],
  [/3\s*[x×]\s*3\s*(grid|layout|storyboard)?/gi, "2x3 six-panel storyboard table"],
  [/12\s*[- ]?\s*(panel|grid|panels|grids|frame|frames)/gi, "6-panel storyboard table"],
  [/9\s*[- ]?\s*(panel|grid|panels|grids|frame|frames)/gi, "6-panel storyboard table"],
  [/4\s*[- ]?\s*(panel|grid|panels|grids|frame|frames)/gi, "6-panel storyboard table"],
  [/twelve\s*[- ]?\s*(panel|grid|panels|grids|frame|frames)/gi, "six-panel storyboard table"],
  [/nine\s*[- ]?\s*(panel|grid|panels|grids|frame|frames)/gi, "six-panel storyboard table"],
  [/four\s*[- ]?\s*(panel|grid|panels|grids|frame|frames)/gi, "six-panel storyboard table"],
  [/十二面板|12面板|十二格|12格/g, "\u516D\u9762\u677F\u6545\u4E8B\u677F"],
  [/九宫格|9宫格|九格|9格/g, "\u516D\u9762\u677F\u6545\u4E8B\u677F"],
  [/四宫格|4宫格|四格|4格/g, "\u516D\u9762\u677F\u6545\u4E8B\u677F"]
];

// server/engine/fmv/shot-grid.ts
var ENDING_LIGHT_PROMPTS = {
  good: {
    imageLighting: "\u6696\u91D1\u659C\u5149\u4ECE\u5DE6\u4E0A\u6253\u5165\uFF0C\u8F6E\u5ED3\u8FB9\u7F18\u6CDB\u8D77\u900F\u5149\u6668\u66E6\uFF0C\u4E3B\u4F53\u88AB\u6E29\u6DA6\u5149\u7EBF\u5305\u88F9",
    videoLighting: "\u5149\u7EBF\u9010\u6E10\u589E\u5F3A\uFF0C\u7531\u51B7\u7070\u8FC7\u6E21\u5230\u6696\u91D1\u8272\uFF0C\u8FB9\u7F18\u67D4\u5149\u968F\u547C\u5438\u9012\u589E\uFF0C\u8272\u6E29\u5411\u6668\u5149\u504F\u79FB",
    videoMotion: "\u955C\u5934\u7F13\u6162\u62C9\u8D77\uFF08\u63A8\u8FDB \u2192 \u4E0A\u5347\uFF09\uFF0C\u672B\u5E27\u5B9A\u683C\u4E8E\u6668\u5149\u4E2D\u82CF\u9192\u7684\u4E3B\u4F53\uFF0C\u4E0D\u505A fade out",
    mustInclude: ["\u6668\u5149"]
  },
  bad: {
    imageLighting: "\u51B7\u84DD\u4F4E\u7167\u5EA6\u4FA7\u9006\u5149\uFF0C\u6697\u90E8\u5927\u9762\u79EF\u5806\u79EF\uFF0C\u4E3B\u5149\u7184\u706D\u4EC5\u6B8B\u5149\u52FE\u52D2\u8F6E\u5ED3",
    videoLighting: "\u5149\u7EBF\u7531\u660E\u8F6C\u6697\uFF0C\u8272\u6E29\u538B\u4F4E\u81F3\u51B7\u84DD\uFF0C\u6B8B\u5149\u9010\u6E10\u7184\u706D\uFF0C\u9634\u5F71\u541E\u6CA1\u524D\u666F",
    videoMotion: "\u955C\u5934\u4E0B\u6C89\uFF08\u4FEF\u62CD \u2192 \u9501\u5B9A\u4F4E\u4F4D\uFF09\uFF0C\u672B\u5E27\u5B9A\u683C\u4E8E\u7184\u706D\u7684\u4E3B\u5149\u6E90\u6216\u5854\u9677\u7684\u4E3B\u4F53",
    mustInclude: ["\u51B7"]
  },
  neutral: {
    imageLighting: "\u534A\u660E\u534A\u6697\u4EA4\u754C\u5149\uFF0C\u9EC4\u660F\u6216\u65E5\u51FA\u524D\u65F6\u6BB5\uFF0C\u8272\u6E29\u4E2D\u6027\u504F\u9752\uFF0C\u660E\u6697\u5E73\u5206\u753B\u9762",
    videoLighting: "\u5149\u7EBF\u5728\u534A\u660E\u534A\u6697\u4E4B\u95F4\u7F13\u6162\u6447\u6446\uFF0C\u8272\u6E29\u4E0D\u505A\u51B3\u65AD\uFF0C\u6668\u660F\u4EA4\u754C\u7684\u6726\u80E7\u611F\u6301\u7EED",
    videoMotion: "\u955C\u5934\u6C34\u5E73\u6A2A\u79FB\u6216\u7F13\u6162\u73AF\u7ED5\uFF0C\u672B\u5E27\u5B9A\u683C\u4E8E\u6668\u660F\u4EA4\u754C\u7684\u4E2D\u7ACB\u6784\u56FE",
    mustInclude: ["\u6668\u660F"]
  }
};
function getShotGridPanelCount() {
  return GRID_PANEL_COUNT;
}
function isMeaningfulPlaceholderValue(value) {
  return Boolean(value && !/[（(]\s*待补充/.test(value));
}
function filterMeaningfulPlaceholderArray(values) {
  return (values ?? []).filter(isMeaningfulPlaceholderValue);
}
function resolveTimeOfDayVariation(entry, nodeTimeOfDay) {
  if (!nodeTimeOfDay || !entry.timeOfDayVariations?.length) return void 0;
  return entry.timeOfDayVariations.find(
    (v) => nodeTimeOfDay.includes(v.period) || v.period === "golden-hour" && /黄昏|傍晚|夕/.test(nodeTimeOfDay) || v.period === "morning" && /晨|早|清晨/.test(nodeTimeOfDay) || v.period === "night" && /夜|晚/.test(nodeTimeOfDay) || v.period === "noon" && /午|中午|正午/.test(nodeTimeOfDay)
  );
}
function buildPanel5CameraAnchor(directive) {
  if (!directive) return "";
  const angle = directive.angle?.trim();
  const composition = directive.composition?.trim();
  const dof = directive.depthOfField?.trim();
  if (!angle && !composition && !dof) return "";
  const parts = [];
  if (angle) parts.push(`${PANEL5_ANCHOR_FIELD_LABELS.angle}=${angle}`);
  if (composition) parts.push(`${PANEL5_ANCHOR_FIELD_LABELS.composition}=${composition}`);
  if (dof) parts.push(`${PANEL5_ANCHOR_FIELD_LABELS.depthOfField}=${dof}`);
  return `${PANEL5_ANCHOR_PREFIX}${parts.join("; ")}.`;
}
function resolveKeyChoiceFocus(choiceRevealMoment) {
  if (!choiceRevealMoment) return void 0;
  const trimmed = choiceRevealMoment.trim();
  if (trimmed.length < 8) return void 0;
  return trimmed;
}
function getEndingLabel(endingKind) {
  if (endingKind === "good") return "\u597D\u7ED3\u5C40";
  if (endingKind === "bad") return "\u574F\u7ED3\u5C40";
  return "\u4E2D\u7ACB\u7ED3\u5C40";
}
function buildShotGridStoryboardPrompt(input) {
  const {
    originalPrompt,
    panelLabels = true,
    referenceCount = 0,
    referenceSummaries = [],
    forceTextualReferenceStyle = false,
    locationBibleEntry,
    nodeTimeOfDay,
    atmosphereOverride,
    propAnchors,
    dialogueCues,
    sceneRefReady = false,
    nodeRole = "regular",
    endingKind,
    choiceRevealMoment,
    nodeCameraDirective,
    storyboardContentAnchor
  } = input;
  const panelCount = getShotGridPanelCount();
  const panel5CameraAnchor = buildPanel5CameraAnchor(nodeCameraDirective);
  const narrativeProtocol = buildPanelNarrativeProtocol(panel5CameraAnchor);
  const envDetailBlock = buildEnvDetailBlock(locationBibleEntry, nodeTimeOfDay, sceneRefReady);
  const storyboardAnchorBlock = buildStoryboardContentAnchorBlock(storyboardContentAnchor);
  const propContinuityBlock = buildPropContinuityBlock(propAnchors);
  const dialogueCuesBlock = buildDialogueCuesBlock(dialogueCues);
  const gridNodeContractBlock = buildGridNodeContractBlock(nodeRole, endingKind, choiceRevealMoment);
  const labelInstruction = panelLabels ? LABEL_INSTRUCTION_WITH_LABELS : LABEL_INSTRUCTION_WITHOUT_LABELS;
  const imageIntegrityGuardrails = buildImageIntegrityGuardrails(panelLabels);
  const atmosphereBlock = atmosphereOverride ? buildAtmosphereOverrideBlock(atmosphereOverride) : "";
  return [
    atmosphereBlock,
    buildHeaderLine(panelCount),
    FINAL_MONOCHROME_OVERRIDE,
    STORYBOARD_MARK_SYSTEM,
    "",
    buildReferenceCountLine(referenceCount),
    referenceSummaries.length ? [UPSTREAM_REFERENCE_HEADER, ...referenceSummaries.map((summary) => `- ${summary}`)].join("\n") : "",
    forceTextualReferenceStyle ? buildForceTextualLine() : "",
    LAYOUT_INSTRUCTION,
    ...buildHardLayoutLimits(panelCount),
    labelInstruction,
    imageIntegrityGuardrails,
    "",
    envDetailBlock.length ? [ENV_DETAIL_BLOCK_HEADER, ...envDetailBlock].join("\n") : "",
    "",
    storyboardAnchorBlock,
    "",
    propContinuityBlock.length ? propContinuityBlock.join("\n") : "",
    "",
    dialogueCuesBlock,
    "",
    CAMERA_PROGRESSION_BLOCK,
    "",
    gridNodeContractBlock,
    DIALOGUE_VISUALIZATION_PROTOCOL2,
    CONTINUITY_BLOCK_LINES.header,
    buildContinuityStyleLine(),
    CONTINUITY_BLOCK_LINES.same,
    CONTINUITY_BLOCK_LINES.preserve,
    CONTINUITY_BLOCK_LINES.originalPromptRole,
    CONTINUITY_BLOCK_LINES.noVisibleDialogue,
    "",
    VISUAL_RHYTHM_LINES.header,
    VISUAL_RHYTHM_LINES.alternateShots,
    VISUAL_RHYTHM_LINES.focalLengthMatch,
    VISUAL_RHYTHM_LINES.screenDirection,
    panelLabels ? AVOID_NEGATIVES.withLabels : AVOID_NEGATIVES.withoutLabels,
    "",
    ...ABSOLUTE_VISUALIZATION_PROTOCOL,
    "",
    ...VISUAL_STACKING_PRIORITY_LINES,
    "",
    PANEL_SEQUENCE_HEADER,
    ...narrativeProtocol,
    "",
    STORYBOARD_QUALITY_CHECKLIST,
    "",
    ORIGINAL_SHOT_PROMPT_HEADER,
    sanitizeShotGridOriginalPrompt(originalPrompt, panelLabels),
    "",
    FINAL_MONOCHROME_OVERRIDE
  ].filter(Boolean).join("\n");
}
function buildEnvDetailBlock(entry, nodeTimeOfDay, sceneRefReady) {
  if (!entry) return [];
  const block = [];
  const isPlaceholderEntry = entry.isPlaceholder === true;
  const resolvedTimeOfDay = resolveTimeOfDayVariation(entry, nodeTimeOfDay);
  if (resolvedTimeOfDay) {
    block.push(
      buildTimeOfDayLockLine(
        resolvedTimeOfDay.lightingOverride,
        resolvedTimeOfDay.colorShift,
        resolvedTimeOfDay.atmosphereOverride
      )
    );
  }
  if (isPlaceholderEntry) {
    if (sceneRefReady) {
      block.push(buildPlaceholderRefReadyLine(entry.name ?? ""));
      const meaningfulKeywords = filterMeaningfulPlaceholderArray(entry.visualConsistencyKeywords);
      if (meaningfulKeywords.length) {
        block.push(buildVisualConsistencyKeywordsLine(meaningfulKeywords));
      }
    }
  } else {
    if (!sceneRefReady) {
      if (entry.cinematicLightProgression) {
        block.push(ENV_DETAIL_TEMPLATES.lightProgression(entry.cinematicLightProgression));
      }
      if (entry.lighting) {
        const l = entry.lighting;
        block.push(
          ENV_DETAIL_TEMPLATES.lightingLock(
            l.sources ?? "natural",
            l.direction ?? "45\xB0 side",
            l.quality ?? "moderate"
          )
        );
      }
      if (entry.keyMaterials?.length) {
        block.push(ENV_DETAIL_TEMPLATES.keyMaterials(entry.keyMaterials));
      }
      if (entry.fixedProps?.length) {
        block.push(ENV_DETAIL_TEMPLATES.fixedProps(entry.fixedProps));
      }
      if (entry.spatialHierarchy) {
        block.push(ENV_DETAIL_TEMPLATES.spatialHierarchy(entry.spatialHierarchy));
      }
      if (entry.depthOfFieldHint) {
        block.push(ENV_DETAIL_TEMPLATES.depthOfFieldHint(entry.depthOfFieldHint));
      }
    }
    if (entry.colorPaletteStructured) {
      const cp = entry.colorPaletteStructured;
      block.push(
        ENV_DETAIL_TEMPLATES.colorPaletteStructured(cp.primary, cp.secondary, cp.accent)
      );
    } else if (entry.colorPalette?.length) {
      block.push(ENV_DETAIL_TEMPLATES.colorPalette(entry.colorPalette));
    }
    if (entry.weatherOrAtmosphere) {
      block.push(ENV_DETAIL_TEMPLATES.weatherLock(entry.weatherOrAtmosphere));
    }
    if (!sceneRefReady) {
      if (entry.groundTexture) {
        block.push(ENV_DETAIL_TEMPLATES.groundTexture(entry.groundTexture));
      }
      if (entry.detailCloseups?.length) {
        block.push(ENV_DETAIL_TEMPLATES.detailCloseups(entry.detailCloseups));
      }
      if (entry.environmentProductionNotes) {
        block.push(ENV_DETAIL_TEMPLATES.productionNotes(entry.environmentProductionNotes));
      }
    }
  }
  block.push(TIME_LOCK_FOOTER);
  return block;
}
function buildPropContinuityBlock(propAnchors) {
  if (!propAnchors?.length) return [];
  const block = [PROP_CONTINUITY_HEADER];
  for (const prop of propAnchors) {
    const parts = [
      prop.name,
      `\u6750\u8D28=${prop.material}`,
      `\u5F62\u72B6=${prop.shape}`,
      `\u989C\u8272=${prop.colorPalette.join(", ")}`
    ];
    if (prop.state) parts.push(`\u672C\u8282\u70B9\u72B6\u6001=${prop.state}`);
    block.push(`- ${parts.join("; ")}`);
  }
  block.push(PROP_CONTINUITY_FOOTER);
  return block;
}
function buildDialogueCuesBlock(dialogueCues) {
  if (!dialogueCues?.length) return "";
  return [
    DIALOGUE_CUES_HEADER,
    ...dialogueCues.map((cue) => {
      const parts = [
        cue.deliveryTiming ? `\u8282\u62CD=${cue.deliveryTiming}` : "",
        cue.speaker ? `\u89D2\u8272=${cue.speaker}` : "",
        cue.spokenLine ? `\u53F0\u8BCD="${cue.spokenLine}"` : "",
        cue.visualCue ? `\u8868\u6F14=${cue.visualCue}` : "",
        cue.subtext ? `\u6F5C\u53F0\u8BCD=${cue.subtext}` : ""
      ].filter(Boolean);
      return `- ${cue.panelRange}\uFF1A${parts.join("\uFF1B")}`;
    }),
    DIALOGUE_CUES_FOOTER
  ].join("\n");
}
function buildStoryboardContentAnchorBlock(anchor) {
  if (!anchor) return "";
  const lines = [
    STORYBOARD_CONTENT_ANCHOR_HEADER,
    anchor.segmentLabel ? `\u5206\u6BB5\u6807\u7B7E\uFF1A${anchor.segmentLabel}` : "",
    typeof anchor.shotIndex === "number" ? `\u5206\u6BB5\u5E8F\u53F7\uFF1A\u7B2C ${anchor.shotIndex} \u6BB5` : "",
    typeof anchor.durationSeconds === "number" ? `\u76EE\u6807\u65F6\u957F\uFF1A${anchor.durationSeconds}s` : "",
    anchor.sceneAnchor ? `\u5206\u955C\u6307\u4EE4\uFF1A${anchor.sceneAnchor}` : "",
    anchor.dialogueLines?.length ? `\u672C\u6BB5\u53F0\u8BCD\uFF1A${anchor.dialogueLines.map((line) => `\u300C${line}\u300D`).join(" / ")}` : "",
    anchor.voiceoverText ? `\u672C\u6BB5\u65C1\u767D\uFF1A${anchor.voiceoverText}` : "",
    typeof anchor.speechBudgetSeconds === "number" && anchor.speechBudgetSeconds > 0 ? `\u53E3\u64AD\u9884\u7B97\uFF1A${anchor.speechBudgetSeconds}s\uFF086 \u9762\u677F\u52A8\u4F5C\u8282\u594F\u5FC5\u987B\u7ED9\u53D1\u58F0\u7559\u767D\uFF09` : "",
    anchor.transitionHint ? `\u8854\u63A5\u65B9\u5F0F\uFF1A${anchor.transitionHint}` : "",
    anchor.promptOverride ? `\u8865\u5145\u7EA6\u675F\uFF1A${anchor.promptOverride}` : "",
    STORYBOARD_CONTENT_ANCHOR_FOOTER
  ].filter(Boolean);
  return lines.length > 2 ? lines.join("\n") : "";
}
function buildImageIntegrityGuardrails(panelLabels) {
  return [
    ...IMAGE_INTEGRITY_GUARDRAIL_LINES.prefix,
    panelLabels ? IMAGE_INTEGRITY_GUARDRAIL_LINES.withLabels : IMAGE_INTEGRITY_GUARDRAIL_LINES.withoutLabels
  ].join("\n");
}
function buildGridNodeContractBlock(nodeRole, endingKind, choiceRevealMoment) {
  if (nodeRole === "ending" && endingKind) {
    const entry = ENDING_LIGHT_PROMPTS[endingKind];
    const endingLabel = getEndingLabel(endingKind);
    return [
      GRID_ENDING_CONTRACT_TITLE,
      `\u7ED3\u5C40\u7C7B\u578B\uFF1A${endingKind}\uFF08${endingLabel}\uFF09\u3002`,
      `Panels 5-6 \u5FC5\u987B\u6536\u655B\u5230\u7ED3\u5C40\u5B9A\u683C\uFF1A${entry.imageLighting}\u3002`,
      GRID_ENDING_CONTRACT_FIXED_LINES.panel9Final,
      `\u672C\u6BB5\u786C\u5951\u7EA6\u4E2D\u5FC5\u987B\u51FA\u73B0\u4EE5\u4E0B\u8BCD\u4E4B\u4E00\uFF1A${entry.mustInclude.join(" / ")}\u3002`,
      GRID_ENDING_CONTRACT_FIXED_LINES.lightingDirectionLock
    ].join("\n");
  }
  if (nodeRole === "key-choice") {
    const focus = resolveKeyChoiceFocus(choiceRevealMoment) ?? GRID_KEY_CHOICE_FOCUS_FALLBACK;
    return [
      GRID_KEY_CHOICE_CONTRACT_TITLE,
      `Panels 4-6 \u5FC5\u987B\u6301\u7EED\u63A8\u5411\u6289\u62E9\u538B\u529B\u7126\u70B9\uFF08\u63D0\u53D6\u81EA choiceRevealMoment\uFF09\uFF1A${focus}\u3002`,
      GRID_KEY_CHOICE_CONTRACT_FIXED_LINES.panel9Freeze,
      GRID_KEY_CHOICE_CONTRACT_FIXED_LINES.panel9Composition,
      GRID_KEY_CHOICE_CONTRACT_FIXED_LINES.forbidden
    ].join("\n");
  }
  return "";
}
function sanitizeShotGridOriginalPrompt(value, panelLabels) {
  const base = sanitizeLegacyShotStyle(value);
  let result = base.replace(
    SANITIZE_NEGATIVE_PROMPT_PATTERN,
    panelLabels ? SANITIZE_NEGATIVE_REPLACE.withLabels : SANITIZE_NEGATIVE_REPLACE.withoutLabels
  );
  for (const [pattern, replacement] of SANITIZE_LAYOUT_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}
function sanitizeLegacyShotStyle(value) {
  return value.replace(
    SANITIZE_LEGACY_STYLE_PATTERN,
    "Style: black-and-white hand-drawn pencil line-art storyboard only, monochrome rough sketch, no color fill, no colored background, no colored clothing, no painterly rendering; color only for annotation arrows and tiny markup symbols."
  );
}

// server/engine/fmv/video-binding.ts
var ANTI_CLONE_COMPACT_CONSTRAINT = "\u89D2\u8272\u552F\u4E00\u6027\uFF1A\u6BCF\u4E2A @ \u89D2\u8272\u4EC5 1 \u4E2A\u5B9E\u4F8B\uFF1B\u7981\u6B62\u590D\u5236\u4EBA\u3001\u955C\u50CF\u3001\u91CD\u5F71\u3001\u53CC\u91CD\u66DD\u5149\u3001\u9762\u90E8\u878D\u5408\u6216\u8EAB\u4EFD\u4E32\u6270\u3002";
var STYLIZED_TEXTURE_COMPACT_CONSTRAINT = "\u8D28\u611F\uFF1A\u4FDD\u7559\u5FAE\u8868\u60C5\u3001\u53D1\u4E1D\u3001\u8863\u7269\u8936\u76B1\u3001\u96E8\u96FE/\u5C18\u57C3\u3001\u91D1\u5C5E\u73BB\u7483\u53CD\u5C04\u548C\u9634\u5F71\u5C42\u6B21\uFF1B\u907F\u514D\u5851\u6599\u611F\u4E0E\u5168\u753B\u9762\u7EDF\u4E00\u9510\u5EA6\u3002";
var CHINESE_DIALOGUE_CONSTRAINT = "\u6240\u6709\u89D2\u8272\u5BF9\u767D\u4E0E\u4EBA\u58F0\u4E3A\u7B80\u4F53\u4E2D\u6587\u666E\u901A\u8BDD\u53D1\u97F3\uFF0C\u53E3\u578B\u4E0E\u4E2D\u6587\u97F3\u8282\u540C\u6B65\uFF1B\u4E25\u7981\u8BF4\u82F1\u8BED / \u65E5\u8BED / \u5176\u4ED6\u8BED\u79CD\u3002";
var NO_WATERMARK_BGM_COMPACT_CONSTRAINT = "\u65E0\u97F3\u4E50\u3001\u65E0 BGM\u3001\u65E0\u914D\u4E50\u3001\u65E0\u6C34\u5370\u3001\u65E0 Logo\u3001\u65E0 UI\u3002";
var SEEDANCE_CUT_TERM_SOFTEN_MAP = [
  [/硬切入/g, "\u76F4\u63A5\u8D77\u955C"],
  [/反打切至/g, "\u53CD\u6253\u955C\u5934"],
  [/甩镜跳切/g, "\u5FEB\u901F\u6447\u955C"],
  [/视线引导至/g, "\u6CBF\u89C6\u7EBF\u65B9\u5411"],
  [/仰角切入/g, "\u4F4E\u89D2\u5EA6\u5207\u5165"],
  [/留白收束/g, "\u955C\u5934\u7F13\u6162\u843D\u5E45"]
];
function softenSeedanceCutTerms(text) {
  if (!text) return text;
  let result = text;
  for (const [pattern, replacement] of SEEDANCE_CUT_TERM_SOFTEN_MAP) {
    result = result.replace(pattern, replacement);
  }
  return result;
}
function inferSeedanceTaskMode(roles) {
  if (roles.some((role) => role.role === "extend_video")) return "extend";
  if (roles.some((role) => role.role === "keyframe_first") && roles.some((role) => role.role === "keyframe_last")) {
    return "first_last_frame";
  }
  return "reference";
}
function buildTaskModeLine(taskMode) {
  if (taskMode === "extend") {
    return "\u5411\u540E\u5EF6\u957F @\u89C6\u98911\uFF0C\u65F6\u5E8F\u5EF6\u7EED\u4EE5 @\u89C6\u98911 \u4E3A\u552F\u4E00\u57FA\u51C6\uFF0C\u9996\u5E27\u7D27\u63A5\u5176\u672B\u5E27\u7684\u4EBA\u7269\u59FF\u6001\u3001\u8868\u60C5\u3001\u5149\u5F71\u548C\u955C\u5934\u4F4D\u7F6E\uFF1B\u7981\u6B62\u8DF3\u5207\u3001\u8DF3\u5E27\u6216\u91CD\u7F6E\u573A\u666F\u3002";
  }
  if (taskMode === "edit") {
    return "\u4E25\u683C\u7F16\u8F91 @\u89C6\u98911\uFF0C\u4EC5\u4FEE\u6539\u88AB\u660E\u786E\u70B9\u540D\u7684\u5143\u7D20\uFF1B\u672A\u63D0\u53CA\u7684\u4EBA\u7269\u8EAB\u4EFD\u3001\u52A8\u4F5C\u3001\u8FD0\u955C\u548C\u573A\u666F\u4FDD\u6301\u4E0D\u53D8\u3002";
  }
  if (taskMode === "first_last_frame") {
    return "\u89C6\u9891\u4ECE\u9996\u5E27\u5173\u952E\u5E27\u81EA\u7136\u8D77\u52BF\uFF0C\u5E76\u5728\u7ED3\u5C3E\u5E73\u6ED1\u6536\u675F\u5230\u5C3E\u5E27\u5173\u952E\u5E27\u3002";
  }
  return "";
}
function buildSubjectAnchorOpening(roles) {
  if (!roles.length) return "";
  const lines = ["\u3010\u53C2\u8003\u56FE\u804C\u8D23\u3011"];
  for (const r of roles.filter((x) => x.productionType === "character_ref")) {
    const displayName = r.bibleName.trim() || "\u89D2\u8272";
    lines.push(`${r.atSlot}\u300C${displayName}\u300D\u4EBA\u7269\u8BBE\u5B9A\u56FE\uFF0C\u4EC5\u9501\u5B9A\u8138\u578B\u3001\u53D1\u578B\u3001\u670D\u88C5\u3001\u4F53\u6001\u3002`);
  }
  for (const r of roles.filter((x) => x.productionType === "scene_ref")) {
    lines.push(`${r.atSlot}\u300C${r.bibleName.trim() || "\u573A\u666F"}\u300D\u573A\u666F\u8BBE\u5B9A\u56FE\uFF0C\u4EC5\u9501\u5B9A\u7A7A\u95F4\u7ED3\u6784\u3001\u9648\u8BBE\u3001\u5149\u5F71\u65B9\u5411\u3002`);
  }
  for (const r of roles.filter((x) => x.productionType === "prop_ref")) {
    lines.push(`${r.atSlot}\u300C${r.bibleName.trim() || "\u9053\u5177"}\u300D\u9053\u5177\u8BBE\u5B9A\u56FE\uFF0C\u4EC5\u9501\u5B9A\u6750\u8D28\u3001\u5F62\u72B6\u3002`);
  }
  for (const r of roles.filter((x) => x.role === "palette_anchor")) {
    lines.push(`${r.atSlot} \u8272\u5361\u951A\u5B9A\uFF1A\u4EC5\u9501\u5B9A\u6574\u4F53\u8272\u5F69\u8303\u56F4\u3001\u660E\u6697\u5173\u7CFB\u548C\u60C5\u7EEA\u8272\u8C03\uFF0C\u4E0D\u6539\u53D8\u89D2\u8272\u8EAB\u4EFD\u4E0E\u573A\u666F\u7ED3\u6784\u3002`);
  }
  const first = roles.find((r) => r.role === "keyframe_first");
  const last = roles.find((r) => r.role === "keyframe_last");
  if (first) lines.push(`${first.atSlot} \u4F5C\u4E3A\u9996\u5E27\uFF08\u9996\u5E27\u9075\u4ECE\u5EA6 \u2265 85%\uFF09\u3002`);
  if (last) lines.push(`${last.atSlot} \u4F5C\u4E3A\u5C3E\u5E27\u76EE\u6807\u3002`);
  const styleAnchor = roles.find((r) => r.productionType === "style_anchor_frame");
  if (styleAnchor && styleAnchor.role !== "palette_anchor") {
    lines.push(`${styleAnchor.atSlot} \u98CE\u683C\u951A\u5E27\uFF0C\u4EC5\u7EE7\u627F\u7F8E\u672F\u98CE\u683C\u3001\u6784\u56FE\u3001\u8272\u8C03\u4E0E\u60C5\u7EEA\u6C1B\u56F4\u3002`);
  }
  const extendVideo = roles.find((r) => r.role === "extend_video");
  if (extendVideo) {
    lines.push(`\u5EF6\u957F ${extendVideo.atSlot}\u300C${extendVideo.bibleName.trim() || "\u4E0A\u4E00\u6BB5"}\u300D\uFF0C\u9996\u5E27\u7D27\u63A5\u5176\u672B\u5E27\u3002`);
  }
  const effectVideo = roles.find((r) => r.role === "effect_reference");
  if (effectVideo) {
    lines.push(`${effectVideo.atSlot} \u7279\u6548\u8FD0\u52A8\u53C2\u8003\uFF0C\u4EC5\u5B66\u4E60\u7279\u6548\u5F62\u6001\u4E0E\u8FD0\u52A8\u903B\u8F91\u3002`);
  }
  const storyboard = roles.find((r) => r.role === "storyboard");
  if (storyboard) {
    lines.push(`${storyboard.atSlot} \u5206\u955C\u8282\u594F\u53C2\u8003\uFF0C\u6309\u9762\u677F\u987A\u5E8F\u6267\u884C\u3002`);
  }
  return lines.length > 1 ? lines.join("\n") : "";
}
function buildTopPriorityConstraints(roles) {
  const rules = ["\u3010\u6700\u9AD8\u4F18\u5148\u7EA7\u7EA6\u675F\u3011", ANTI_CLONE_COMPACT_CONSTRAINT];
  const sceneRole = roles.find((r) => r.productionType === "scene_ref");
  if (sceneRole) {
    rules.push(`\u573A\u666F\u5EFA\u7B51\u7ED3\u6784\u3001\u9648\u8BBE\u4E0E\u5149\u5F71\u65B9\u5411\u4EE5 ${sceneRole.atSlot} \u4E3A\u51C6\uFF0C\u4E0D\u5F97\u6539\u53D8\u3002`);
  }
  rules.push("\u4FDD\u6301\u65E0\u5B57\u5E55\uFF0C\u907F\u514D\u751F\u6210\u4EFB\u4F55\u6587\u5B57\u6216\u5B57\u5E55\uFF1B\u65E0 caption\u3001\u65E0\u5BF9\u8BDD\u6C14\u6CE1\u3001\u65E0\u753B\u9762\u6587\u5B57\u3001Logo\u3001UI\u3002");
  return rules.join("\n");
}
function buildStyleAndParamsBlock(styleKeywords, clipSeconds, aspectRatio) {
  const tier = clipSeconds <= 5 ? "S\u6863" : clipSeconds <= 10 ? "M\u6863" : "L\u6863";
  const contentWindow = clipSeconds >= 15 ? "\u6709\u6548\u5185\u5BB913-14s\uFF0C\u672B\u5C3E\u75591s\u81EA\u7136\u5B9A\u683C" : `\u6709\u6548\u5185\u5BB9\u7EA6${clipSeconds}s`;
  const styleLine = (styleKeywords ?? []).filter(Boolean).join("\uFF0C") || "\u7EDF\u4E00\u5F71\u89C6\u7EA7\u5199\u5B9E\u8D28\u611F";
  return [
    "\u3010STYLE LOCK + \u751F\u6210\u53C2\u6570\u3011",
    `${styleLine}\uFF1BSeedance 2.0\uFF0C\u753B\u5E45${aspectRatio}\uFF0C\u65F6\u957F${clipSeconds}s\xB7${tier}\uFF0C${contentWindow}\u3002`
  ].join("\n");
}
function bindingToRole(b) {
  const atSlot = `${b.isVideo ? "@\u89C6\u9891" : "@\u56FE\u7247"}${b.index}`;
  const label = b.label ?? "";
  const base = { atSlot, bibleName: label, summary: label };
  switch (b.role) {
    case "\u573A\u666F":
      return { ...base, productionType: "scene_ref", role: "background" };
    case "\u7EED\u63A5\u9996\u5E27":
      return { ...base, productionType: "shot_image", role: "keyframe_first" };
    case "\u5EF6\u957F\u89C6\u9891":
      return { ...base, productionType: "video_clip", role: "extend_video" };
    case "\u9053\u5177":
      return { ...base, productionType: "prop_ref", role: "prop" };
    case "\u8272\u5361":
      return { ...base, productionType: "style_anchor_frame", role: "palette_anchor" };
    case "\u98CE\u683C\u951A\u5E27":
      return { ...base, productionType: "style_anchor_frame", role: "style_anchor" };
    case "\u5206\u955C\u8282\u594F":
      return { ...base, productionType: "shot_image", role: "storyboard" };
    default:
      return { ...base, productionType: "character_ref", role: "protagonist" };
  }
}
function buildSeedanceVideoPrompt(input) {
  const clipSeconds = input.durationSeconds;
  const aspectRatio = input.aspectRatio ?? "16:9";
  const roles = input.refs.map(bindingToRole);
  const taskMode = input.taskMode ?? inferSeedanceTaskMode(roles);
  const styleAndParams = buildStyleAndParamsBlock(input.styleKeywords, clipSeconds, aspectRatio);
  const subjectAnchor = buildSubjectAnchorOpening(roles);
  const constraintBlock = buildTopPriorityConstraints(roles);
  const taskModeLine = buildTaskModeLine(taskMode);
  const rawSequence = (input.seedancePrompt?.trim() || input.storyText?.trim() || "").trim();
  const shotSequence = rawSequence ? `\u3010${clipSeconds}\u79D2\u8FD0\u955C\u3011
${softenSeedanceCutTerms(rawSequence)}` : `\u3010${clipSeconds}\u79D2\u8FD0\u955C\u3011
\u955C\u59341\uFF1A\u6309\u8282\u70B9\u5267\u60C5\u63A8\u8FDB\u8868\u6F14\u548C\u955C\u5934\u3002`;
  const body = [
    styleAndParams,
    subjectAnchor,
    constraintBlock,
    taskModeLine,
    shotSequence,
    CHINESE_DIALOGUE_CONSTRAINT,
    STYLIZED_TEXTURE_COMPACT_CONSTRAINT,
    NO_WATERMARK_BGM_COMPACT_CONSTRAINT
  ].filter((s) => s.trim().length > 0).join("\n");
  if (input.extend) {
    const extendHeader = input.transitionHint ? `${VIDEO_EXTEND_HEADER_BLOCK}
7. \u8854\u63A5\u951A\u70B9\uFF1A${input.transitionHint}` : VIDEO_EXTEND_HEADER_BLOCK;
    return [extendHeader, body].join("\n");
  }
  return body;
}

// server/generation/gateway-client.ts
import { readFileSync as readFileSync3 } from "fs";
function getCeApiBase(ctx) {
  const explicit = ctx.env?.FORGEAX_SERVER_URL;
  if (explicit) return `${explicit.replace(/\/+$/, "")}/__ce-api__`;
  const port = ctx.env?.FORGEAX_SERVER_PORT ?? "18900";
  return `http://127.0.0.1:${port}/__ce-api__`;
}
function fileToDataUrl(path) {
  const bytes = readFileSync3(path);
  const mime = mimeForPath(path);
  return `data:${mime};base64,${bytes.toString("base64")}`;
}
function fileToBase64(path) {
  return readFileSync3(path).toString("base64");
}
async function postJson(url, body) {
  const resp = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const raw = await resp.text();
  if (!resp.ok) throw new Error(`[HTTP ${resp.status}] ${url} \xB7 ${raw.slice(0, 240)}`);
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`[PARSE] ${url} non-JSON \xB7 ${raw.slice(0, 200)}`);
  }
}
function dataUrlToB64(dataUrl) {
  const comma = dataUrl.indexOf(",");
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}
async function genText(ctx, input) {
  const base = getCeApiBase(ctx);
  const images = input.images ?? [];
  const data = images.length ? await postJson(`${base}/gemini-text`, {
    system: input.system,
    prompt: input.user,
    inputImages: images.map((i) => ({ base64: dataUrlToB64(i.dataUrl) }))
  }) : await postJson(`${base}/chat`, {
    system: input.system,
    messages: [{ role: "user", content: input.user }],
    maxTokens: input.maxTokens
  });
  if (!data.success || !data.text) throw new Error(data.error || "\u5BBF\u4E3B\u6587\u672C\u7F51\u5173\u751F\u6210\u5931\u8D25");
  return data.text;
}
async function genImage(ctx, input) {
  const body = { prompt: input.prompt, size: input.size ?? "1024x1024" };
  const refs = (input.referenceImagesB64 ?? []).filter(Boolean);
  if (refs.length) body.inputImages = refs.map((b64) => ({ base64: b64 }));
  const data = await postJson(`${getCeApiBase(ctx)}/generate-image`, body);
  if (!data.success || !data.imageBase64) throw new Error(data.error || "\u5BBF\u4E3B\u56FE\u50CF\u7F51\u5173\u751F\u6210\u5931\u8D25");
  return { base64: data.imageBase64, mime: data.mimeType || "image/png" };
}
async function createVideoTask(ctx, input) {
  const roles = input.imageWithRoles ?? [];
  const frames = roles.some((r) => r.role === "first_frame" || r.role === "last_frame");
  const data = await postJson(`${getCeApiBase(ctx)}/generate-video`, {
    prompt: input.prompt,
    seconds: input.seconds,
    size: input.size,
    inputReferenceDataUrl: roles[0]?.url,
    generateAudio: input.generateAudio ?? false,
    mode: frames ? "frames" : "reference",
    resolution: "1080p",
    ratio: "adaptive",
    imageWithRoles: roles.length ? roles : void 0,
    watermark: input.watermark ?? false
  });
  if (!data.success || !data.taskId) throw new Error(data.error || "\u5BBF\u4E3B\u89C6\u9891\u7F51\u5173\u521B\u5EFA\u4EFB\u52A1\u5931\u8D25");
  return data.taskId;
}
var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function pollVideoTask(ctx, taskId, opts = {}) {
  const base = getCeApiBase(ctx);
  const interval = opts.pollIntervalMs ?? 5e3;
  const timeout = opts.timeoutMs ?? 10 * 60 * 1e3;
  const t0 = Date.now();
  let consecutiveFail = 0;
  const MAX_CONSEC_FAIL = 8;
  while (true) {
    if (opts.signal?.aborted) throw new Error("[ABORT] poll aborted");
    if (Date.now() - t0 > timeout) throw new Error(`[TIMEOUT] video task > ${timeout}ms`);
    await sleep(interval);
    let data;
    try {
      const resp = await fetch(`${base}/video-status?taskId=${encodeURIComponent(taskId)}`, { signal: opts.signal });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      data = await resp.json();
    } catch (e) {
      if (e.name === "AbortError") throw e;
      if (++consecutiveFail >= MAX_CONSEC_FAIL) throw new Error(`[NET] video-status ${consecutiveFail}\xD7 \xB7 ${e.message}`);
      continue;
    }
    consecutiveFail = 0;
    if (!data.success) throw new Error(data.error || "\u89C6\u9891\u72B6\u6001\u67E5\u8BE2\u5931\u8D25");
    opts.onStatus?.(data.status ?? "queued");
    if (data.status === "completed" && data.videoUrl) return data.videoUrl;
    if (data.status === "failed") throw new Error(data.error || "\u89C6\u9891\u4EFB\u52A1\u5931\u8D25");
  }
}
async function fetchBinary(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`[HTTP ${resp.status}] fetch binary \xB7 ${url}`);
  const buf = new Uint8Array(await resp.arrayBuffer());
  const mime = resp.headers.get("content-type") || "video/mp4";
  return { bytes: buf, mime };
}
async function genVideoAndWait(ctx, input, opts = {}) {
  const taskId = await createVideoTask(ctx, input);
  const sourceUrl = await pollVideoTask(ctx, taskId, opts);
  const { bytes, mime } = await fetchBinary(sourceUrl);
  return { bytes, mime, sourceUrl, taskId };
}

// server/generation/orchestrate.ts
var EXT_BY_MIME = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov"
};
function extForMime(mime) {
  return EXT_BY_MIME[mime.toLowerCase()] ?? "bin";
}
function resolveAxes(octx, override, custom) {
  const base = getStyleAxes(octx.dir);
  return composeAxes({ ...base ?? {}, ...override ?? {} }, custom);
}
async function generateShotScript(octx, input) {
  const axes = resolveAxes(octx, input.styleAxes);
  const resolved = {
    ...input,
    artStyle: input.artStyle ?? axes.artMedia,
    styleKeywords: input.styleKeywords ?? axes.styleKeywords
  };
  const prompt = buildNodeShotScriptPrompt(resolved);
  const text = await genText(octx, {
    system: axes.directorSystem || void 0,
    user: prompt,
    jsonMode: true,
    temperature: 0.7
  });
  return parseShotScript(text, input.durationSeconds);
}
function parseShotScript(raw, durationSeconds) {
  const cleaned = raw.replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/i, "").trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return [{ shotNumber: 1, durationSeconds, seedancePrompt: cleaned.slice(0, 700) }];
  }
  const arr = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.shots) ? parsed.shots : [];
  const out = [];
  arr.forEach((item, i) => {
    const s = item;
    if (typeof s?.seedancePrompt !== "string" || !s.seedancePrompt.trim()) return;
    out.push({
      shotNumber: typeof s.shotNumber === "number" ? s.shotNumber : i + 1,
      durationSeconds: typeof s.durationSeconds === "number" ? s.durationSeconds : durationSeconds,
      seedancePrompt: s.seedancePrompt.trim(),
      dialogueLine: typeof s.dialogueLine === "string" ? s.dialogueLine : void 0,
      voiceover: typeof s.voiceover === "string" ? s.voiceover : void 0
    });
  });
  if (!out.length) return [{ shotNumber: 1, durationSeconds, seedancePrompt: cleaned.slice(0, 700) }];
  return out;
}
async function generateKeyframe(octx, input) {
  const mode = input.mode ?? "keyframe";
  const productionType = mode === "grid_storyboard" ? "grid_storyboard" : "shot_image";
  const defaultLabel = mode === "grid_storyboard" ? `\u5206\u955C\u6545\u4E8B\u677F \xB7 ${input.nodeName}` : `\u5173\u952E\u5E27 \xB7 ${input.nodeName}`;
  const id = makeAssetId(productionType);
  upsertAsset(octx.dir, {
    id,
    kind: "image",
    productionType,
    status: "generating",
    label: input.label ?? defaultLabel,
    sceneNodeId: input.sceneNodeId,
    sourceModule: "wb-game-video",
    prompt: input.beat,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    meta: { refIds: input.refAssetIds ?? [], mode }
  });
  try {
    const axes = resolveAxes(octx, input.styleAxes);
    const refB64 = await resolveRefBase64(octx, input.refAssetIds);
    const keyframePrompt = buildShotImagePrompt({
      ...input,
      uiStylePrompt: input.uiStylePrompt ?? axes.uiStylePrompt,
      refsReady: refB64.length > 0
    });
    const prompt = mode === "grid_storyboard" ? buildShotGridStoryboardPrompt({
      ...input.grid ?? {},
      originalPrompt: keyframePrompt,
      referenceCount: refB64.length,
      sceneRefReady: refB64.length > 0
    }) : keyframePrompt;
    const { base64, mime } = await genImage(octx, { prompt, size: "1024x1024", referenceImagesB64: refB64 });
    const bytes = Uint8Array.from(Buffer.from(base64, "base64"));
    const file = writeMediaFile(octx.dir, id, extForMime(mime), bytes);
    const ready = updateAsset(octx.dir, id, { status: "ready", file, mime, bytes: bytes.byteLength, prompt });
    if (!ready) throw new Error("keyframe asset \u843D\u76D8\u540E\u4E22\u5931");
    return ready;
  } catch (e) {
    updateAsset(octx.dir, id, { status: "failed", error: e.message });
    throw e;
  }
}
function assertRefsPresent(input) {
  const missing = [];
  if (!input.characterRefIds?.some(Boolean)) missing.push("character_ref\uFF08\u89D2\u8272\u53C2\u8003\u56FE\uFF09");
  if (!input.sceneRefIds?.some(Boolean)) missing.push("scene_ref\uFF08\u573A\u666F\u53C2\u8003\u56FE\uFF09");
  if (missing.length) {
    throw new Error(
      `\u89C6\u9891\u751F\u6210\u7F3A\u5FC5\u4F20\u53C2\u8003\u56FE\uFF1A${missing.join(" + ")}\u3002\u8BF7\u5148\u4ECE\u4E0A\u6E38\u6A21\u5757\uFF08wb-character / \u573A\u666F\u6A21\u5757\uFF09\u5BFC\u5165\u53C2\u8003\u56FE\uFF0C\u518D\u751F\u6210\u672C\u8282\u70B9\u89C6\u9891\u3002`
    );
  }
}
function kinoContentUrl(octx, assetId) {
  const port = octx.env?.FORGEAX_SERVER_PORT?.trim() || "18900";
  return `http://127.0.0.1:${port}/api/v1/kino/resources/${encodeURIComponent(assetId)}/content?game_id=${encodeURIComponent(octx.gameId)}`;
}
async function resolveAssetImagePayload(octx, asset) {
  const path = resolveAssetFilePath(octx.dir, asset);
  if (path) {
    return { base64: fileToBase64(path), dataUrl: fileToDataUrl(path) };
  }
  if (!asset.provider) {
    throw new Error(`\u53C2\u8003\u56FE ${asset.id} \u6CA1\u6709\u53EF\u8BFB\u53D6\u7684\u6587\u4EF6\u6216 provider`);
  }
  const response = await (octx.fetchImpl ?? fetch)(kinoContentUrl(octx, asset.id));
  if (!response.ok) {
    throw new Error(`\u53C2\u8003\u56FE ${asset.id} \u8BFB\u53D6\u5931\u8D25\uFF08HTTP ${response.status}\uFF09`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength === 0) {
    throw new Error(`\u53C2\u8003\u56FE ${asset.id} \u5185\u5BB9\u4E3A\u7A7A`);
  }
  const mime = response.headers.get("content-type")?.split(";", 1)[0] || asset.mime || "image/png";
  const base64 = bytes.toString("base64");
  return { base64, dataUrl: `data:${mime};base64,${base64}` };
}
async function resolveVideoRoleImages(octx, input) {
  const roles = [];
  const bindings = [];
  let idx = 1;
  const push = async (assetId, role, semantic) => {
    const asset = getAsset(octx.dir, assetId);
    if (!asset) throw new Error(`\u53C2\u8003\u56FE\u4E0D\u5B58\u5728\uFF1A${assetId}`);
    const payload = await resolveAssetImagePayload(octx, asset);
    roles.push({ role, url: payload.dataUrl });
    bindings.push({ index: idx, role: semantic, label: asset.label });
    idx++;
  };
  if (input.continuityFirstFrameId) await push(input.continuityFirstFrameId, "first_frame", "\u7EED\u63A5\u9996\u5E27");
  for (const cid of input.characterRefIds.filter(Boolean)) await push(cid, "reference_image", "\u89D2\u8272");
  for (const sid of input.sceneRefIds.filter(Boolean)) await push(sid, "reference_image", "\u573A\u666F");
  return { roles, bindings };
}
async function generateVideo(octx, input, pollOpts) {
  assertRefsPresent(input);
  const id = makeAssetId("video_clip");
  upsertAsset(octx.dir, {
    id,
    kind: "video",
    productionType: "video_clip",
    status: "generating",
    label: input.label ?? `\u89C6\u9891 \xB7 ${input.nodeName}`,
    sceneNodeId: input.sceneNodeId,
    sourceModule: "wb-game-video",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    meta: { characterRefIds: input.characterRefIds, sceneRefIds: input.sceneRefIds }
  });
  try {
    const axes = resolveAxes(octx, input.styleAxes);
    const { roles, bindings } = await resolveVideoRoleImages(octx, input);
    const prompt = buildSeedanceVideoPrompt({
      seedancePrompt: input.seedancePrompt,
      storyText: input.storyText,
      nodeName: input.nodeName,
      durationSeconds: input.durationSeconds,
      artStyle: input.artStyle ?? axes.artMedia,
      styleKeywords: input.styleKeywords ?? axes.styleKeywords,
      refs: bindings,
      extend: input.extend,
      transitionHint: input.transitionHint
    });
    const { bytes, mime, sourceUrl, taskId } = await genVideoAndWait(
      octx,
      {
        prompt,
        seconds: input.durationSeconds,
        imageWithRoles: roles,
        generateAudio: input.generateAudio ?? false
      },
      pollOpts
    );
    const file = writeMediaFile(octx.dir, id, extForMime(mime), bytes);
    const ready = updateAsset(octx.dir, id, {
      status: "ready",
      file,
      mime,
      bytes: bytes.byteLength,
      durationMs: Math.round(input.durationSeconds * 1e3),
      prompt,
      meta: { characterRefIds: input.characterRefIds, sceneRefIds: input.sceneRefIds, taskId, sourceUrl }
    });
    if (!ready) throw new Error("video asset \u843D\u76D8\u540E\u4E22\u5931");
    return ready;
  } catch (e) {
    updateAsset(octx.dir, id, { status: "failed", error: e.message });
    throw e;
  }
}
function splitDurationIntoSegments(totalSeconds) {
  const n = getShotCount(totalSeconds);
  if (n <= 1) return [Math.max(1, Math.round(totalSeconds))];
  const base = Math.floor(totalSeconds / n);
  const remainder = Math.round(totalSeconds - base * n);
  return Array.from({ length: n }, (_, i) => base + (i < remainder ? 1 : 0));
}
async function generateNodeVideo(octx, input, pollOpts) {
  assertRefsPresent(input);
  const segments = splitDurationIntoSegments(input.durationSeconds);
  if (segments.length <= 1) {
    return [await generateVideo(octx, input, pollOpts)];
  }
  const baseLabel = input.label ?? `\u89C6\u9891 \xB7 ${input.nodeName}`;
  const out = [];
  for (let i = 0; i < segments.length; i++) {
    const isExtend = i > 0;
    const seg = {
      ...input,
      durationSeconds: segments[i],
      label: `${baseLabel} \xB7 \u6BB5${i + 1}/${segments.length}`,
      extend: isExtend,
      transitionHint: isExtend ? input.transitionHint ?? `\u63A5\u4E0A\u4E00\u6BB5\uFF08\u7B2C ${i} \u6BB5\uFF09\u5C3E\u90E8\uFF0C\u4EBA\u7269\u3001\u673A\u4F4D\u3001\u5149\u5F71\u3001\u8868\u6F14\u8282\u594F\u65E0\u7F1D\u5EF6\u7EED` : void 0,
      // 续接 seam：extend 段用调用方给的关键帧作 first_frame（无 mp4 抽帧能力）；首段沿用原 seam。
      continuityFirstFrameId: input.continuityFirstFrameId
    };
    out.push(await generateVideo(octx, seg, pollOpts));
  }
  return out;
}
async function resolveRefBase64(octx, ids) {
  const out = [];
  for (const aid of ids ?? []) {
    const asset = getAsset(octx.dir, aid);
    if (!asset) throw new Error(`\u53C2\u8003\u56FE\u4E0D\u5B58\u5728\uFF1A${aid}`);
    out.push((await resolveAssetImagePayload(octx, asset)).base64);
  }
  return out;
}

// server/intake/characters.ts
import { existsSync as existsSync2, readdirSync, readFileSync as readFileSync4, statSync as statSync2 } from "fs";
import { resolve as resolve2 } from "path";
function pickPortraitRel(m) {
  const p = m.portrait ?? {};
  return p.front ?? p.current ?? p.three_quarter ?? Object.values(p).find(Boolean) ?? m.pipelines?.turnaround?.views?.front ?? Object.values(m.pipelines?.turnaround?.views ?? {}).find(Boolean);
}
function importCharacterRefs(opts) {
  const { assetsDir, charactersDir } = opts;
  if (!existsSync2(charactersDir)) return [];
  const out = [];
  let entries;
  try {
    entries = readdirSync(charactersDir);
  } catch {
    return [];
  }
  for (const charId of entries) {
    const charDir = resolve2(charactersDir, charId);
    const manifestPath2 = resolve2(charDir, "manifest.json");
    if (!existsSync2(manifestPath2)) continue;
    let m;
    try {
      if (!statSync2(charDir).isDirectory()) continue;
      m = JSON.parse(readFileSync4(manifestPath2, "utf-8"));
    } catch {
      continue;
    }
    const rel = pickPortraitRel(m);
    if (!rel) continue;
    const externalPath = resolve2(charDir, rel);
    if (!existsSync2(externalPath)) continue;
    out.push(
      upsertAsset(assetsDir, {
        id: `a-charref-${charId}`,
        kind: "image",
        productionType: "character_ref",
        status: "ready",
        label: m.name || charId,
        externalPath,
        sourceModule: "wb-character",
        mime: mimeForPath(externalPath),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        meta: { charId, role: m.role }
      })
    );
  }
  return out;
}

// server/intake/scenes.ts
import { existsSync as existsSync3, readFileSync as readFileSync5 } from "fs";
import { resolve as resolve3 } from "path";
function shortId(desc) {
  const key = desc.sha256 ?? desc.file ?? desc.assetName ?? Math.random().toString(36).slice(2);
  return `a-sceneref-${key.replace(/[^a-z0-9]/gi, "").slice(0, 24)}`;
}
function importSceneRefs(opts) {
  const { assetsDir, texturesDir } = opts;
  const indexPath = resolve3(texturesDir, "index.json");
  if (!existsSync3(indexPath)) return [];
  let list;
  try {
    const parsed = JSON.parse(readFileSync5(indexPath, "utf-8"));
    list = Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
  const out = [];
  for (const desc of list) {
    if (!desc.file) continue;
    const externalPath = resolve3(texturesDir, desc.file);
    if (!existsSync3(externalPath)) continue;
    out.push(
      upsertAsset(assetsDir, {
        id: shortId(desc),
        kind: "image",
        productionType: "scene_ref",
        status: "ready",
        label: desc.assetName || desc.assetType || "scene",
        externalPath,
        sourceModule: "wb-2d-scene-asset-generator",
        mime: desc.mimeType || mimeForPath(externalPath),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        meta: { assetType: desc.assetType, sha256: desc.sha256 }
      })
    );
  }
  return out;
}

// src/editor/persist/blueprint-store-fs.ts
import { existsSync as existsSync4, mkdirSync as mkdirSync2, readFileSync as readFileSync6, writeFileSync as writeFileSync2 } from "fs";
import { resolve as resolve4 } from "path";

// src/runtime/schema/node-config-schema.ts
var OVERLAY_DEMO = {
  version: "wb-game-video.overlay.v1",
  variables: {
    lastHit: { id: "lastHit", initial: 0 }
  },
  entities: {
    "ent-player": {
      id: "ent-player",
      name: "\u5C11\u4E3B",
      attrs: { hp: 100, attack: 20, defense: 8 },
      attrMeta: { hp: { max: 100, initial: 100, label: "\u6C14\u8840" } }
    },
    "ent-boss": {
      id: "ent-boss",
      name: "\u5200\u72C2",
      attrs: { hp: 120, attack: 24, defense: 10 },
      attrMeta: { hp: { max: 120, initial: 120, label: "\u6C14\u8840" } }
    }
  },
  ui: {
    overlays: {
      battleHud: {
        id: "battleHud",
        title: "\u6218\u6597\u8986\u76D6\u7269\uFF08\u53CC\u8840\u6761 + \u9632\u53CD + \u98D8\u5B57\uFF09",
        children: [
          {
            id: "playerHp",
            component: "battleHpBar",
            layout: { left: 0, top: 0, width: 1, height: 1 },
            trigger: { when: "enter" },
            inputs: { bind: "ent-player", label: "\u5C11\u4E3B" }
          },
          {
            id: "bossHp",
            component: "battleHpBar",
            layout: { left: 0, top: 0, width: 1, height: 1 },
            trigger: { when: "enter" },
            inputs: { bind: "ent-boss", label: "\u5200\u72C2" }
          },
          {
            id: "parry",
            component: "BattleParry",
            layout: { left: 0.5, top: 0.5, translateX: -0.5, translateY: -0.5 },
            trigger: { when: "at", ms: 1200 },
            inputs: {
              events: [
                { id: "A", label: "\u9632\u53CD" },
                { id: "B", label: "\u95EA\u907F" },
                { id: "miss", label: "\u5931\u624B" }
              ],
              defaultEvent: "miss",
              timeoutMs: 900
            }
          }
        ]
      }
    }
  },
  graph: {
    nodes: [
      {
        id: "n-boss-slash",
        type: "perf",
        position: { x: 0, y: 0 },
        data: {
          name: "Boss \u6A2A\u65A9",
          media: { kind: "VIDEO", ref: "difanggongjiqianyao" },
          durationMs: 3200,
          overlayNodes: [{
            overlay: "battleHud",
            layout: { left: 0, top: 0, width: 1, height: 1 },
            reactions: [
              {
                when: { type: "event", id: "A" },
                do: [{
                  kind: "effect",
                  effects: [
                    { kind: "attr", entityId: "ent-boss", attr: "hp", op: "add", value: { expr: "-(entity.ent-player.attr.attack)" } },
                    { kind: "var", varId: "lastHit", op: "set", value: { expr: "entity.ent-player.attr.attack" } }
                  ]
                }]
              },
              {
                when: { type: "event", id: "miss" },
                do: [{
                  kind: "effect",
                  effects: [
                    { kind: "attr", entityId: "ent-player", attr: "hp", op: "add", value: { expr: "-(entity.ent-boss.attr.attack)" } }
                  ]
                }]
              }
            ]
          }]
        }
      },
      {
        id: "n-counter",
        type: "perf",
        position: { x: 280, y: -80 },
        data: {
          name: "\u9632\u53CD\u8FFD\u51FB",
          media: { kind: "VIDEO", ref: "fangfan" },
          overlayNodes: [{ overlay: "battleHud" }]
        }
      },
      {
        id: "n-dodge",
        type: "perf",
        position: { x: 280, y: 40 },
        data: {
          name: "\u95EA\u907F\u540E\u6447",
          media: { kind: "VIDEO", ref: "shanbi" },
          overlayNodes: [{ overlay: "battleHud" }]
        }
      },
      {
        id: "n-hurt",
        type: "perf",
        position: { x: 280, y: 160 },
        data: {
          name: "\u53D7\u51FB",
          media: { kind: "VIDEO", ref: "shouji" },
          overlayNodes: [{ overlay: "battleHud" }]
        }
      }
    ],
    edges: [
      {
        id: "e-A",
        source: "n-boss-slash",
        target: "n-counter",
        sourceHandle: "A",
        targetHandle: "in",
        data: {}
      },
      {
        id: "e-B",
        source: "n-boss-slash",
        target: "n-dodge",
        sourceHandle: "B",
        targetHandle: "in",
        data: {}
      },
      {
        id: "e-miss",
        source: "n-boss-slash",
        target: "n-hurt",
        sourceHandle: "miss",
        targetHandle: "in",
        data: {}
      }
    ]
  }
};
var OVERLAY_DEMO_INSTANCE = {
  mountId: "battleHud",
  overlayId: "battleHud",
  nodeId: "n-boss-slash",
  layout: { left: 0, top: 0, width: 1, height: 1 },
  reactions: OVERLAY_DEMO.graph.nodes[0].data.overlayNodes[0].reactions,
  children: [
    {
      id: "battleHud/playerHp",
      component: "battleHpBar",
      layout: { left: 0, top: 0, width: 1, height: 1 },
      trigger: { when: "enter" },
      inputs: { bind: "ent-player", label: "\u5C11\u4E3B" },
      source: { mountId: "battleHud", overlayId: "battleHud", childId: "playerHp", nodeId: "n-boss-slash" }
    },
    {
      id: "battleHud/bossHp",
      component: "battleHpBar",
      layout: { left: 0, top: 0, width: 1, height: 1 },
      trigger: { when: "enter" },
      inputs: { bind: "ent-boss", label: "\u5200\u72C2" },
      source: { mountId: "battleHud", overlayId: "battleHud", childId: "bossHp", nodeId: "n-boss-slash" }
    },
    {
      id: "battleHud/parry",
      component: "BattleParry",
      trigger: { when: "at", ms: 1200 },
      layout: { left: 0.5, top: 0.5, translateX: -0.5, translateY: -0.5 },
      inputs: {
        events: [
          { id: "A", label: "\u9632\u53CD" },
          { id: "B", label: "\u95EA\u907F" },
          { id: "miss", label: "\u5931\u624B" }
        ],
        defaultEvent: "miss",
        timeoutMs: 900
      },
      source: { mountId: "battleHud", overlayId: "battleHud", childId: "parry", nodeId: "n-boss-slash" }
    }
  ]
};

// src/runtime/schema/graph-schema.ts
function getSubProcess(d) {
  const process2 = d.subProcess;
  return process2 && typeof process2 === "object" && typeof process2.entry === "string" && isGameGraph(process2.graph) ? process2 : void 0;
}
function getSubFlowPack(d) {
  const p = d.subFlowPack;
  return p && typeof p === "object" && typeof p.id === "string" ? p : void 0;
}
function isGameGraph(v) {
  if (!v || typeof v !== "object") return false;
  const g = v;
  if (!Array.isArray(g.nodes) || !Array.isArray(g.edges)) return false;
  return g.nodes.every((n) => {
    if (!n || typeof n !== "object") return false;
    const node = n;
    if (typeof node.type !== "string" || !node.type) return false;
    return !!node.data && typeof node.data === "object";
  });
}
function resolveGraphEntry(graph, preferred) {
  const nodes = graph.nodes;
  if (nodes.length === 0) return void 0;
  if (preferred && nodes.some((n) => n.id === preferred)) return preferred;
  const targets = new Set(graph.edges.map((e) => e.target));
  const roots = nodes.filter((n) => !targets.has(n.id));
  const pool = roots.length > 0 ? roots : nodes;
  return [...pool].sort(
    (a, b) => a.position.x - b.position.x || a.position.y - b.position.y || a.id.localeCompare(b.id)
  )[0].id;
}

// src/graph/edit/blueprint-refs.ts
function collectPackRefs(graph) {
  const out = /* @__PURE__ */ new Set();
  for (const n of graph.nodes) {
    const p = getSubFlowPack(n.data);
    if (p) out.add(p.id);
    const process2 = getSubProcess(n.data);
    if (process2) for (const ref of collectPackRefs(process2.graph)) out.add(ref);
  }
  return out;
}
function asMap(src) {
  const doc = src;
  if (doc.manifest?.packs && typeof doc.graph === "object") return doc.manifest.packs;
  return src;
}
function findReferenceCycle(src) {
  const blueprints = asMap(src);
  const path = [];
  const onPath = /* @__PURE__ */ new Set();
  const done = /* @__PURE__ */ new Set();
  function visit(id) {
    if (onPath.has(id)) return [...path.slice(path.indexOf(id)), id];
    if (done.has(id)) return null;
    const doc = blueprints[id];
    if (!doc) return null;
    path.push(id);
    onPath.add(id);
    for (const ref of collectPackRefs(doc.graph)) {
      const cyc = visit(ref);
      if (cyc) return cyc;
    }
    path.pop();
    onPath.delete(id);
    done.add(id);
    return null;
  }
  for (const id of Object.keys(blueprints)) {
    const cyc = visit(id);
    if (cyc) return cyc;
  }
  return null;
}

// src/editor/persist/blueprint-project.ts
var MAIN_ID = "bp-main";
function metaFromDocument(scn) {
  const m = {};
  if (scn.variables !== void 0) m.variables = scn.variables;
  if (scn.entities !== void 0) m.entities = scn.entities;
  if (scn.ui !== void 0) m.ui = scn.ui;
  if (scn.textStylePresets !== void 0) m.textStylePresets = scn.textStylePresets;
  if (scn.bgm !== void 0) m.bgm = scn.bgm;
  const formulas = scn.formulas;
  if (formulas !== void 0) m.formulas = formulas;
  return m;
}
function buildManifest(blueprints, mainId) {
  const next = {};
  for (const [id, d] of Object.entries(blueprints)) {
    const entry = resolveGraphEntry(d.graph, d.entry) ?? d.entry;
    next[id] = entry === d.entry ? d : { ...d, entry };
  }
  return {
    version: "wb-game-video.blueprint-manifest.v1",
    mainPackId: mainId,
    packs: next
  };
}
function documentFromBlueprints(blueprints, mainId, meta) {
  const manifest = buildManifest(blueprints, mainId);
  const main = manifest.packs[mainId];
  return {
    version: "wb-game-video.graph.v1",
    ...meta,
    graph: main?.graph ?? { nodes: [], edges: [] },
    manifest
  };
}
function documentFromScenario(scn, opts = {}) {
  const mainId = opts.mainId ?? MAIN_ID;
  const main = {
    id: mainId,
    title: "\u4E3B\u84DD\u56FE",
    entry: resolveGraphEntry(scn.graph, scn.graph.nodes[0]?.id) ?? scn.graph.nodes[0]?.id ?? "entry",
    graph: scn.graph
  };
  return documentFromBlueprints({ [mainId]: main }, mainId, metaFromDocument(scn));
}
function normalizeDocument(doc) {
  const any = doc;
  if (any.manifest?.packs && any.manifest.mainPackId) {
    const mainId = any.manifest.mainPackId;
    const bps = { ...any.manifest.packs };
    const main = bps[mainId];
    if (main) bps[mainId] = { ...main, graph: main.graph, entry: resolveGraphEntry(main.graph, main.entry) ?? main.entry };
    return documentFromBlueprints(bps, mainId, metaFromDocument(any));
  }
  return documentFromScenario(doc);
}
function validateDocument(doc) {
  const normalized = normalizeDocument(doc);
  const errors = [];
  const blueprints = normalized.manifest.packs;
  const mainId = normalized.manifest.mainPackId;
  for (const [bpId, bp] of Object.entries(blueprints)) {
    const seenNodes = /* @__PURE__ */ new Set();
    const seenEdges = /* @__PURE__ */ new Set();
    const validateScope = (graph, path) => {
      const localNodes = new Set(graph.nodes.map((node) => node.id));
      for (const n of graph.nodes) {
        if (seenNodes.has(n.id)) errors.push(`\u84DD\u56FE\u300C${bp.title}\u300D(${bpId}) \u5185\u8282\u70B9 id \u91CD\u590D\uFF1A'${n.id}' (${path})`);
        seenNodes.add(n.id);
        const raw = n.data;
        if ("subFlow" in raw || "subFlowRef" in raw) {
          errors.push(`\u84DD\u56FE\u300C${bp.title}\u300D(${bpId}) \u8282\u70B9 '${n.id}' \u4F7F\u7528\u4E86\u5DF2\u79FB\u9664\u7684 subFlow/subFlowRef`);
        }
        const process2 = getSubProcess(n.data);
        if (process2 && getSubFlowPack(n.data)) {
          errors.push(`\u84DD\u56FE\u300C${bp.title}\u300D(${bpId}) \u8282\u70B9 '${n.id}' \u7684 subProcess \u4E0E subFlowPack \u4E0D\u80FD\u540C\u65F6\u5B58\u5728`);
        }
        if ("subProcess" in raw && !process2) {
          errors.push(`\u84DD\u56FE\u300C${bp.title}\u300D(${bpId}) \u8282\u70B9 '${n.id}' \u7684 subProcess \u7ED3\u6784\u65E0\u6548`);
          continue;
        }
        if (!process2) continue;
        if (!process2.graph.nodes.some((child) => child.id === process2.entry)) {
          errors.push(`\u84DD\u56FE\u300C${bp.title}\u300D(${bpId}) \u8282\u70B9 '${n.id}' \u7684 subProcess entry '${process2.entry}' \u4E0D\u5728\u76F4\u5C5E\u5B50\u56FE\u4E2D`);
        }
        validateScope(process2.graph, `${path}/${n.id}`);
      }
      for (const e of graph.edges) {
        if (seenEdges.has(e.id)) errors.push(`\u84DD\u56FE\u300C${bp.title}\u300D(${bpId}) \u5185\u8FB9 id \u91CD\u590D\uFF1A'${e.id}' (${path})`);
        seenEdges.add(e.id);
        if (!localNodes.has(e.source)) errors.push(`\u84DD\u56FE\u300C${bp.title}\u300D(${bpId}) \u8FB9 '${e.id}' source \u6307\u5411\u672C\u5C42\u4E0D\u5B58\u5728\u7684\u8282\u70B9 '${e.source}'`);
        if (!localNodes.has(e.target)) errors.push(`\u84DD\u56FE\u300C${bp.title}\u300D(${bpId}) \u8FB9 '${e.id}' target \u6307\u5411\u672C\u5C42\u4E0D\u5B58\u5728\u7684\u8282\u70B9 '${e.target}'`);
      }
    };
    validateScope(bp.graph, "root");
    if (bp.graph.nodes.length > 0 && !bp.graph.nodes.some((n) => n.id === bp.entry)) {
      const fallback = resolveGraphEntry(bp.graph) ?? "\u2205";
      errors.push(`\u84DD\u56FE\u300C${bp.title}\u300D(${bpId}) entry '${bp.entry}' \u4E0D\u5728\u56FE\u4E2D\uFF08\u5C06\u56DE\u9000\u5230 ${fallback}\uFF09`);
    }
  }
  if (!blueprints[mainId]) {
    errors.push(`manifest.mainPackId '${mainId}' \u4E0D\u5728 manifest.packs \u4E2D`);
  }
  const cycle = findReferenceCycle(blueprints);
  if (cycle) errors.push(`\u84DD\u56FE\u5F15\u7528\u6210\u73AF\uFF1A${cycle.join(" \u2192 ")}`);
  return errors;
}

// src/editor/persist/blueprint-store-fs.ts
var BLUEPRINT_FILE = "blueprint.json";
var PROJECT_FILE = "project.json";
function readJson(p) {
  if (!existsSync4(p)) return null;
  try {
    return JSON.parse(readFileSync6(p, "utf-8"));
  } catch {
    return null;
  }
}
function defaultProject(dir) {
  const id = dir.split(/[/\\]/).filter(Boolean).pop() ?? "game";
  return {
    id,
    title: id,
    platform: "wb-game-video",
    platformVersion: "1",
    entry: { blueprint: "blueprint.json", components: "dist/components" }
  };
}
function readDocument(dir) {
  const raw = readJson(resolve4(dir, BLUEPRINT_FILE));
  if (!raw) return { document: null, versions: [] };
  try {
    return { document: normalizeDocument(raw), versions: [] };
  } catch (e) {
    console.warn(`[blueprint-store-fs] blueprint.json \u89C4\u8303\u5316\u5931\u8D25\uFF1A`, e);
    return { document: null, versions: [] };
  }
}
function readProject(dir) {
  const { document, versions } = readDocument(dir);
  return { project: document, versions };
}
function writeDocument(dir, document, _title = "graph") {
  const normalized = normalizeDocument(document);
  if (!existsSync4(dir)) mkdirSync2(dir, { recursive: true });
  writeFileSync2(resolve4(dir, BLUEPRINT_FILE), JSON.stringify(normalized, null, 2));
  const projectPath = resolve4(dir, PROJECT_FILE);
  if (!existsSync4(projectPath)) {
    writeFileSync2(projectPath, JSON.stringify(defaultProject(dir), null, 2));
  }
  return [];
}
function writeProject(dir, project, title = "graph") {
  return writeDocument(dir, project, title);
}

// server/tool-handlers.ts
function isSafeGameId(value) {
  return typeof value === "string" && value.length > 0 && value !== "." && value !== ".." && !value.includes("/") && !value.includes("\\");
}
function resolveExtensionRoot(ctx) {
  if (ctx.extensionDir) return resolve5(ctx.extensionDir);
  if (ctx.cwd) return resolve5(ctx.cwd);
  return null;
}
function bindHostContext(ctx) {
  if (ctx.gameId !== void 0) {
    const extensionRoot2 = resolveExtensionRoot(ctx);
    if (!isSafeGameId(ctx.gameId) || !ctx.cwd || !extensionRoot2) return null;
    return {
      boundGameId: ctx.gameId,
      gameRoot: resolve5(ctx.cwd),
      extensionRoot: extensionRoot2
    };
  }
  const extensionRoot = resolveExtensionRoot(ctx);
  if (!isSafeGameId(ctx.game) || !ctx.projectRoot || !extensionRoot) return null;
  return {
    boundGameId: ctx.game,
    gameRoot: resolve5(ctx.projectRoot, ".forgeax", "games", ctx.game),
    extensionRoot
  };
}
function pickSlug(args, bound) {
  if (!bound) return null;
  if (args.gameSlug !== void 0 && args.gameSlug !== bound.boundGameId) return null;
  return bound.boundGameId;
}
function graphDir(ctx, slug) {
  const bound = bindHostContext(ctx);
  if (!slug || !bound || slug !== bound.boundGameId) return null;
  return bound.gameRoot;
}
function orchestrateCtx(args, ctx) {
  const bound = bindHostContext(ctx);
  const slug = pickSlug(args, bound);
  if (!slug || !bound) return null;
  const dir = resolve5(bound.gameRoot, "assets");
  return { dir, gameId: slug, env: ctx.env };
}
var NO_REGISTRY_ERR = "\u5BBF\u4E3B\u672A\u7ED1\u5B9A\u6709\u6548\u6E38\u620F\u76EE\u5F55\u6216 gameSlug \u4E0E\u5F53\u524D\u6E38\u620F\u4E0D\u4E00\u81F4\uFF0C\u65E0\u6CD5\u8BBF\u95EE\u7D20\u6750\u5C42";
function crossModuleDir(args, ctx, sub) {
  const bound = bindHostContext(ctx);
  const slug = pickSlug(args, bound);
  if (!slug || !bound) return null;
  return resolve5(bound.gameRoot, sub);
}
function mapPerspective(p) {
  if (p === "first") return "\u7B2C\u4E00\u4EBA\u79F0";
  if (p === "third") return "\u7B2C\u4E09\u4EBA\u79F0";
  return void 0;
}
function mapChars(cs) {
  if (!cs?.length) return void 0;
  return cs.map((c) => c.desc ? { name: c.name, appearance: c.desc } : { name: c.name });
}
var tools = {
  /**
   * 读取当前 game 的库文档（GraphLibraryDocument = scenario + manifest）。
   * 无盘数据时 project 为 null。args: { gameSlug? }
   */
  "wb-game-video:get-graph": async (args, ctx) => {
    const slug = pickSlug(args, bindHostContext(ctx));
    const dir = graphDir(ctx, slug);
    const project = dir ? readProject(dir).project : null;
    return { project, gameSlug: slug };
  },
  /**
   * 覆盖写当前 game 的 blueprint.json；title 为保留参数，当前忽略。
   * args: { gameSlug?, project, title? }；成功 versions 固定为空数组。
   */
  "wb-game-video:save-graph": async (args, ctx) => {
    const slug = pickSlug(args, bindHostContext(ctx));
    const dir = graphDir(ctx, slug);
    if (!dir) return { ok: false, errors: ["\u5BBF\u4E3B\u672A\u7ED1\u5B9A\u6709\u6548\u6E38\u620F\u76EE\u5F55\u6216 gameSlug \u4E0E\u5F53\u524D\u6E38\u620F\u4E0D\u4E00\u81F4\uFF0C\u65E0\u6CD5\u843D\u76D8"] };
    if (!args.project) return { ok: false, errors: ["\u7F3A\u5C11 project"] };
    const errors = validateDocument(args.project);
    if (errors.length) return { ok: false, errors, gameSlug: slug };
    return { ok: true, versions: writeProject(dir, args.project, args.title), gameSlug: slug };
  },
  /**
   * 列出内置演出视频库（`src/editor/assets/zhandou/*.mp4` 的 basename，去扩展名）——
   * 供 AI 编排时知道有哪些 media.ref 可绑。
   */
  "wb-game-video:list-videos": async (_args, ctx) => {
    try {
      const extensionRoot = resolveExtensionRoot(ctx);
      if (!extensionRoot) throw new Error("\u5BBF\u4E3B\u672A\u63D0\u4F9B\u6269\u5C55\u76EE\u5F55");
      const dir = resolve5(extensionRoot, "src", "editor", "assets", "zhandou");
      const videos = readdirSync2(dir).filter((f) => f.toLowerCase().endsWith(".mp4")).map((f) => f.replace(/\.mp4$/i, "")).sort();
      return { videos };
    } catch (e) {
      return { videos: [], error: String(e) };
    }
  },
  /**
   * Step 1 · 生成一节点的 Seedance V2 镜头脚本（纯 prompt→text，不落 registry）。
   * args: ShotScriptInput 薄输入（见 schemas/generate-shot-script.args.json）。
   */
  "wb-game-video:generate-shot-script": async (args, ctx) => {
    const octx = orchestrateCtx(args, ctx);
    if (!octx) return { shots: [], error: NO_REGISTRY_ERR };
    if (!args.nodeName || !args.storyText) return { shots: [], error: "\u7F3A nodeName / storyText" };
    try {
      const shots = await generateShotScript(octx, {
        nodeName: args.nodeName,
        storyText: args.storyText,
        durationSeconds: args.durationSeconds ?? 8,
        artStyle: args.artStyle,
        styleKeywords: args.styleKeywords,
        perspective: mapPerspective(args.perspective),
        tone: args.tone,
        characters: mapChars(args.characters),
        location: args.location,
        // 线协议 interactive/choiceCount → IP 的 choicesLength（≥2 且非结局才触发抉择浮现规则）。
        choicesLength: args.choiceCount ?? (args.interactive ? 2 : void 0),
        styleAxes: args.styleAxes
      });
      return { shots };
    } catch (e) {
      return { shots: [], error: e.message };
    }
  },
  /**
   * Step 2 · 生成一张分镜图/关键帧，落 registry（shot_image）。
   * args: KeyframeInput 薄输入（见 schemas/generate-keyframe.args.json）。
   */
  "wb-game-video:generate-keyframe": async (args, ctx) => {
    const octx = orchestrateCtx(args, ctx);
    if (!octx) return { asset: null, error: NO_REGISTRY_ERR };
    if (!args.sceneNodeId || !args.nodeName || !args.beat) return { asset: null, error: "\u7F3A sceneNodeId / nodeName / beat" };
    try {
      const asset = await generateKeyframe(octx, {
        sceneNodeId: args.sceneNodeId,
        nodeName: args.nodeName,
        beat: args.beat,
        variant: args.variant,
        perspective: mapPerspective(args.perspective),
        characters: mapChars(args.characters),
        location: args.location,
        refAssetIds: args.refAssetIds,
        label: args.label,
        styleAxes: args.styleAxes,
        mode: args.mode,
        grid: args.grid
      });
      return { asset };
    } catch (e) {
      return { asset: null, error: e.message };
    }
  },
  /**
   * Step 3 · 生成一段视频，落 registry（video_clip）。必传 character/scene 参考图，缺则可读错。
   * args: VideoGenInput 薄输入（见 schemas/generate-video.args.json）。返回 asset.id 供绑 node.data.media.ref。
   */
  "wb-game-video:generate-video": async (args, ctx) => {
    const octx = orchestrateCtx(args, ctx);
    if (!octx) return { asset: null, error: NO_REGISTRY_ERR };
    if (!args.sceneNodeId || !args.nodeName) return { asset: null, error: "\u7F3A sceneNodeId / nodeName" };
    try {
      const asset = await generateVideo(octx, {
        sceneNodeId: args.sceneNodeId,
        nodeName: args.nodeName,
        seedancePrompt: args.seedancePrompt,
        storyText: args.storyText,
        durationSeconds: args.durationSeconds ?? 8,
        artStyle: args.artStyle,
        styleKeywords: args.styleKeywords,
        characterRefIds: args.characterRefIds ?? [],
        sceneRefIds: args.sceneRefIds ?? [],
        continuityFirstFrameId: args.continuityFirstFrameId,
        label: args.label,
        generateAudio: args.generateAudio,
        styleAxes: args.styleAxes,
        extend: args.extend,
        transitionHint: args.transitionHint
      });
      return { asset };
    } catch (e) {
      return { asset: null, error: e.message };
    }
  },
  /**
   * Step 3b · 为一节点生成成片，时长 > 15s 自动按 15s 拆段续接（P5 超长检测 + 显式 extend）。
   * 必传 character/scene 参考图。返回 assets[]（按段序），单段时长度为 1。
   * args: 同 wb-game-video:generate-video（durationSeconds 可 > 15）。
   */
  "wb-game-video:generate-node-video": async (args, ctx) => {
    const octx = orchestrateCtx(args, ctx);
    if (!octx) return { assets: [], error: NO_REGISTRY_ERR };
    if (!args.sceneNodeId || !args.nodeName) return { assets: [], error: "\u7F3A sceneNodeId / nodeName" };
    try {
      const assets = await generateNodeVideo(octx, {
        sceneNodeId: args.sceneNodeId,
        nodeName: args.nodeName,
        seedancePrompt: args.seedancePrompt,
        storyText: args.storyText,
        durationSeconds: args.durationSeconds ?? 8,
        artStyle: args.artStyle,
        styleKeywords: args.styleKeywords,
        characterRefIds: args.characterRefIds ?? [],
        sceneRefIds: args.sceneRefIds ?? [],
        continuityFirstFrameId: args.continuityFirstFrameId,
        label: args.label,
        generateAudio: args.generateAudio,
        styleAxes: args.styleAxes,
        transitionHint: args.transitionHint
      });
      return { assets };
    } catch (e) {
      return { assets: [], error: e.message };
    }
  },
  /** 列素材层资产（可按 kind / productionType / sceneNodeId 过滤）。 */
  "wb-game-video:list-assets": async (args, ctx) => {
    const octx = orchestrateCtx(args, ctx);
    if (!octx) return { assets: [], error: NO_REGISTRY_ERR };
    const filter = {};
    if (args.kind) filter.kind = args.kind;
    if (args.productionType) filter.productionType = args.productionType;
    if (args.sceneNodeId) filter.sceneNodeId = args.sceneNodeId;
    return { assets: listAssets(octx.dir, filter) };
  },
  /** 取单条素材资产。 */
  "wb-game-video:get-asset": async (args, ctx) => {
    const octx = orchestrateCtx(args, ctx);
    if (!octx) return { asset: null, error: NO_REGISTRY_ERR };
    if (!args.id) return { asset: null, error: "\u7F3A id" };
    return { asset: getAsset(octx.dir, args.id) };
  },
  /**
   * 跨模块只读拿料：扫 wb-character 的 `characters/<charId>/manifest.json`，把角色立绘
   * 登记成本 registry 的只读 character_ref（externalPath 指回对方文件，不复制、不改对方）。
   * 生成视频前先调它把角色参考图备齐。
   */
  "wb-game-video:import-character-refs": async (args, ctx) => {
    const octx = orchestrateCtx(args, ctx);
    const charactersDir = crossModuleDir(args, ctx, "characters");
    if (!octx || !charactersDir) return { refs: [], error: NO_REGISTRY_ERR };
    try {
      return { refs: importCharacterRefs({ assetsDir: octx.dir, charactersDir }) };
    } catch (e) {
      return { refs: [], error: e.message };
    }
  },
  /**
   * 跨模块只读拿料：扫场景模块发布到 `textures/index.json` 的贴图/场景图，登记成本 registry
   * 的只读 scene_ref（externalPath 指回对方文件）。生成视频前先调它把场景参考图备齐。
   */
  "wb-game-video:import-scene-refs": async (args, ctx) => {
    const octx = orchestrateCtx(args, ctx);
    const texturesDir = crossModuleDir(args, ctx, "textures");
    if (!octx || !texturesDir) return { refs: [], error: NO_REGISTRY_ERR };
    try {
      return { refs: importSceneRefs({ assetsDir: octx.dir, texturesDir }) };
    } catch (e) {
      return { refs: [], error: e.message };
    }
  }
};
var tool_handlers_default = tools;
export {
  tool_handlers_default as default,
  tools
};
//# sourceMappingURL=tool-handlers.js.map