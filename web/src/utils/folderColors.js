// Palet warna folder, satu sumber dengan server: shared/folder-colors.json
import FOLDER_COLORS from '../../../shared/folder-colors.json';

export { FOLDER_COLORS };
export const DEFAULT_FOLDER_COLOR = FOLDER_COLORS[0].hex;

export function folderColorName(hex) {
  const found = FOLDER_COLORS.find((c) => c.hex === (hex || DEFAULT_FOLDER_COLOR));
  return found ? found.name : hex;
}
