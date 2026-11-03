import { MEDIA_RULES, type NewMedia } from '@/services/contentServices';

/**
 * Validates picked files and turns them into LOCAL object URLs. Nothing is uploaded anywhere: the preview disappears
 * on refresh. Backend phase: send the file to POST /api/admin/media and use the returned CDN URL instead.
 */
export async function prepareUploads(files: File[]): Promise<{ items: NewMedia[]; errors: string[] }> {
  const items: NewMedia[] = [];
  const errors: string[] = [];
  for (const file of files) {
    if (!MEDIA_RULES.types.includes(file.type)) {
      errors.push(`${file.name}: unsupported file type. Use ${MEDIA_RULES.label}.`);
      continue;
    }
    if (file.size > MEDIA_RULES.maxBytes) {
      errors.push(`${file.name}: ${(file.size / 1024 / 1024).toFixed(1)} MB is over the 5 MB limit.`);
      continue;
    }
    const url = URL.createObjectURL(file);
    const dims = await imageSize(url).catch(() => null);
    if (!dims) {
      URL.revokeObjectURL(url);
      errors.push(`${file.name}: could not be read as an image.`);
      continue;
    }
    const base = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
    items.push({ url, fileName: file.name, mimeType: file.type, sizeBytes: file.size, width: dims.w, height: dims.h, alt: { en: base.charAt(0).toUpperCase() + base.slice(1), hi: '' } });
  }
  return { items, errors };
}

function imageSize(url: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = reject;
    img.src = url;
  });
}
