# OCI homepage asset prep — provenance

All items fetched by direct HTTPS or generated locally into this prep dir only.

| artifact | source URL | license | bytes |
|---|---|---|---|
| vendor/three.module.js | https://cdn.jsdelivr.net/npm/three@0.178.0/build/three.module.js | MIT | 600051 |
| vendor/three.core.js | https://cdn.jsdelivr.net/npm/three@0.178.0/build/three.core.js | MIT | 1389353 |
| vendor/LICENSE-threejs.txt | https://raw.githubusercontent.com/mrdoob/three.js/dev/LICENSE | MIT | 1081 |
| fonts/instrumentsans/InstrumentSans[wdth,wght].ttf | https://raw.githubusercontent.com/google/fonts/main/ofl/instrumentsans/InstrumentSans%5Bwdth%2Cwght%5D.ttf | OFL-1.1 | 194336 |
| fonts/instrumentsans/InstrumentSans-Italic[wdth,wght].ttf | https://raw.githubusercontent.com/google/fonts/main/ofl/instrumentsans/InstrumentSans-Italic%5Bwdth%2Cwght%5D.ttf | OFL-1.1 | 202128 |
| fonts/instrumentsans/OFL.txt | https://raw.githubusercontent.com/google/fonts/main/ofl/instrumentsans/OFL.txt | OFL-1.1 | 4403 |
| fonts/ibmplexmono/IBMPlexMono-Regular.ttf | https://raw.githubusercontent.com/google/fonts/main/ofl/ibmplexmono/IBMPlexMono-Regular.ttf | OFL-1.1 | 135580 |
| fonts/ibmplexmono/IBMPlexMono-Medium.ttf | https://raw.githubusercontent.com/google/fonts/main/ofl/ibmplexmono/IBMPlexMono-Medium.ttf | OFL-1.1 | 136704 |
| fonts/ibmplexmono/OFL.txt | https://raw.githubusercontent.com/google/fonts/main/ofl/ibmplexmono/OFL.txt | OFL-1.1 | 4456 |
| images/hero-source.png | generated locally — Playwright chromium, canvas 2D, 1000x560, bezier facade bands + grain | original work, rights-clean | 1087767 |
| images/hero-source-alt.png | generated locally — same technique, diagonal-towers composition | original work, rights-clean | 1108257 |

Three.js revision note: site bundle bNZcloly.js carries no REVISION token (minified/tree-shaken;
all 41 chunks under .tmp/oci-chunks scanned). Fingerprints: useLegacyLights absent (>=r165);
NeutralToneMapping + AgXToneMapping + BatchedMesh present (>=r162); vue 3.5.21 / vue-router 4.5.1
build era (~mid-2025) => targeted r178; npm three@0.178.0 fetched exactly from jsDelivr.

Deviations: (1) exact site revision not recoverable from minified bundle — r178 chosen by
fingerprint bounds + build-date correlation, recorded here per brief. (2) since r171 three ships a
split build: three.module.js is an entry re-exporting ./three.core.js — both files staged so the
vendor dir is self-contained (combined ~1.99 MB).
