/**
 * Генерирует вертикальный макет: сверху QR-код, снизу логотип (683×1366).
 * @example node scripts/generate-qr.mjs
 */
import QRCode from 'qrcode';
import sharp from 'sharp';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const URL = 'https://tuleneva25.ru';
/** Ширина и высота верхней/нижней панели в пикселях. */
const PANEL_SIZE = 683;
/** Растеризация логотипа (чёткость при печати). */
const LOGO_NATIVE_SIZE = 2048;
/** Тихая зона QR в модулях (минимум 4 по спецификации). */
const MARGIN_MODULES = 4;

/**
 * Рендерит логотип на нижнюю панель с сохранением пропорций.
 * @param {string} svgPath
 * @param {number} panelPx - Сторона панели в пикселях
 * @returns {Promise<Buffer>}
 */
async function renderLogoPanel(svgPath, panelPx) {
  const nativeLogo = await sharp(svgPath)
    .resize(LOGO_NATIVE_SIZE, LOGO_NATIVE_SIZE, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 0 },
    })
    .png()
    .toBuffer();

  const trimmedLogo = await sharp(nativeLogo)
    .trim({ threshold: 8 })
    .png()
    .toBuffer();

  return sharp(trimmedLogo)
    .resize(panelPx, panelPx, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .png()
    .toBuffer();
}

/**
 * Рендерит матрицу QR в PNG panelSize×panelSize.
 * @param {import('qrcode').QRCodeCreateResult} qrData
 * @param {number} panelSize
 * @param {number} marginModules
 * @returns {Promise<Buffer>}
 */
async function renderQrMatrix(qrData, panelSize, marginModules) {
  const modules = qrData.modules;
  const n = modules.size;
  const total = n + marginModules * 2;
  const cellSize = panelSize / total;
  const pixels = Buffer.alloc(panelSize * panelSize * 4);

  for (let y = 0; y < panelSize; y += 1) {
    for (let x = 0; x < panelSize; x += 1) {
      const col = Math.floor(x / cellSize) - marginModules;
      const row = Math.floor(y / cellSize) - marginModules;
      let dark = false;
      if (row >= 0 && row < n && col >= 0 && col < n) {
        dark = modules.get(row, col);
      }
      const value = dark ? 0 : 255;
      const idx = (y * panelSize + x) * 4;
      pixels[idx] = value;
      pixels[idx + 1] = value;
      pixels[idx + 2] = value;
      pixels[idx + 3] = 255;
    }
  }

  return sharp(pixels, { raw: { width: panelSize, height: panelSize, channels: 4 } }).png().toBuffer();
}

/**
 * Проверяет декодирование QR в верхней части составного изображения.
 * @param {Buffer} pngBuffer
 * @param {number} qrSize - Высота/ширина области QR
 * @param {string} expectedUrl
 * @returns {Promise<string|null>}
 */
async function decodeQrRegion(pngBuffer, qrSize, expectedUrl) {
  const cropped = await sharp(pngBuffer)
    .extract({ left: 0, top: 0, width: qrSize, height: qrSize })
    .png()
    .toBuffer();
  const png = PNG.sync.read(cropped);
  const result = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  return result?.data === expectedUrl ? result.data : result?.data ?? null;
}

const qrData = QRCode.create(URL, { errorCorrectionLevel: 'H' });

const qrBuffer = await renderQrMatrix(qrData, PANEL_SIZE, MARGIN_MODULES);
const logoPanel = await renderLogoPanel(join(root, 'public/logo_main512.svg'), PANEL_SIZE);

const result = await sharp({
  create: {
    width: PANEL_SIZE,
    height: PANEL_SIZE * 2,
    channels: 4,
    background: { r: 255, g: 255, b: 255, alpha: 1 },
  },
})
  .composite([
    { input: qrBuffer, top: 0, left: 0 },
    { input: logoPanel, top: PANEL_SIZE, left: 0 },
  ])
  .png()
  .toBuffer();

const outPath = join(root, 'public/qr-tuleneva25.png');
await writeFile(outPath, result);

const decoded = await decodeQrRegion(result, PANEL_SIZE, URL);
if (decoded !== URL) {
  console.error(`Декодирование не прошло. Получено: ${decoded ?? 'null'}`);
  process.exit(1);
}

const meta = await sharp(result).metadata();
console.log(`Saved: ${outPath} (${meta.width}x${meta.height})`);
console.log(`Layout: QR ${PANEL_SIZE}px сверху, логотип ${PANEL_SIZE}px снизу`);
console.log(`QR version: ${qrData.version}, modules: ${qrData.modules.size}x${qrData.modules.size}`);
console.log(`Decoded OK: ${decoded}`);
