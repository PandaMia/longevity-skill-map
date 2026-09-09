# Curriculum expansion

Updated 2026-09-08. The map contains 278 nodes, 1,053 relationships and 32 containers. Existing node IDs and specializations are preserved. The two mastery depths are educational outcomes: understanding a topic and working on a scoped task. They are not job titles or clinical credentials.

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

### Additional methods and database skills

The latest additions comprise 40 nodes, including seven containers. Bayesian and time-series skills extend the existing applied-statistics container.

| Area | Components |
|---|---|
| Virology | Viral structure and replication; host interactions; persistence and aging; assay interpretation. |
| Transposable elements | Mobile genetic elements → epigenetic silencing → repetitive-sequence analysis → senescence and inflammatory responses. |
| Gene networks | Coexpression; regulatory-network inference; modules and topology; validation and uncertainty; comparisons across aging states. |
| Longevity databases | Gene evidence; identifiers and pathways; public omics; human cohorts; genetic combinations; trial registries. |
| SQL and research data | Relational schemas; queries and joins; reproducible ingestion and provenance. |
| Applied statistics | Bayesian inference; model checking; time-series analysis; physiological time series. |
| Physical aging models | Thermodynamics and information; stochastic dynamics; critical transitions and resilience; mortality laws. |
| Aging theories | Evolutionary explanations; mechanistic hypotheses; discrimination through testable predictions. |

Virology components connect to viral delivery and infection surveillance in xenotransplantation. Practical transposon research requires repeat analysis, senescence measurements, experimental design and causal inference. Recommended links connect other new methods to existing specializations without making every neighboring discipline a mandatory prerequisite.

## Resource choices

### ECM and germline coverage check (2026-09-07)

ECM was already represented by `extracellular_matrix_biology`, `ecm_crosslinks_fibrosis` and `matrix_mechanics_measurement`; no duplicate nodes were needed. The existing `reproductive_germline_rejuvenation` target now contains two focused components:

- `oocyte_proteostasis_renewal`: interpreting protein-aggregate clearance in oocytes, with shared prerequisites in proteostasis, developmental biology, flux measurement and image analysis.
- `germline_proteostasis_somatic_transfer`: testing transferability to somatic cells, with additional requirements for cell culture, experimental design and functional validation. Its `speculative` status refers to rejuvenation through this strategy.

The sources separate the [C. elegans lysosomal switch (2017)](https://pubmed.ncbi.nlm.nih.gov/29168500/) from [mouse ELVAs (2024)](https://doi.org/10.1016/j.cell.2024.01.031). The latter study produced RUFY1 compartments in HeLa cells without 20S proteasome recruitment. A [worm genetic screen (2021)](https://elifesciences.org/articles/62653) connects germline regulators with somatic proteostasis; neither result establishes functional rejuvenation by transferring the full mechanism.

A [human-oocyte study (2025)](https://pmc.ncbi.nlm.nih.gov/articles/PMC12361380/) found aggregates in enlarged lysosomes and reduced proteolytic activity with maturation. A [mouse Psma7 study (2026)](https://pmc.ncbi.nlm.nih.gov/articles/PMC13373198/) adds genetic evidence for proteasome involvement in oocyte clearance. The nodes retain the species distinctions and require separate evidence for aggregate degradation and functional improvement.

The broad germline target requires the clearance component. Somatic transfer remains independently selectable and connects to general intracellular damage clearance through a non-prerequisite relationship.

### Existing curriculum resources

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
- [Computational Biology of Aging](https://computationalaginglab.github.io/computational_aging_course/intro.html): specific chapters and practicals for aging biology, differential expression, methylation, survival analysis, aging clocks, WGCNA, complex systems and resilience. Advanced survival ML and deep-learning exercises are optional extensions with preparation requirements stated.
- [AGCT data-analysis school syllabus](https://openlongevity.org/agctschool) and [video lectures](https://www.youtube.com/playlist?list=PLGmnY2BPH1JJzDnA2c7dy7jkncp4iqquK): expression, methylation, gene networks, graph algorithms, pathway enrichment, clustering and population genetics. Resources identify relevant lectures and use verified individual video links where available.

Russian-language materials retain their original titles and display RU labels:

- [Биология старения — Тимофей Глинин](https://stepik.org/course/127124/promo), after introductory molecular biology and genetics.
- [Молекулярная биология и генетика](https://stepik.org/course/70/promo), supporting biological foundations.
- [Школа долголетия Open Longevity, 2019](https://www.youtube.com/playlist?list=PLNq0DHP78fouEh9PqZQCH0PGx6t4FbAmj), dated explicitly and accompanied by guidance to check research claims against current evidence.
- The AGCT data-analysis school.

New URL checks identified and corrected stale/incorrect paths for the causal-inference book, lipidomics tutorials and ChIP-seq tutorial. A blocked WormBook homepage was replaced by its specific NCBI chapter. Some publishers use bot challenges; HTTP success alone is not treated as evidence that a chapter teaches a complete practical competency. Existing legacy resources outside the changed areas have not all been re-audited.

Of 51 additional URLs checked for the methods and database expansion, 48 returned HTTP 200. Two ClinicalTrials.gov pages returned HTTP 403 to the automated client, and the AGCT syllabus returned a DNS error in a separate check; its program was accessible through web search. These results do not constitute complete verification of material availability or every video. Chapter links and syllabus content were checked separately.

## Practical assignments

There are 24 assignment blocks, each with an objective, steps, expected deliverable, success criteria and supporting materials. A shared project may support several related skills. At **Work on tasks** depth, assignments appear after **Learning materials**. Completion is not automatically assessed or stored.

The initial database assignments are:

- GenAge / Open Genes: compare FOXO3, MTOR, TERT, SIRT1 and TP53, distinguishing organisms, associations, interventions and primary sources.
- UniProt / GO / Reactome: reconcile identifiers and perform enrichment with an appropriate background and multiple-testing correction.
- GEO: prepare a manifest and sample table, distinguishing raw and processed data, replicates and contrasts.
- HMD / UK Biobank / GTEx: justify dataset selection, variables, access and limitations using public catalogues; restricted data require separate authorization.
- SynergyAge: examine three genetic combinations, single interventions, controls and an interaction model. This is not presented as a database of clinical drug combinations.
- ClinicalTrials.gov: compare two studies by protocol, outcomes, record history and published results.

Other assignments cover progressive SQL tasks, networks, Bayesian inference, temporal validation, stochastic models, recovery after perturbation, mortality, discrimination between theories, repeat analysis, viral-assay interpretation, RNA-seq and external clock validation. Introductory assignments do not assume methods taught only in later nodes.

Graph checks cover cycles, references, both mastery depths, selective components, assignment definitions and Russian-language resources. Browser checks cover search, depth switching, assignment expansion, path locking/reset and RU labels.

## Limits and maintenance

Each practical outcome is a bounded research or analysis task. Hands-on laboratory, animal and surgical work requires the appropriate supervised training and access; this graph does not certify professional competence. Academic level and evidence maturity remain distinct from mastery depth.

The containers are curated decompositions, not an exhaustive protocol encyclopedia. Maintain shared skills once. When a downstream task needs only one part of a discipline, connect that component directly, not the whole container. Add broad optional specializations as recommended links, or expose a focused selectable component.

Transposon expression is not equated with new insertions, and coexpression is not equated with causal regulation. Physical models and competing theories are not presented as established rejuvenation methods. Mortality-law conclusions remain bounded by the observed age range.
