// Uploaded files are stored on the backend's local disk and come back as
// absolute URLs (http://<backend>/uploads/...), so this just passes them through.
export function resolveUploadUrl(url) {
  return url || null;
}
