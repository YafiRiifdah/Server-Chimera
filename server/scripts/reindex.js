// Bangun ulang indeks pencarian semua user dari disk: `npm run reindex`
import { reindexAll } from '../src/indexer.js';

const result = reindexAll();
for (const [username, count] of Object.entries(result)) {
  console.log(`${username}: ${count} entri`);
}
console.log('Reindex selesai.');
