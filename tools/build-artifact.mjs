/* index.html'deki tüm CSS ve JS'i tek dosyaya gömer.
 *
 * Çıktı dist/artifact.html — harici istek yapmadan çalışır, dolayısıyla
 * katı CSP altında (Artifact olarak yayınlandığında) da açılır.
 *
 * Kullanım: node tools/build-artifact.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

let html = read("index.html");

// <link rel="stylesheet" href="..."> -> <style>…</style>
html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (_, href) =>
  `<style>\n${read(href)}\n</style>`
);

// <script src="..."></script> -> <script>…</script>
html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, src) =>
  `<script>\n${read(src)}\n</script>`
);

if (/<link rel="stylesheet"|<script src=/.test(html)) {
  console.error("Gömülemeyen harici kaynak kaldı — çıktı CSP altında çalışmayabilir.");
  process.exit(1);
}

mkdirSync(join(root, "dist"), { recursive: true });
writeFileSync(join(root, "dist/artifact.html"), html);
console.log(`dist/artifact.html yazıldı — ${(html.length / 1024).toFixed(1)} KB`);
