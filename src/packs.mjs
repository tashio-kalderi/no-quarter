/**
 * Build the compendium packs from their JSON sources, or write the packs back
 * out to JSON after editing them in Foundry.
 *
 *   npm run pack     src/packs/<name>/  ->  packs/<name>/
 *   npm run unpack   packs/<name>/      ->  src/packs/<name>/
 *
 * Foundry keeps a pack locked while a world using it is open, so close the
 * world (or Foundry) before running either command.
 */
import fs from 'node:fs';
import { compilePack, extractPack } from '@foundryvtt/foundryvtt-cli';

const command = process.argv[2];
const { packs } = JSON.parse(fs.readFileSync('system.json', 'utf8'));

for (const { name, path } of packs) {
  const src = `src/packs/${name}`;
  if (command === 'pack') {
    await compilePack(src, path, { recursive: true, log: true });
  } else if (command === 'unpack') {
    await extractPack(path, src, { clean: true, folders: true, log: true });
    fs.writeFileSync(`${src}/.gitkeep`, '');
  } else {
    console.error('Usage: node src/packs.mjs pack|unpack');
    process.exit(1);
  }
}
