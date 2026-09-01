import { writeZip } from "./zip.js";

const PRIVATE_PROSE =
  "The private atlas names a hidden city and contains text that must not survive sanitization.";

export function getSyntheticPrivateProse(): string {
  return PRIVATE_PROSE;
}

export function createSyntheticPublication(): Buffer {
  const packageDocument = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">urn:isbn:9780000000420</dc:identifier>
    <dc:title>The Private Atlas</dc:title>
    <dc:creator>Ada Confidential</dc:creator>
    <dc:publisher>Private House</dc:publisher>
    <dc:description>${PRIVATE_PROSE}</dc:description>
    <meta property="dcterms:modified">2026-08-30T00:00:00Z</meta>
    <meta name="cover" content="cover" />
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav" />
    <item id="css" href="styles.css" media-type="text/css" />
    <item id="cover" href="cover.svg" media-type="image/svg+xml" properties="cover-image" />
    <item id="chapter-1" href="chapter-1.xhtml" media-type="application/xhtml+xml" />
    <item id="chapter-2" href="chapter-2.xhtml" media-type="application/xhtml+xml" />
    <item id="chapter-3" href="chapter-3.xhtml" media-type="application/xhtml+xml" />
    <item id="notes" href="notes.xhtml" media-type="application/xhtml+xml" />
    <item id="script" href="tracker.js" media-type="text/javascript" />
  </manifest>
  <spine>
    <itemref idref="chapter-1" />
    <itemref idref="chapter-2" />
    <itemref idref="chapter-3" />
    <itemref idref="notes" linear="no" />
  </spine>
</package>`;

  const nav = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <head><title>Private navigation</title></head>
  <body>
    <nav epub:type="toc" id="toc">
      <h1>Contents</h1>
      <ol>
        <li><a href="chapter-1.xhtml#chapter-1">A private beginning</a></li>
        <li><a href="chapter-2.xhtml#target%20section">The fragile target</a></li>
        <li><a href="chapter-3.xhtml#chapter-3">A private ending</a></li>
        <li><a href="notes.xhtml#notes">Private notes</a></li>
      </ol>
    </nav>
  </body>
</html>`;

  const chapter = (number: number, body: string) => `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <title>Private chapter ${number}</title>
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <h1 id="chapter-${number}">Private Chapter ${number}</h1>
    ${body}
  </body>
</html>`;

  const entries = [
    { path: "mimetype", data: Buffer.from("application/epub+zip") },
    {
      path: "META-INF/container.xml",
      data: Buffer.from(`<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml" /></rootfiles>
</container>`),
    },
    { path: "EPUB/package.opf", data: Buffer.from(packageDocument) },
    { path: "EPUB/nav.xhtml", data: Buffer.from(nav) },
    {
      path: "EPUB/styles.css",
      data: Buffer.from(`body { color: #171717; font-family: serif; }
h1 { letter-spacing: .02em; }
.private-ad { background-image: url("https://private.example/cover.jpg"); }
.unused { border: 20px solid tomato; }
`),
    },
    {
      path: "EPUB/chapter-1.xhtml",
      data: Buffer.from(chapter(1, `<p>${PRIVATE_PROSE}</p><p class="unused">Unrelated opening material.</p>`)),
    },
    {
      path: "EPUB/chapter-2.xhtml",
      data: Buffer.from(
        chapter(
          2,
          `<p>${PRIVATE_PROSE}</p>
    <p class="private-ad" onclick="fetch('https://private.example/track')">Remote private material.</p>
    <h2 id="target section">Critical Target</h2>
    <p>The intended target is below the chapter heading.</p>
    <script src="tracker.js"></script>`,
        ),
      ),
    },
    {
      path: "EPUB/chapter-3.xhtml",
      data: Buffer.from(chapter(3, `<p>${PRIVATE_PROSE}</p><p>Unrelated closing material.</p>`)),
    },
    {
      path: "EPUB/notes.xhtml",
      data: Buffer.from(`<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><body><h1 id="notes">Private Notes</h1><p>${PRIVATE_PROSE}</p></body></html>`),
    },
    {
      path: "EPUB/cover.svg",
      data: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><rect width="600" height="900" fill="#0f172a"/><text x="40" y="90" fill="white">The Private Atlas</text></svg>`),
    },
    {
      path: "EPUB/tracker.js",
      data: Buffer.from(`fetch("https://private.example/reader-event?title=The%20Private%20Atlas");`),
    },
  ];

  return writeZip(entries);
}
