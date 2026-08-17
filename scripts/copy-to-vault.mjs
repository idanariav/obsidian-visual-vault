import fs from "node:fs";
import path from "node:path";

const DEFAULT_VAULT_PLUGIN_DIR =
  "/Users/idanariav/GitProjects/Obsidian_Vault/.obsidian/plugins/visual-vault";

const targetDir = process.env.OBSIDIAN_VAULT_PLUGIN_DIR ?? DEFAULT_VAULT_PLUGIN_DIR;

const FILES = ["main.js", "manifest.json", "styles.css"];

export function copyToVault() {
  const existing = fs.existsSync(targetDir) ? fs.lstatSync(targetDir) : null;
  if (existing?.isSymbolicLink()) {
    fs.unlinkSync(targetDir);
  }
  fs.mkdirSync(targetDir, { recursive: true });

  for (const file of FILES) {
    if (fs.existsSync(file)) {
      fs.copyFileSync(file, path.join(targetDir, file));
    }
  }
  console.log(`[copy-to-vault] synced ${FILES.join(", ")} -> ${targetDir}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  copyToVault();
}
