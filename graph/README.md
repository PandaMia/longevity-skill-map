# Longevity skill graph

The source of truth is [`longevity-skills.json`](./longevity-skills.json), schema **0.2.0**. It contains 238 nodes, 880 edges, 25 expandable containers, 27 research/integration targets and 6 school-level foundations.

## Containers and components

A component has `parent_id`; the parent retains its existing stable ID, title and overview resources. Containment is a presentation relationship, not a prerequisite. A component's path includes only the components explicitly required by its dependency edges. Other children of its parent are not automatically required.

The current presentation supports one level of components. A shared skill belongs to one container and can be reused by any number of learning paths. For example, product quality and batch release are shared by gene therapy and other product-development paths; they are not copied into every container.

Containers are collapsed in the overview. Use the plus/minus control or the detail panel to expand them. Selecting a component through search expands its container and centers the component. Ordinary node selection continues to highlight immediate neighbors.

A whole-container target uses explicitly curated incoming edges. Many broad containers include several practical specialties at task depth. Users can select a component for a more focused target. Aging-clock modalities are recommended choices beside their common validation foundation; choosing methylation clocks does not require clinical clocks, and vice versa.

## Two mastery depths

- **Understand the topic** (`understand`): explain concepts, assumptions and limitations.
- **Work on tasks** (`apply`): perform or design a scoped task and evaluate its result. Laboratory and professional tasks can require supervised training.

Every node includes `outcomes.understand`, `outcomes.apply` and a `practice` task. Depth is separate from the existing academic `level` and scientific maturity `status`.

```json
{
  "id": "flow_gating",
  "title": "Flow cytometry gating and quantification",
  "parent_id": "microscopy_flow_cytometry",
  "summary": "Singlet, viability and population gates and sources of analysis bias.",
  "kind": "skill",
  "topics": ["molecular_cell_biology"],
  "level": "graduate",
  "status": "foundational",
  "outcomes": {
    "understand": "Explain singlet, viability and population gates and sources of analysis bias.",
    "apply": "Analyze a sample dataset with a documented gating hierarchy and sensitivity checks."
  },
  "practice": "Analyze a sample dataset with a documented gating hierarchy and sensitivity checks.",
  "resources": [{
    "title": "FlowJo: drawing and interpreting gates",
    "url": "https://docs.flowjo.com/flowjo/graphs-and-gating/gw-gating/gw-gatedrawing/",
    "provider": "FlowJo",
    "type": "tutorial",
    "level": "graduate",
    "depth": "apply",
    "section": "Gating tools and gate hierarchy"
  }]
}
```

## Dependency semantics

A prerequisite edge points from the earlier skill to its dependent. All applicable required edges form an AND dependency.

- `min_depth: understand`: needed at both depths.
- `min_depth: apply`: added only when the dependent must be used for tasks.
- `source_depth: understand`: only conceptual mastery of the earlier skill is required.
- `source_depth: null`: propagate the dependent's requested depth.

```json
{
  "from": "experimental_design_biostatistics",
  "to": "flow_gating",
  "type": "prerequisite",
  "strength": "required",
  "min_depth": "apply",
  "source_depth": null,
  "rationale": "Practical analysis requires explicit controls and uncertainty assessment."
}
```

`recommended_before` never enters a required path. The previous ambiguous `prerequisite/recommended` combination is rejected by validation. `applied_in` and containment do not set learning order. Alternative specialties are separate selectable targets rather than implicit OR choices selected on the user's behalf.

## Locked learning paths

`POST /api/learning-path` accepts `{"node_id":"flow_gating","depth":"apply"}` and returns:

- `target_id` and `depth`;
- `node_ids`: complete transitive prerequisite closure, including the target;
- `container_ids`: presentation shells needed to expose components; these are not necessarily required skills;
- `edge_indices`: indices into the full graph's edge array;
- `steps`: node ID, effective depth and topological stage for every required step.

The resolver upgrades shared prerequisites to the strongest requested depth, includes all required branches and counts each skill once. No path is selected by geometric proximity or shortest-path heuristics.

The UI locks the target until the user explicitly retargets or resets. Clicking other required nodes inspects them without changing the path. Search, graph nodes, related-node buttons and component buttons obey the same lock. Containers expand automatically to expose required components; unrelated siblings are hidden. Changing mastery depth recalculates the path for the same target. Reset restores the overview expansion state and full navigation.

## Materials

A resource may specify `section` (an actual chapter, lesson or topic within a course) and `depth` (concepts or practice). Specific chapter/tutorial links are preferred. Broad courses can remain on containers. Resources are educational support; completing a page is not equivalent to demonstrating the node's practical outcome.

See [`curriculum-expansion.md`](../research/curriculum-expansion.md) for coverage, source choices and limitations.

## Validation

```bash
python3 scripts/validate_graph.py
.venv/bin/python -m unittest discover -s tests -v
node --test tests/*.test.js
```

The standalone validator checks references, hierarchy, required metadata, resources, edge semantics, cycles and learning continuations. Application tests check both depths for every node, monotonicity, topological order, selective components, practical foundations and API input validation. Presentation tests check collapse/expand, path filtering, deterministic layout, containment and overlap. Interaction tests check local hover updates, stable shared edges, graph-size-independent mutation counts and batched camera updates.

Topic lanes and positions remain deterministic for a given expansion state. The full-graph API retains all nodes and stable source coordinates; `static/graph-view.js` projects them into visible root cards and expanded containers.
