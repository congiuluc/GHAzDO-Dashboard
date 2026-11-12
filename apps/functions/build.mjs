import { build } from "esbuild";
import { cpSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

await build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outfile: "dist/main.js",
  sourcemap: true,
  // Injected by the Functions host at runtime.
  external: ["@azure/functions-core"],
  // Some Azure SDK dependencies use require(); provide it in the ESM bundle.
  banner: { js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);" },
  logLevel: "info",
});

if (process.argv.includes("--package")) {
  rmSync("package", { recursive: true, force: true });
  mkdirSync("package/dist", { recursive: true });
  cpSync("dist", "package/dist", { recursive: true });
  cpSync("host.json", "package/host.json");
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  writeFileSync(
    "package/package.json",
    JSON.stringify({ name: pkg.name, version: pkg.version, type: "module", main: "dist/main.js", dependencies: {} }, null, 2),
  );
  rmSync("functions.zip", { force: true });
  if (process.platform === "win32") {
    execFileSync("powershell", ["-NoProfile", "-Command", "Compress-Archive -Path package/* -DestinationPath functions.zip -Force"], { stdio: "inherit" });
  } else {
    execFileSync("zip", ["-qr", "../functions.zip", "."], { cwd: "package", stdio: "inherit" });
  }
  console.log("Created functions.zip");
}
