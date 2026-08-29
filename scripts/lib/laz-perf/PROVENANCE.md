# Vendored laz-perf 0.0.7

3DEP publishes its point clouds as LAZ and nothing else: every EPT collection in
`usgs-lidar-public` declares `dataType: "laszip"`, and the staged source tiles
behind them end `/LAZ/*.laz`. LAZ is a per-field adaptive arithmetic coder, so a
reader is a range decoder plus a context-modelled compressor per item type, with
no partial credit: any bit-level disagreement yields wrong coordinates instead of
an error. These 295 KB replace that.

Nothing is installed. `scripts/lib/laz.mjs` loads `laz-perf.js` by path through
`createRequire`, so `package.json` gains no dependency and the bake stays
runnable with the network unplugged.

| File | Bytes | sha256 |
|---|---|---|
| `laz-perf.js` | 87,622 | `ea59e473c89a0d02eda39e1bb414badb3b2c5e87af80a56727cbef6bb481ab5d` |
| `laz-perf.wasm` | 214,351 | `9c1802bc31b567dd4aa1ce9ab010e7e51e095dc42af8379b474ae6f221a9327f` |
| `COPYING` | 11,347 | `959f77033ba56a3b146faf5c02f9162071f2d0bff4b8b6f1c2193a4b41127d39` |

`laz-perf.js` and `laz-perf.wasm` are `lib/node/` from the npm tarball
`https://registry.npmjs.org/laz-perf/-/laz-perf-0.0.7.tgz` (390,806 bytes,
sha256 `7585aa5e425443c639a2580548ebb8c3eed3124bacd7eebbf3ab0fbde2d8e0c4`,
published 2025-02-19, zero runtime dependencies). The package's own
`lib/node/index.js` is a four-line re-export shim and is not vendored;
`laz-perf.js` already sets `module.exports = createLazPerf`.

`COPYING` is the upstream licence,
`https://raw.githubusercontent.com/hobuinc/laz-perf/master/COPYING`, Apache-2.0,
matching the `license` field of the published package. Copyright is Howard
Butler, Uday Verma and the laz-perf contributors; see the file.

Both source archives and the fetch log are under `.tmp/lidar-research/vendor/`
and `.tmp/lidar-research/raw/provenance.tsv`.

`tests/layline-scenery-ingest.test.ts` re-hashes all three files on every run, so
a byte that moves fails the suite. `.gitattributes` marks them `-text`: this
checkout runs `core.autocrlf=true` and `laz-perf.js` is minified with LF
newlines, which git would otherwise rewrite on checkout and break the hash.
