import { MarkdownRenderer, type App, type Component, type TFile } from "obsidian";

const EMBED_RE = /!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g;
const AUDIO_EXT = new Set(["mp3", "wav", "ogg", "m4a", "flac", "aac", "3gp", "opus"]);
const VIDEO_EXT = new Set(["mp4", "webm", "mov", "mkv", "ogv"]);
const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif"]);

type MediaKind = "audio" | "video" | "image";

function mediaKind(ext: string): MediaKind | null {
  const e = ext.toLowerCase();
  if (IMAGE_EXT.has(e)) return "image";
  if (AUDIO_EXT.has(e)) return "audio";
  if (VIDEO_EXT.has(e)) return "video";
  return null;
}

function resolveMedia(app: App, linkpath: string, sourcePath: string): TFile | null {
  const file = app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath);
  return file && mediaKind(file.extension) !== null ? file : null;
}

function appendMedia(app: App, el: HTMLElement, file: TFile): void {
  const src = app.vault.getResourcePath(file);
  const kind = mediaKind(file.extension);
  if (kind === "image") {
    el.createEl("img", { attr: { src, alt: file.basename } });
  } else if (kind === "audio") {
    el.createEl("audio", { attr: { src, controls: "true" } });
  } else {
    el.createEl("video", { attr: { src, controls: "true" } });
  }
}

/**
 * Render a dictionary cell value. When the value is nothing but attachment
 * embeds (`![[a.png]] ![[b.mp3]]`), each is drawn as a native <img>/<audio>/
 * <video> element — deliberately bypassing embed post-processors like
 * media-extended, which break inside this custom view. Anything else (text,
 * note transclusions, mixed content) goes through the normal markdown renderer.
 */
export function renderCellValue(
  app: App,
  el: HTMLElement,
  value: string,
  sourcePath: string,
  component: Component,
): void {
  const trimmed = value.trim();
  const embeds = [...trimmed.matchAll(EMBED_RE)];
  const onlyEmbeds = embeds.length > 0 && trimmed.replace(EMBED_RE, "").trim() === "";
  const files = onlyEmbeds
    ? embeds.map((m) => resolveMedia(app, (m[1] ?? "").trim(), sourcePath))
    : [];

  if (onlyEmbeds && files.every((f): f is TFile => f !== null)) {
    for (const file of files) appendMedia(app, el, file);
    return;
  }
  void MarkdownRenderer.render(app, value, el, sourcePath, component);
}
