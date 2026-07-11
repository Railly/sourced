# Third-party notices

## DDInter v1 bulk snapshot

`data/sources/ddinter/` contains the eight files published on DDInter's official download page and remains subject to the Creative Commons Attribution-NonCommercial-ShareAlike 4.0 license. It is not relicensed under the repository's MIT license.

- Project paper: https://pmc.ncbi.nlm.nih.gov/articles/PMC8728114/
- DOI: https://doi.org/10.1093/nar/gkab880
- Official download page: https://ddinter.scbdd.com/download/
- Official terms: https://ddinter.scbdd.com/terms/
- License: https://creativecommons.org/licenses/by-nc-sa/4.0/
- Integrity and coverage manifest: `data/sources/ddinter/manifest.json`

DDInter citation:

> Xiong G, Yang Z, Yi J, et al. DDInter: an online drug-drug interaction database towards improving clinical decision-making and patient safety. Nucleic Acids Research. 2022;50(D1):D1200-D1207. doi:10.1093/nar/gkab880.

The bundled snapshot is used for a non-commercial hackathon demonstration. The official host certificate was expired at retrieval, so the files were downloaded directly from that host with certificate verification bypassed and then pinned by SHA-256 in the manifest. Commercial users must review the DDInter license and obtain any permissions their use requires.
