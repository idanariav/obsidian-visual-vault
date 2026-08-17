import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";
import { copyToVault } from "./scripts/copy-to-vault.mjs";

const prod = process.argv[2] === "production";

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian", "electron", ...builtins],
  format: "cjs",
  target: "es2018",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  minify: prod,
  outfile: "main.js",
  define: {
    "process.env.NODE_ENV": JSON.stringify(prod ? "production" : "development"),
  },
  plugins: [
    {
      name: "copy-to-vault",
      setup(build) {
        build.onEnd((result) => {
          if (result.errors.length === 0) copyToVault();
        });
      },
    },
  ],
});

if (prod) {
  await context.rebuild();
  process.exit(0);
} else {
  await context.watch();
}
