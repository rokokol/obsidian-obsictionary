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

type Segment = { media: TFile } | { text: string };

/** Split a value into ordered text runs and media-attachment embeds. */
function segment(app: App, value: string, sourcePath: string): Segment[] {
  const segments: Segment[] = [];
  let cursor = 0;
  for (const match of value.matchAll(EMBED_RE)) {
    const linkpath = match[1];
    if (!linkpath) continue;
    const file = resolveMedia(app, linkpath.trim(), sourcePath);
    if (!file) continue; // non-media embeds stay inside the surrounding text run
    const start = match.index;
    if (start > cursor) segments.push({ text: value.slice(cursor, start) });
    segments.push({ media: file });
    cursor = start + match[0].length;
  }
  if (cursor < value.length) segments.push({ text: value.slice(cursor) });
  return segments;
}

/**
 * Render a dictionary cell value. Attachment embeds (`![[a.png]]`, `![[b.mp3]]`)
 * are drawn as native <img>/<audio>/<video> elements — deliberately bypassing
 * embed post-processors like media-extended, which break inside this custom view
 * — while surrounding text (and note transclusions) goes through the normal
 * markdown renderer. DOM order is preserved even though rendering is async.
 */
export function renderCellValue(
  app: App,
  el: HTMLElement,
  value: string,
  sourcePath: string,
  component: Component,
): void {
  const segments = segment(app, value, sourcePath);
  const hasMedia = segments.some((s) => "media" in s);
  if (!hasMedia) {
    void MarkdownRenderer.render(app, value, el, sourcePath, component);
    return;
  }
  for (const seg of segments) {
    if ("media" in seg) {
      appendMedia(app, el, seg.media);
    } else if (seg.text.trim() !== "") {
      const wrapper = el.createDiv({ cls: "obsictionary-cell-text" });
      void MarkdownRenderer.render(app, seg.text, wrapper, sourcePath, component);
    }
  }
}
