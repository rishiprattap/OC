// Small per-instance cache; not a shared CDN cache. Never used for private records.
const entries = new Map();
let generation = 0;
function clear() { generation++; entries.clear(); }
async function read(key, loader) {
  const existing = entries.get(key);
  if (existing && existing.expires > Date.now()) return existing.promise;
  const version = generation;
  const entry = { expires: Date.now() + 15000 };
  entry.promise = Promise.resolve().then(loader).then(value => {
    if (generation !== version || Buffer.byteLength(JSON.stringify(value ?? null)) > 1024 * 1024) {
      if (entries.get(key) === entry) entries.delete(key);
    }
    return value;
  }).catch(err => { if (entries.get(key) === entry) entries.delete(key); throw err; });
  if (entries.size >= 32) entries.delete(entries.keys().next().value);
  entries.set(key, entry);
  return entry.promise;
}
module.exports = { read, clear };
