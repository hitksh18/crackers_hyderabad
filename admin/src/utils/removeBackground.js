import { removeBackground } from '@imgly/background-removal';

export async function removeImageBackground(file, onProgress) {
  const blob = await removeBackground(file, {
    output: { format: 'image/png' },
    progress: (key, current, total) => {
      if (onProgress) onProgress(key, current, total);
    },
  });

  return new File([blob], 'product.png', { type: 'image/png' });
}
