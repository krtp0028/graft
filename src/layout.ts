export const PREVIEW_POSITIONS = ["hidden", "right", "bottom", "top", "left"] as const;

export type PreviewPosition = (typeof PREVIEW_POSITIONS)[number];

export function isPreviewPosition(value: string): value is PreviewPosition {
  return (PREVIEW_POSITIONS as readonly string[]).includes(value);
}

export function nextPreviewPosition(current: PreviewPosition): PreviewPosition {
  const index = PREVIEW_POSITIONS.indexOf(current);
  return PREVIEW_POSITIONS[(index + 1) % PREVIEW_POSITIONS.length];
}
