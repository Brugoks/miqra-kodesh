import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

const SOURCE_IMAGE = '/Users/markquiambao/.gemini/antigravity-ide/brain/bd2be9d6-ec9e-4940-8e12-93fc4cf870b0/miqra_icon_d_unity_halo_1784093034923.png';
const PUBLIC_DIR = path.resolve('public');

async function main() {
  try {
    if (!fs.existsSync(SOURCE_IMAGE)) {
      console.error(`Source image not found: ${SOURCE_IMAGE}`);
      process.exit(1);
    }

    console.log('Generating icons from:', SOURCE_IMAGE);

    // The generated image contains a squircle with some light gray padding.
    // We want to crop it to just the squircle to make it a perfect, clean icon.
    // The squircle is centered. Let's extract the central 70% of the image to remove the gray border.
    // A 1024x1024 image cropped to 720x720 from center (x: 152, y: 152) will capture the squircle.
    const cropSize = 720;
    const cropOffset = Math.floor((1024 - cropSize) / 2);

    // Ensure public folder exists
    if (!fs.existsSync(PUBLIC_DIR)) {
      fs.mkdirSync(PUBLIC_DIR, { recursive: true });
    }

    // 1. Generate icon-192.png
    await sharp(SOURCE_IMAGE)
      .extract({ left: cropOffset, top: cropOffset, width: cropSize, height: cropSize })
      .resize(192, 192)
      .toFile(path.join(PUBLIC_DIR, 'icon-192.png'));
    console.log('Generated icon-192.png');

    // 2. Generate icon-512.png
    await sharp(SOURCE_IMAGE)
      .extract({ left: cropOffset, top: cropOffset, width: cropSize, height: cropSize })
      .resize(512, 512)
      .toFile(path.join(PUBLIC_DIR, 'icon-512.png'));
    console.log('Generated icon-512.png');

    // 3. Generate apple-touch-icon.png
    await sharp(SOURCE_IMAGE)
      .extract({ left: cropOffset, top: cropOffset, width: cropSize, height: cropSize })
      .resize(180, 180)
      .toFile(path.join(PUBLIC_DIR, 'apple-touch-icon.png'));
    console.log('Generated apple-touch-icon.png');

    // 4. Generate a standard favicon.png for browser tabs
    await sharp(SOURCE_IMAGE)
      .extract({ left: cropOffset, top: cropOffset, width: cropSize, height: cropSize })
      .resize(32, 32)
      .toFile(path.join(PUBLIC_DIR, 'favicon.png'));
    console.log('Generated favicon.png');

    console.log('All icons generated successfully!');
  } catch (error) {
    console.error('Error generating icons:', error);
  }
}

main();
