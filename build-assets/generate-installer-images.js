/**
 * Generate NSIS Installer Images
 * Creates BMP images for the NSIS wizard installer
 *
 * Requires: npm install sharp --save-dev
 * Run: node build-assets/generate-installer-images.js
 */

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const OUTPUT_DIR = path.join(__dirname);

// Brand colors
const ACCENT = { r: 217, g: 119, b: 6 };    // #d97706
const BG_DARK = { r: 13, g: 13, b: 13 };     // #0d0d0d
const BG_MID = { r: 26, g: 26, b: 26 };      // #1a1a1a

/**
 * Generate a vertical gradient buffer (raw RGBA pixels)
 */
function generateGradient(width, height, colorTop, colorBottom) {
  const buf = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    const t = y / (height - 1);
    const r = Math.round(colorTop.r + (colorBottom.r - colorTop.r) * t);
    const g = Math.round(colorTop.g + (colorBottom.g - colorTop.g) * t);
    const b = Math.round(colorTop.b + (colorBottom.b - colorTop.b) * t);
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      buf[i] = r;
      buf[i + 1] = g;
      buf[i + 2] = b;
      buf[i + 3] = 255;
    }
  }
  return buf;
}

/**
 * Draw a filled rectangle on a raw buffer
 */
function drawRect(buf, width, x, y, w, h, color) {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const px = x + dx;
      const py = y + dy;
      if (px >= 0 && px < width && py >= 0) {
        const i = (py * width + px) * 4;
        buf[i] = color.r;
        buf[i + 1] = color.g;
        buf[i + 2] = color.b;
        buf[i + 3] = 255;
      }
    }
  }
}

/**
 * Write raw RGBA buffer as a 24-bit BMP file
 * NSIS requires BMP format which sharp doesn't support
 */
function writeBmp(filePath, width, height, rgbaBuf) {
  const rowSize = Math.ceil((width * 3) / 4) * 4; // rows padded to 4-byte boundary
  const pixelDataSize = rowSize * height;
  const fileSize = 54 + pixelDataSize;

  const bmp = Buffer.alloc(fileSize);

  // BMP File Header (14 bytes)
  bmp.write('BM', 0);                    // Signature
  bmp.writeUInt32LE(fileSize, 2);         // File size
  bmp.writeUInt32LE(0, 6);               // Reserved
  bmp.writeUInt32LE(54, 10);             // Pixel data offset

  // DIB Header - BITMAPINFOHEADER (40 bytes)
  bmp.writeUInt32LE(40, 14);             // Header size
  bmp.writeInt32LE(width, 18);           // Width
  bmp.writeInt32LE(height, 22);          // Height (positive = bottom-up)
  bmp.writeUInt16LE(1, 26);              // Color planes
  bmp.writeUInt16LE(24, 28);             // Bits per pixel
  bmp.writeUInt32LE(0, 30);              // Compression (none)
  bmp.writeUInt32LE(pixelDataSize, 34);  // Image size
  bmp.writeInt32LE(2835, 38);            // X pixels per meter (~72 DPI)
  bmp.writeInt32LE(2835, 42);            // Y pixels per meter
  bmp.writeUInt32LE(0, 46);              // Colors in palette
  bmp.writeUInt32LE(0, 50);              // Important colors

  // Pixel data (bottom-up, BGR)
  for (let y = 0; y < height; y++) {
    const bmpRow = height - 1 - y; // BMP is bottom-up
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 4;
      const dstIdx = 54 + bmpRow * rowSize + x * 3;
      bmp[dstIdx] = rgbaBuf[srcIdx + 2];     // B
      bmp[dstIdx + 1] = rgbaBuf[srcIdx + 1]; // G
      bmp[dstIdx + 2] = rgbaBuf[srcIdx];     // R
    }
  }

  fs.writeFileSync(filePath, bmp);
}

/**
 * Draw accent stripe pattern on sidebar
 */
function drawAccentStripes(buf, width, height) {
  // Bottom accent bar
  drawRect(buf, width, 0, height - 4, width, 4, ACCENT);

  // Subtle accent line at 1/3
  drawRect(buf, width, 20, Math.floor(height * 0.33), width - 40, 1, {
    r: Math.floor(ACCENT.r * 0.3),
    g: Math.floor(ACCENT.g * 0.3),
    b: Math.floor(ACCENT.b * 0.3)
  });

  // Small accent dots
  const dotY = Math.floor(height * 0.65);
  for (let i = 0; i < 3; i++) {
    const dotX = 70 + i * 12;
    drawRect(buf, width, dotX, dotY, 4, 4, ACCENT);
  }
}

function generateInstallerSidebar() {
  const width = 164;
  const height = 314;

  const buf = generateGradient(width, height, BG_DARK, BG_MID);
  drawAccentStripes(buf, width, height);

  // Left accent edge
  drawRect(buf, width, 0, 0, 2, height, ACCENT);

  const outPath = path.join(OUTPUT_DIR, 'installer-sidebar.bmp');
  writeBmp(outPath, width, height, buf);
  console.log('  Generated installer-sidebar.bmp (164x314)');
}

function generateUninstallerSidebar() {
  const width = 164;
  const height = 314;

  const buf = generateGradient(width, height, BG_MID, BG_DARK);

  // Right accent edge
  drawRect(buf, width, width - 2, 0, 2, height, ACCENT);

  // Bottom bar
  drawRect(buf, width, 0, height - 4, width, 4, {
    r: Math.floor(ACCENT.r * 0.6),
    g: Math.floor(ACCENT.g * 0.6),
    b: Math.floor(ACCENT.b * 0.6)
  });

  const outPath = path.join(OUTPUT_DIR, 'uninstaller-sidebar.bmp');
  writeBmp(outPath, width, height, buf);
  console.log('  Generated uninstaller-sidebar.bmp (164x314)');
}

function generateInstallerHeader() {
  const width = 150;
  const height = 57;

  const buf = generateGradient(width, height, BG_DARK, BG_MID);

  // Top accent stripe
  drawRect(buf, width, 0, 0, width, 3, ACCENT);

  // Bottom subtle line
  drawRect(buf, width, 0, height - 1, width, 1, {
    r: Math.floor(ACCENT.r * 0.4),
    g: Math.floor(ACCENT.g * 0.4),
    b: Math.floor(ACCENT.b * 0.4)
  });

  const outPath = path.join(OUTPUT_DIR, 'installer-header.bmp');
  writeBmp(outPath, width, height, buf);
  console.log('  Generated installer-header.bmp (150x57)');
}

function main() {
  console.log('Generating NSIS installer images...');

  generateInstallerSidebar();
  generateUninstallerSidebar();
  generateInstallerHeader();

  console.log('Done!');
}

main();
