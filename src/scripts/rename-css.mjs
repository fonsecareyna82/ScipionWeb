import fs from "node:fs";
import path from "node:path";

function ensureDirSync(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function findFirstCssFile(outDir) {
  const candidates = [
    path.join(outDir, "style.css"),
    path.join(outDir, "assets", "style.css"),
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }

  return null;
}

function main() {
  const mode = process.argv[2];
  if (!mode) {
    throw new Error("missingModeArg");
  }

  const outDir = path.resolve(process.cwd(), "dist/umd");
  const cssPath = findFirstCssFile(outDir);

  if (!cssPath) {
    // noCssEmittedForThisMode
    return;
  }

  const stylesDir = path.join(outDir, "styles");
  ensureDirSync(stylesDir);

  const destPath = path.join(stylesDir, `${mode}-widget.css`);
  fs.copyFileSync(cssPath, destPath);

  // optionalCleanupToAvoidOverwritesInNextBuild
  try {
    fs.unlinkSync(cssPath);
  } catch {
    // noOp
  }
}

main();
