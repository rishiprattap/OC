// Metro in SDK 54 passes file paths; the patched parser accepts byte buffers.
// This build-only adapter retains that calling convention without the old parsers.
const fs = require('node:fs');
const core = require('image-size-core');
function imageSize(input) {
  return core.imageSize(typeof input === 'string' ? fs.readFileSync(input) : input);
}
module.exports = Object.assign(imageSize, core);
module.exports.default = imageSize;
module.exports.imageSize = imageSize;
