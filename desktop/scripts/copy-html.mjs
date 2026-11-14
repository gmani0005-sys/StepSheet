// Copies the repo-root single-file build (StepSheet.html) into
// desktop/dist/index.html so Tauri can bundle it as the app's frontend.
// Builds it first via `npm run build:singlefile` (apps/web) if it's missing.
import { existsSync, copyFileSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(here, "..");
const repoRoot = path.resolve(desktopRoot, "..");
const src = path.join(repoRoot, "StepSheet.html");
const distDir = path.join(desktopRoot, "dist");
const dest = path.join(distDir, "index.html");

if (!existsSync(src)) {
  console.log("StepSheet.html not found at repo root — building it via apps/web...");
  execSync("npm run build:singlefile", {
    cwd: path.join(repoRoot, "apps", "web"),
    stdio: "inherit",
  });
}

if (!existsSync(src)) {
  console.error(`Expected a built StepSheet.html at ${src} but it still doesn't exist.`);
  process.exit(1);
}

mkdirSync(distDir, { recursive: true });
copyFileSync(src, dest);
console.log(`Copied ${src} -> ${dest}`);
