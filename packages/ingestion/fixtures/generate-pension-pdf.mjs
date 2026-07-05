// Generates fixtures/pension-annual-report.pdf — synthetic Hebrew annual pension report.
// Lines are written in VISUAL order (token order reversed; Hebrew token chars reversed)
// so the PDF displays correctly while extraction yields the real-world RTL artifact.
import fontkit from "@pdf-lib/fontkit";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument, rgb } from "pdf-lib";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));

const HEB = /[֐-׿]/;
const toVisual = (line) =>
  line
    .split(/(\s+)/)
    .reverse()
    .map((tok) => (HEB.test(tok) ? [...tok].reverse().join("") : tok))
    .join("");

const LINES = [
  "דוח שנתי לעמית לשנת 2025",
  "מבטחת סינתטית בעמ - קרן פנסיה מקיפה",
  "שם עמית: ישראל ישראלי",
  "מספר עמית: 987654",
  "סוג מוצר: קרן פנסיה מקיפה",
  "יתרת צבירה: 415,230.50 שח",
  "נכון לתאריך: 31/12/2025",
  "דמי ניהול מצבירה: 0.22%",
  "דמי ניהול מהפקדה: 1.49%",
  "מסלול השקעה: כללי ב",
];

const fontPath = join(
  dirname(require.resolve("@fontsource/noto-sans-hebrew/package.json")),
  "files",
  "noto-sans-hebrew-hebrew-400-normal.woff",
);

const doc = await PDFDocument.create();
doc.registerFontkit(fontkit);
const font = await doc.embedFont(readFileSync(fontPath));
const page = doc.addPage([595, 842]);
let y = 780;
for (const line of LINES) {
  const visual = toVisual(line);
  const width = font.widthOfTextAtSize(visual, 14);
  page.drawText(visual, { x: 595 - 60 - width, y, size: 14, font, color: rgb(0.1, 0.1, 0.1) });
  y -= 28;
}
writeFileSync(join(here, "pension-annual-report.pdf"), await doc.save());
console.log("generated pension-annual-report.pdf");
