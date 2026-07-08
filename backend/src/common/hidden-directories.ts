// Directories that should never be scanned for photos nor offered as a
// pickable folder while browsing — Synology's per-folder thumbnail/index
// cache being the main one, since it sits right alongside real photo
// folders on every Synology NAS share.
const HIDDEN_DIR_NAMES = new Set(['@eaDir']);

export function isHiddenDirectoryName(name: string): boolean {
  return name.startsWith('.') || HIDDEN_DIR_NAMES.has(name);
}
