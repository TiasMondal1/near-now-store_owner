/**
 * Generates a properly padded adaptive icon foreground for Android.
 *
 * Android adaptive icons use a 108dp canvas but only the central 72dp
 * (66.7%) is guaranteed visible after launcher masking. This script
 * scales the source logo to fit within that safe zone and places it on
 * a white 1024x1024 canvas so nothing gets cropped.
 */

const sharp = require("sharp");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const INPUT = path.join(ROOT, "near_now_shopkeeper.png");
const OUTPUT = path.join(ROOT, "near_now_shopkeeper_foreground.png");

const CANVAS = 1024;
// Scale the artwork to the safe zone (72/108 ≈ 66.7%), with a small
// extra margin so even round-launcher masks don't clip the corners.
const SAFE_RATIO = 0.62;
const ART_SIZE = Math.round(CANVAS * SAFE_RATIO); // ~636px
const PADDING = Math.floor((CANVAS - ART_SIZE) / 2); // ~194px each side

async function main() {
  const resized = await sharp(INPUT)
    .resize(ART_SIZE, ART_SIZE, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .toBuffer();

  await sharp({
    create: {
      width: CANVAS,
      height: CANVAS,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 255 },
    },
  })
    .composite([{ input: resized, top: PADDING, left: PADDING }])
    .png()
    .toFile(OUTPUT);

  console.log(`Generated: ${OUTPUT}`);
  console.log(`  Canvas: ${CANVAS}x${CANVAS}`);
  console.log(`  Art size: ${ART_SIZE}x${ART_SIZE} (${SAFE_RATIO * 100}% of canvas)`);
  console.log(`  Padding: ${PADDING}px on each side`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
