// Browser-side image upload shared by the admin editor and the on-page edit mode.
const MAX_BYTES = 3 * 1024 * 1024;

/** Shrinks photos to at most 1920px wide JPEG before upload; GIFs are sent as-is. */
async function prepare(file: File): Promise<{ name: string; blob: Blob }> {
  if (file.type === 'image/gif') return { name: file.name, blob: file };
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1920 / bitmap.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.85));
  return { name: file.name.replace(/\.[^.]+$/, '') + '.jpg', blob };
}

const toBase64 = (blob: Blob) => new Promise<string>((resolve) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(',')[1]);
  reader.readAsDataURL(blob);
});

/**
 * Uploads an image and returns its site URL plus a local object URL for previewing it
 * before the next deploy makes the real URL live. Throws an Error with a readable message.
 */
export async function uploadImage(file: File): Promise<{ url: string; preview: string }> {
  const { name, blob } = await prepare(file);
  if (blob.size > MAX_BYTES) throw new Error('图片太大了（压缩后不能超过 3 MiB，GIF 需先压缩）');
  const res = await fetch('/api/admin/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, data: await toBase64(blob) }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error ?? '上传失败');
  return { url: out.url, preview: URL.createObjectURL(blob) };
}
