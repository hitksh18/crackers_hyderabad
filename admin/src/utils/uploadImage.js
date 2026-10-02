import { removeImageBackground } from './removeBackground';
import { authFetch } from './apiClient';
import { isLocalOnlyUrl } from './storageUrls';

export async function uploadImage(file, options = {}) {
  if (!file) {
    throw new Error('No file provided');
  }

  const shouldRemoveBackground = options.removeBackground === true;
  const shouldUpscale = options.upscale !== false;
  let uploadFile = file;

  if (shouldRemoveBackground) {
    uploadFile = await removeImageBackground(file, options.onProgress);
  }

  const dir = options.dir || options.folder || 'products';
  const formData = new FormData();
  formData.append('image', uploadFile);
  formData.append('dir', dir);
  formData.append('upscale', shouldUpscale ? 'true' : 'false');
  formData.append('watermark', options.watermark !== false ? 'true' : 'false');

  // Uploads are admin-only and verified server-side; the token proves the role.
  let response;
  try {
    response = await authFetch('/api/upload', {
      method: 'POST',
      body: formData,
    });
  } catch (e) {
    throw new Error(
      `Upload request failed (${e?.message || 'network error'}). Make sure the API server is running and reachable, then retry.`
    );
  }

  if (!response.ok) {
    let message = 'Upload failed';
    try {
      const data = await response.json();
      message = data.error || message;
    } catch {
      // ignore parse errors, keep default message
    }
    throw new Error(message);
  }

  const data = await response.json();
  const url = data.url;
  if (!url || typeof url !== 'string') {
    throw new Error('Upload failed: the server returned no image URL.');
  }

  /* Homepage banners, logos and other production content need a permanent
     public URL on the Hostinger KVM server. A blob:, data:, localhost or
     root-relative URL must fail loudly here rather than being persisted and
     breaking the public site later. Pass { allowLocal: true } only for
     throwaway/local tooling. */
  if (options.allowLocal !== true && (data.local === true || isLocalOnlyUrl(url))) {
    throw new Error(
      data.warning ||
        'Upload failed: the image was not stored to permanent KVM media. Retry — a local-only URL cannot be used here.'
    );
  }

  return url;
}
