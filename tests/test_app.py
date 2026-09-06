import re
import unittest
from pathlib import Path

from fastapi import HTTPException
from pydantic import ValidationError

import app
from config.graph import (
    GRAPH,
    POSITIONS,
    build_graph_response,
    build_node_details,
    deterministic_layout,
    build_learning_path,
    CHILDREN,
)
from config.models import GraphQuery, NodeDetailsRequest, LearningPathRequest, MasteryDepth
from config.settings import INDEX_PATH, STATIC_DIR


class ApplicationTests(unittest.TestCase):
    def test_full_graph_is_available(self) -> None:
        response = build_graph_response(GraphQuery())
        self.assertEqual({node.id for node in response.nodes}, {node.id for node in GRAPH.nodes})
        self.assertEqual(len(response.edges), len(GRAPH.edges))

    def test_terminal_nodes_are_targets_or_content_containers(self) -> None:
        learning_types = {"prerequisite", "recommended_before"}
        nodes_with_dependents = {
            edge.from_
            for edge in GRAPH.edges
            if edge.type.value in learning_types
        }
        terminal_nodes = [node for node in GRAPH.nodes if node.id not in nodes_with_dependents]
        self.assertTrue(terminal_nodes)
        self.assertTrue(
            all(node.kind.value in {"research_direction", "integration_goal"} or CHILDREN[node.id] for node in terminal_nodes)
        )

    def test_intermediate_nodes_have_intended_learning_continuations(self) -> None:
        learning_pairs = {
            (edge.from_, edge.to)
            for edge in GRAPH.edges
            if edge.type.value in {"prerequisite", "recommended_before"}
        }
        expected_pairs = {
            ("algorithms_data_structures", "bioinformatics_foundations"),
            ("mammalian_aging_models", "preclinical_safety"),
            ("preclinical_safety", "drug_discovery_development"),
            ("bioimage_analysis", "assay_development_screening"),
            ("epigenome_editing", "epigenetic_rejuvenation"),
            ("transformers_llms", "agentic_ai_systems"),
            ("agentic_ai_systems", "biomedical_research_agents"),
            ("biomedical_research_agents", "ai_longevity_discovery"),
        }
        self.assertLessEqual(expected_pairs, learning_pairs)

    def test_layout_is_deterministic(self) -> None:
        first_positions, first_bounds, first_lanes = deterministic_layout(GRAPH)
        second_positions, second_bounds, second_lanes = deterministic_layout(GRAPH)
        self.assertEqual(first_positions, second_positions)
        self.assertEqual(first_bounds, second_bounds)
        self.assertEqual(first_lanes, second_lanes)

    def test_filter_keeps_original_positions(self) -> None:
        response = build_graph_response(GraphQuery(topics=["ml_ai"]))
        self.assertTrue(response.nodes)
        for node in response.nodes:
            self.assertEqual((node.x, node.y), POSITIONS[node.id])

    def test_topics_are_consolidated_into_spatial_lanes(self) -> None:
        response = build_graph_response(GraphQuery())
        topics = response.options.topics
        self.assertEqual(len(topics), 12)
        self.assertEqual(len({topic.color for topic in topics}), 12)
        self.assertIn("ml_ai", {topic.id for topic in topics})
        configured_ids = {topic.id for topic in topics}
        self.assertTrue(all(set(node.topics) <= configured_ids for node in GRAPH.nodes))
        self.assertEqual(len(response.lanes), 12)
        lane_by_id = {lane.id: lane for lane in response.lanes}
        topic_by_id = {topic.id: topic for topic in topics}
        self.assertTrue(
            all(lane.color == topic_by_id[lane.id].color for lane in response.lanes)
        )
        for node in response.nodes:
            lane = lane_by_id[node.topics[0]]
            self.assertGreaterEqual(node.y, lane.y)
            self.assertLessEqual(node.y, lane.y + lane.height)

    def test_learning_dependencies_move_left_to_right(self) -> None:
        response = build_graph_response(GraphQuery())
        positions = {node.id: node for node in response.nodes}
        learning_types = {"prerequisite", "recommended_before"}
        for edge in GRAPH.edges:
            if edge.type.value in learning_types:
                self.assertLess(positions[edge.from_].x, positions[edge.to].x)

    def test_node_details_include_relations_and_resources(self) -> None:
        response = build_node_details("epigenetic_rejuvenation")
        self.assertEqual(response.node.id, "epigenetic_rejuvenation")
        self.assertGreaterEqual(len(response.node.resources), 1)
        self.assertGreaterEqual(len(response.prerequisites), 1)

    def test_node_id_is_validated_by_pydantic(self) -> None:
        with self.assertRaises(ValidationError):
            NodeDetailsRequest(node_id="INVALID ID")

    def test_unknown_topic_returns_422(self) -> None:
        with self.assertRaises(HTTPException) as raised:
            app.query_graph(GraphQuery(topics=["unknown_topic"]))
        self.assertEqual(raised.exception.status_code, 422)

    def test_static_assets_contain_required_interactions(self) -> None:
        html = INDEX_PATH.read_text(encoding="utf-8")
        css = (STATIC_DIR / "styles.css").read_text(encoding="utf-8")
        javascript = (STATIC_DIR / "app.js").read_text(encoding="utf-8")
        self.assertIn('/static/styles.css', html)
        self.assertIn('/static/app.js', html)
        self.assertIn('id="legend-panel"', html)
        self.assertIn('id="legend-toggle"', html)
        self.assertIn('class="edge-legend-list"', html)
        self.assertNotIn('class="legend" aria-label="Edge types"', html)
        self.assertNotIn("Trackpad: two fingers", html)
        self.assertIn('id="node-search"', html)
        self.assertIn('id="search-results"', html)
        self.assertIn('id="lanes"', html)
        self.assertIn("function highlightNode", javascript)
        self.assertIn("function applyHighlight", javascript)
        self.assertIn("function renderStatusLegend", javascript)
        self.assertIn("function renderTopicLanes", javascript)
        self.assertIn("function searchNode", javascript)
        self.assertIn("function renderSearchResults", javascript)
        self.assertIn("selectSearchResult(match.node.id)", javascript)
        self.assertIn("function openNode(nodeId", javascript)
        self.assertIn("topic-lane", css)
        self.assertIn("search-result", css)
        self.assertIn("edge-legend-item", css)
        self.assertIn("topic-color-swatch", css)
        self.assertIn("status-color-swatch", css)
        self.assertIn("openNode(node.id)", javascript)
        self.assertIn("fitGraph()", javascript)
        self.assertNotIn("${graph.layout_version}", javascript)
        self.assertIn("node-title-box", css)
        self.assertNotIn("text-overflow: ellipsis", css)
        self.assertNotIn("-webkit-line-clamp", css)
        self.assertIn("text-overflow: clip", css)
        self.assertIn("if (event.ctrlKey)", javascript)
        self.assertIn("state.tx -= event.deltaX", javascript)
        self.assertIn('addEventListener("gesturechange"', javascript)

    def test_app_module_contains_no_embedded_ui_or_models(self) -> None:
        source = Path(app.__file__).read_text(encoding="utf-8")
        self.assertNotIn("INDEX_HTML", source)
        self.assertNotIn("class GraphNode", source)
        self.assertNotIn("class NodeKind", source)

    def test_visible_content_is_english_only(self) -> None:
        cyrillic = re.compile(r"[А-Яа-яЁё]")
        self.assertIsNone(cyrillic.search(INDEX_PATH.read_text(encoding="utf-8")))
        self.assertIsNone(cyrillic.search((STATIC_DIR / "app.js").read_text(encoding="utf-8")))
        for node in GRAPH.nodes:
            self.assertIsNone(cyrillic.search(node.title))
            self.assertIsNone(cyrillic.search(node.summary))
            if node.evidence_note:
                self.assertIsNone(cyrillic.search(node.evidence_note))
        for edge in GRAPH.edges:
            self.assertIsNone(cyrillic.search(edge.rationale))


    def path(self, target, depth="apply"):
        return build_learning_path(LearningPathRequest(node_id=target, depth=depth))

    def test_depth_specific_closures_for_every_node(self):
        for node in GRAPH.nodes:
            with self.subTest(node=node.id):
                conceptual = self.path(node.id, "understand")
                practical = self.path(node.id, "apply")
                self.assertLessEqual(set(conceptual.node_ids), set(practical.node_ids))
                self.assertEqual(len(practical.node_ids), len(set(practical.node_ids)))
                stages = {step.node_id: step.stage for step in practical.steps}
                for index in practical.edge_indices:
                    edge = GRAPH.edges[index]
                    self.assertEqual(edge.type.value, "prerequisite")
                    self.assertEqual(edge.strength.value, "required")
                    self.assertLess(stages[edge.from_], stages[edge.to])
                for step in conceptual.steps:
                    self.assertEqual(step.depth, MasteryDepth.UNDERSTAND)

    def test_a_component_does_not_require_its_siblings_or_container(self):
        route = self.path("flow_gating")
        self.assertIn("flow_panel_design", route.node_ids)
        self.assertIn("microscopy_flow_cytometry", route.container_ids)
        for unrelated in ["microscopy_flow_cytometry", "cell_sorting", "bioimage_analysis", "fluorescence_microscopy"]:
            self.assertNotIn(unrelated, route.node_ids)

    def test_practical_paths_include_methods_and_biology(self):
        route = self.path("biostasis_bridge")
        for required in ["cell_biology", "physiology_homeostasis", "transport_thermal_biophysics", "experimental_design_biostatistics", "graft_function_assessment"]:
            self.assertIn(required, route.node_ids)
        self.assertNotIn("graft_function_assessment", self.path("biostasis_bridge", "understand").node_ids)
        brain = self.path("brain_microglial_rejuvenation")
        for required in ["electrophysiology", "histology_pathology", "cognitive_behavioral_assessment", "immune_aging_phenotyping"]:
            self.assertIn(required, brain.node_ids)

    def test_all_research_tasks_require_experimental_design(self):
        for node in GRAPH.nodes:
            if node.kind.value in {"research_direction", "integration_goal"}:
                self.assertIn("experimental_design_biostatistics", self.path(node.id).node_ids, node.id)

    def test_prerequisite_depth_is_propagated_without_overtraining(self):
        route = self.path("flow_gating")
        depths = {step.node_id: step.depth for step in route.steps}
        self.assertEqual(depths["flow_gating"], MasteryDepth.APPLY)
        self.assertEqual(depths["immunology"], MasteryDepth.UNDERSTAND)
        self.assertEqual(depths["experimental_design_biostatistics"], MasteryDepth.APPLY)

    def test_modalities_do_not_require_irrelevant_omics(self):
        clinical = self.path("clinical_clock_reproduction")
        self.assertNotIn("dna_methylation_analysis", clinical.node_ids)
        methylation = self.path("methylation_clock_reproduction")
        self.assertIn("dna_methylation_analysis", methylation.node_ids)
        self.assertNotIn("lipidomics_analysis", methylation.node_ids)
        rnaseq = self.path("rna_differential_expression")
        self.assertIn("r_bioconductor", rnaseq.node_ids)
        self.assertIn("multiple_testing_batch", rnaseq.node_ids)

    def test_containers_and_resources_have_complete_learning_metadata(self):
        requested = ["drug_discovery_development", "gene_therapy_delivery", "microscopy_flow_cytometry", "proteomics_metabolomics", "ipsc_organoids", "transplantation_xenobiology", "immune_inflammaging_rejuvenation", "brain_microglial_rejuvenation"]
        for node_id in requested:
            details = build_node_details(node_id)
            self.assertGreaterEqual(len(details.children), 3)
            for child in details.children:
                self.assertTrue(child.resources)
                self.assertTrue(child.outcomes.understand)
                self.assertTrue(child.outcomes.apply)
                self.assertTrue(child.practice)

    def test_learning_path_api_validation(self):
        from fastapi.testclient import TestClient
        with TestClient(app.app) as client:
            response = client.post("/api/learning-path", json={"node_id": "flow_gating", "depth": "apply"})
            self.assertEqual(response.status_code, 200)
            self.assertIn("flow_panel_design", response.json()["node_ids"])
            self.assertEqual(client.post("/api/learning-path", json={"node_id": "unknown"}).status_code, 404)
            self.assertEqual(client.post("/api/learning-path", json={"node_id": "flow_gating", "depth": "expert"}).status_code, 422)
            self.assertEqual(client.post("/api/learning-path", json={"node_id": "flow_gating", "unexpected": True}).status_code, 422)


if __name__ == "__main__":
    unittest.main()
