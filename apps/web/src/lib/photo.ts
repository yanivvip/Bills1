import { supabase } from './supabase';

const BUCKET = 'meter-photos';

/** Where the picture of a meter for a month is kept: one file per meter and month, replaced when retaken. */
export const meterPhotoPath = (orgId: string, meterId: string, period: string) => `${orgId}/${meterId}/${period}.jpg`;

// A phone photo is several MB; shrink it to a readable but small JPEG (about 100-250 KB) before it is stored.
export async function compressImage(file: Blob, maxSide = 1280, quality = 0.7): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('compress'))), 'image/jpeg', quality));
}

export async function uploadMeterPhoto(path: string, blob: Blob): Promise<string | null> {
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { upsert: true, contentType: 'image/jpeg' });
  return error ? error.message : null;
}

/** A short-lived link to a stored picture (the bucket is private). */
export async function meterPhotoUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300);
  return error ? null : data.signedUrl;
}
