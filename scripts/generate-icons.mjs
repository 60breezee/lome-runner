import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const iconsDir = fileURLToPath(new URL('../public/icons/', import.meta.url));
const BACKGROUND = '#181614';

const icon = await readFile(`${iconsDir}icon.svg`);
const maskable = await readFile(`${iconsDir}icon-maskable.svg`);

const outputs = [
  { source: icon, size: 192, file: 'pwa-192.png' },
  { source: icon, size: 512, file: 'pwa-512.png' },
  { source: maskable, size: 512, file: 'maskable-512.png' },
  // iOS fills transparent pixels with black and applies its own rounded mask, so the icon is flattened.
  { source: icon, size: 180, file: 'apple-touch-icon.png', flatten: true },
  { source: icon, size: 48, file: 'favicon-48.png' },
];

for (const { source, size, file, flatten } of outputs) {
  let image = sharp(source, { density: 384 }).resize(size, size);
  if (flatten) image = image.flatten({ background: BACKGROUND });
  await image.png().toFile(`${iconsDir}${file}`);
  console.log(`icons/${file} (${size}x${size})`);
}
