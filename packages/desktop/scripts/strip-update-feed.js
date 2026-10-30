const fs = require("fs");
const path = require("path");

// Chains the repo afterPack, then strips the update feed so the fork can
// never self-update to stock Paseo (fleet ruling: ideaPad 0.12/0.13 images
// ship feed-less; electron-builder otherwise infers getpaseo/paseo github
// from the repository field and writes resources/app-update.yml).
const original = require("./after-pack.js").default;

module.exports = async function (context) {
  await original(context);
  const yml = path.join(context.appOutDir, "resources", "app-update.yml");
  if (fs.existsSync(yml)) {
    fs.rmSync(yml);
    console.log(`[strip-update-feed] removed ${yml}`);
  }
};
