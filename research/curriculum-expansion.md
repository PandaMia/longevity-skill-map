# Curriculum expansion, version 0.2

Updated 2026-09-06. This release adds 128 nodes and 24 containers while preserving all existing node IDs. The two mastery depths are educational outcomes: understanding a topic and working on a scoped task. They are not job titles or clinical credentials.

## Requested decompositions

| Container | Components |
|---|---|
| Drug discovery and development | Target validation; hit validation; medicinal chemistry; ADME/PK/PD; preclinical safety; clinical translation. Product quality and batch release are shared dependencies. |
| Gene therapy and delivery | Expression control; viral platforms; nonviral delivery; tissue targeting; biodistribution/immunogenicity. Manufacturing quality is a shared dependency. |
| Microscopy, imaging and flow cytometry | Fluorescence microscopy; image analysis; panel design; gating; sorting. |
| Proteomics, metabolomics and lipidomics | Shared mass-spectrometry/QC foundation; proteomics; metabolomics; lipidomics. |
| iPSC, differentiation and organoids | Maintenance/QC; pluripotent reprogramming; directed differentiation; organoid models; maturation/function. |
| Transplantation immunology and xenobiology | Rejection/tolerance; immunosuppression; donor engineering; infection surveillance; preservation/perfusion; graft function; surgical research planning. |
| Immune/HSC/thymus rejuvenation | Immune phenotyping; HSC/niche; thymus; T-cell repertoire; inflammation/resolution. |
| Brain rejuvenation | Microglia; synapses/circuits; myelin; neural stem cells; neurovascular function; graft integration. |

Additional containers cover the longevity introduction, applied statistics, epigenomics, transcriptomics, single-cell/spatial omics, structural/computational chemistry, cell-aging measurements, biological-product development, healthspan, model organisms, human populations, organ-specific aging, adult reproductive aging, extracellular aggregates, adaptive physiology and aging-clock modalities.

## Added coverage and shared methods

- Organismal health: functional outcomes, frailty, reserve, resilience, lifespan design and outcome interpretation.
- Organ-specific aging: muscle, bone/joints, heart, kidneys, lungs, liver and sensory function.
- Human populations: epidemiology, longitudinal cohorts, longevity comparisons and generalizability.
- Adult reproductive aging: endocrine regulation, ovarian reserve/niche, menopause/systemic aging and male reproductive aging.
- Extracellular aggregates: amyloidoses, deposit measurement and antibody/enzyme clearance concepts.
- Dynamic physiology: stress adaptation, circadian/sleep biology, exercise and nutrition studies.
- Statistical bridges: regression/GLM, longitudinal/mixed models, survival/competing risks, multiple testing/batch effects, missingness/sensitivity.
- Practical epigenomics: methylation, ATAC-seq and ChIP-seq.
- Cellular aging: senescence/SASP, autophagy flux, mitochondrial function, DNA damage/repair, clonal/lineage inference and cell identity/function.
- Tissue and neural methods: histology/pathology, neuroimaging, electrophysiology and behavioral/cognitive assessment.
- Omics: read QC, RNA-seq design and differential analysis, single-cell QC/annotation and condition comparisons, spatial data, metagenomics and modality-specific mass spectrometry.
- Reproducible products: quality attributes, bioprocess scale-up, batch release/comparability and stability.

Research targets now require experimental design for practical work. Brain routes include relevant measurement skills. Cryobiology includes cell/tissue physiology, experimental design, transport/thermal modeling and organ-function assessment. These changes add substantive competencies rather than padding routes to a numeric length.

## Resource choices

The new materials combine conceptual courses, focused chapters and reproducible exercises:

- [Longevity Zero to One syllabus](https://www.longevitycourse.org/) and [recordings](https://www.longevitycourse.org/zuzalu): orientation and choosing a research contribution. The syllabus and recorded Zuzalu edition are complementary; lecture numbering can differ. The course also discusses speculative futures outside this biological-longevity graph.
- [R for Data Science, Chapter 3](https://r4ds.hadley.nz/data-transform.html) and [Bioconductor RNAseq123](https://bioconductor.org/packages/release/workflows/html/RNAseq123.html): close the Python-only path to an R-based RNA-seq workflow.
- [Galaxy epigenetics](https://training.galaxyproject.org/training-material/topics/epigenetics/): direct methylation, ATAC-seq and TAL1 ChIP-seq exercises, with Galaxy and read-QC prerequisites.
- [GROMACS MD tutorial](https://tutorials.gromacs.org/md-intro-tutorial.html), [free-energy tutorial](https://tutorials.gromacs.org/free-energy-of-solvation.html) and [AutoDock Vina](https://autodock-vina.readthedocs.io/en/stable/docking_basic.html): complement AlphaFold with the other techniques in computational chemistry.
- [ISSCR standards](https://www.isscr.org/basic-research-standards/): specific sections on characterization, pluripotency and model-system validation.
- [WormBook methods chapter](https://www.ncbi.nlm.nih.gov/books/NBK116075/) and [NIA ITP](https://www.nia.nih.gov/research/dab/interventions-testing-program-itp/about-itp): model-specific measurements and study design, in addition to ARRIVE reporting.
- [LIPID MAPS tutorials](https://www.lipidmaps.org/resources/education/tutorials): lipid-specific mass spectrometry and interpretation.
- [Flow cytometry and sorting guidelines](https://pmc.ncbi.nlm.nih.gov/articles/PMC11115438/) and [FlowJo exercises](https://www.flowjo.com/docs/flowjo10/getting-acquainted/learn-flowjo-now): complement the introductory iBiology lecture.
- [OpenStax Anatomy and Physiology 2e](https://openstax.org/details/books/anatomy-and-physiology-2e): direct organ-system chapters, supplemented by geroscience and outcome-focused resources.

New URL checks identified and corrected stale/incorrect paths for the causal-inference book, lipidomics tutorials and ChIP-seq tutorial. A blocked WormBook homepage was replaced by its specific NCBI chapter. Some publishers use bot challenges; HTTP success alone is not treated as evidence that a chapter teaches a complete practical competency. Existing legacy resources outside the changed areas have not all been re-audited.

## Limits and maintenance

Each practical outcome is a bounded research or analysis task. Hands-on laboratory, animal and surgical work requires the appropriate supervised training and access; this graph does not certify professional competence. Academic level and evidence maturity remain distinct from mastery depth.

The containers are curated decompositions, not an exhaustive protocol encyclopedia. Maintain shared skills once. When a downstream task needs only one part of a discipline, connect that component directly, not the whole container. Add broad optional specializations as recommended links, or expose a focused selectable component.
