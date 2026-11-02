import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Palet warna folder dibagi dengan frontend lewat shared/folder-colors.json.
// Dibaca dengan readFileSync (bukan `import ... with {type:'json'}`) agar tidak
// memicu ExperimentalWarning di Node 20/22.
const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../shared/folder-colors.json');

/** @type {{hex: string, name: string}[]} */
export const FOLDER_COLORS = JSON.parse(fs.readFileSync(file, 'utf8'));
