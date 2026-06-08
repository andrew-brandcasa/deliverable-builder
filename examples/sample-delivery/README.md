# Example: Sample Delivery (placeholder creatives)

A runnable example you can build **without a Figma token**, so you can see the
output immediately. "Northwind" is a made-up brand and the creatives are generic
placeholders — there's no real client work here.

Build it:
```bash
# from the repo root
npm run build:manifest -- examples/sample-delivery/manifest.json --out out/example.pdf
open out/example.pdf      # Mac  (Windows: start out/example.pdf)
```

This shows the **manifest** input shape (`manifest.json`): a title, a subtitle, and
a list of "Creative N" groups, each pointing at its image files.

The real workflow doesn't use a manifest by hand — you send a **Figma link** and the
tool reads the creatives, builds this same template, and exports the PDF. See the
top-level [README](../../README.md).
