import { readFileSync, writeFileSync } from "node:fs";
import { render } from "pele";
const css = readFileSync(new URL("./theme.css", import.meta.url), "utf8");
for (const [mmd, svgPath] of process.argv.slice(2).reduce((a, x, i, all) => (i % 2 ? a : [...a, [x, all[i + 1]]]), [])) {
  const { svg } = render(readFileSync(mmd, "utf8"), { limit: 1_000_000, outputLimit: 8_000_000, maxEdges: 10_000 });
  writeFileSync(svgPath, svg.replace(/(<svg[^>]*>)/, `$1<style>${css}</style>`));
  console.log("wrote", svgPath);
}
