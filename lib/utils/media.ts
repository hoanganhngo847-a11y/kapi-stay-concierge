/**
 * Resolves a storage path or external URL to a public media URL.
 * Usable in both Server and Client Components.
 */
export function getStorageMediaUrl(
  path: string | null | undefined,
  bucket: "room-media" | "menu-media" = "room-media"
): string {
  if (!path) return "";
  const trimmed = path.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("/")) {
    return trimmed;
  }
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const baseUrl = supabaseUrl.replace(/\/$/, "");
  return `${baseUrl}/storage/v1/object/public/${bucket}/${trimmed.replace(/^\//, "")}`;
}
