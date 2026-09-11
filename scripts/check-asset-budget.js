const fs = require('fs');
const path = require('path');

const appRoot = path.resolve(__dirname, '..');
const assetRoot = path.join(appRoot, 'src', 'assets');
const sourceRoot = path.join(appRoot, 'src');
const iosNativeAssetRoot = path.join(appRoot, 'ios', 'FormBae', 'Images.xcassets');
const androidNativeAssetRoot = path.join(appRoot, 'android', 'app', 'src', 'main', 'res');
// Requested rotating library: 24 editorial photos, 18 scorecard thumbnails, 6 action thumbnails, 2 journal images and 84 SVGs.
// Individual raster cap stays unchanged; no originals are bundled.
const sharedAssetBudgetBytes = 5_300_000;
const iosRasterBudgetBytes = 5_850_000;
const androidRasterBudgetBytes = 5_600_000;
const singleRasterBudgetBytes = 220_000;

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

function megabytes(bytes) {
  return `${(bytes / 1_000_000).toFixed(2)} MB`;
}

const assetFiles = walk(assetRoot);
const rasterFiles = assetFiles.filter(file => /\.(?:jpe?g|png|webp)$/i.test(file));
const sharedBytes = assetFiles.reduce((sum, file) => sum + fs.statSync(file).size, 0);
const iosNativeRasters = walk(iosNativeAssetRoot).filter(file => /\.(?:jpe?g|png|webp)$/i.test(file));
const androidNativeRasters = walk(androidNativeAssetRoot).filter(file => /\.(?:jpe?g|png|webp)$/i.test(file));
const iosRasterBytes = sharedBytes + iosNativeRasters.reduce((sum, file) => sum + fs.statSync(file).size, 0);
const androidRasterBytes = sharedBytes + androidNativeRasters.reduce((sum, file) => sum + fs.statSync(file).size, 0);
const oversized = rasterFiles.filter(
  file => fs.statSync(file).size > singleRasterBudgetBytes,
);

const sourceText = walk(sourceRoot)
  .filter(file => /\.[jt]sx?$/.test(file) && !/\.(?:test|spec)\.[jt]sx?$/.test(file))
  .map(file => fs.readFileSync(file, 'utf8'))
  .join('\n');
const unreferenced = rasterFiles.filter(
  file => !sourceText.includes(path.basename(file)),
);

const failures = [];
if (sharedBytes > sharedAssetBudgetBytes) {
  failures.push(
    `Shared asset directory is ${megabytes(sharedBytes)}; budget is ${megabytes(sharedAssetBudgetBytes)}.`,
  );
}
if (iosRasterBytes > iosRasterBudgetBytes) {
  failures.push(`iOS raster payload is ${megabytes(iosRasterBytes)}; budget is ${megabytes(iosRasterBudgetBytes)}.`);
}
if (androidRasterBytes > androidRasterBudgetBytes) {
  failures.push(`Android raster payload is ${megabytes(androidRasterBytes)}; budget is ${megabytes(androidRasterBudgetBytes)}.`);
}
if (oversized.length > 0) {
  failures.push(
    `Raster files over ${megabytes(singleRasterBudgetBytes)}:\n${oversized
      .map(file => `  - ${path.relative(appRoot, file)} (${megabytes(fs.statSync(file).size)})`)
      .join('\n')}`,
  );
}
if (unreferenced.length > 0) {
  failures.push(
    `Unreferenced raster files:\n${unreferenced
      .map(file => `  - ${path.relative(appRoot, file)}`)
      .join('\n')}`,
  );
}

if (failures.length > 0) {
  console.error(failures.join('\n\n'));
  process.exitCode = 1;
} else {
  console.log(
    `Asset budget passed: ${rasterFiles.length} shared rasters (${megabytes(sharedBytes)}), `
      + `iOS ${megabytes(iosRasterBytes)}, Android ${megabytes(androidRasterBytes)}.`,
  );
}
