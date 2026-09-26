/**
 * Generates the Android small notification icon.
 *
 * Android renders a notification's small icon from its ALPHA channel only —
 * colour is discarded and the shape is tinted with the channel/notification
 * `color`. Pointing the expo-notifications plugin at the full-colour launcher
 * foreground therefore rendered a rough white blob. This script turns the
 * launcher foreground's silhouette into a proper white-on-transparent 96×96
 * icon at assets/notification-icon.png.
 *
 *   node scripts/generate-notification-icon.js
 *
 * Re-run whenever near_now_shopkeeper_foreground.png changes. Review the
 * result: if the logo's silhouette is not recognisable at 24dp, replace the
 * output with a hand-drawn monochrome glyph instead.
 */
const path = require("path");
const sharp = require("sharp");

const SRC = path.join(__dirname, "..", "near_now_shopkeeper_foreground.png");
const OUT = path.join(__dirname, "..", "assets", "notification-icon.png");
const SIZE = 96;

(async () => {
  // Trim transparent padding so the glyph fills the canvas, then use the
  // alpha channel as the mask over solid white.
  const alpha = await sharp(SRC).ensureAlpha().trim().extractChannel("alpha").resize(SIZE, SIZE, {
    fit: "contain",
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  }).toBuffer();

  await sharp({
    create: { width: SIZE, height: SIZE, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .joinChannel(alpha)
    .png()
    .toFile(OUT);

  console.log(`Wrote ${path.relative(process.cwd(), OUT)} (${SIZE}x${SIZE}, white on transparent)`);
})().catch((err) => {
  console.error("Failed to generate notification icon:", err.message);
  process.exit(1);
});
