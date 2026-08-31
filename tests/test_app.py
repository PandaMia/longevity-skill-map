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
)
from config.models import GraphQuery, NodeDetailsRequest
from config.settings import INDEX_PATH, STATIC_DIR


class ApplicationTests(unittest.TestCase):
    def test_full_graph_is_available(self) -> None:
        response = build_graph_response(GraphQuery())
        self.assertEqual(len(response.nodes), 106)
        self.assertEqual(len(response.edges), 276)

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
        self.assertIn("openNode(nodeId)", javascript)
        self.assertIn("topic-lane", css)
        self.assertIn("search-result", css)
        self.assertIn("edge-legend-item", css)
        self.assertIn("topic-color-swatch", css)
        self.assertIn("status-color-swatch", css)
        self.assertIn("openNode(node.id)", javascript)
        self.assertIn("fitGraph()", javascript)
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


if __name__ == "__main__":
    unittest.main()
