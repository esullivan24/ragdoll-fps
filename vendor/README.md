# Vendored libraries (plain builds, no CDN at runtime)

- `three.module.min.js` — three.js r165, ES-module build from
  `https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.min.js`
- `cannon-es.js` — cannon-es 0.20.0, ES-module build from
  `https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/dist/cannon-es.js`

`game.js` is itself an ES module and imports both files with relative paths, so the
page has no network dependencies and works from `file://`, a static server, or GitHub Pages.
