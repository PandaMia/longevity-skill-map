import contextlib
import copy
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from pydantic import ValidationError

from config.graph import GRAPH, NODE_BY_ID, build_learning_path, build_node_details
from config.models import GraphNode, LearningPathRequest
from scripts import validate_graph


class CurriculumExpansionTests(unittest.TestCase):
    def path(self, target, depth="apply"):
        return set(build_learning_path(LearningPathRequest(node_id=target, depth=depth)).node_ids)

    def test_requested_topics_have_selectable_components(self):
        for node_id in ["virology_foundations", "transposable_elements_aging", "gene_network_analysis", "longevity_data_resources", "research_data_sql", "physical_aging_models", "aging_theories"]:
            with self.subTest(node_id=node_id):
                children = build_node_details(node_id).children
                self.assertGreaterEqual(len(children), 3)
                self.assertTrue(all(child.resources for child in children))
        stats = {child.id for child in build_node_details("applied_statistics").children}
        self.assertLessEqual({"bayesian_inference", "bayesian_model_checking", "time_series_analysis", "physiological_time_series"}, stats)

    def test_specializations_do_not_require_whole_neighboring_disciplines(self):
        virology = self.path("viral_gene_delivery")
        self.assertIn("viral_structure_replication", virology)
        self.assertIn("virology_assay_interpretation", virology)
        self.assertNotIn("sql_queries_joins", virology)
        self.assertNotIn("viral_persistence_aging", virology)
        genes = self.path("aging_gene_evidence")
        self.assertNotIn("clinical_trial_registry_review", genes)
        self.assertNotIn("human_cohort_data_selection", genes)
        self.assertNotIn("longevity_data_resources", genes)
        network = self.path("network_comparison_aging")
        self.assertIn("network_validation_uncertainty", network)
        self.assertNotIn("regulatory_network_inference", network)

    def test_transposon_task_path_includes_the_full_measurement_chain(self):
        practical = self.path("transposon_senescence_inflammation")
        self.assertLessEqual({"mobile_genetic_elements", "transposon_epigenetic_silencing", "repetitive_sequence_analysis", "senescence_measurement", "causal_inference"}, practical)
        conceptual = self.path("transposon_senescence_inflammation", "understand")
        self.assertIn("mobile_genetic_elements", conceptual)
        self.assertNotIn("repetitive_sequence_analysis", conceptual)

    def test_computational_aging_chapters_are_attached_to_relevant_skills(self):
        expected = {
            "rna_differential_expression": "stat/differential_analysis_practice.html",
            "dna_methylation_analysis": "meth/meth.html",
            "survival_analysis": "stat/survival_analysis.html",
            "clock_external_validation": "ml/aging_clocks.html",
            "systems_biology": "dyn/complex_systems.html",
            "frailty_resilience": "dyn/system_resilience.html",
        }
        for node_id, chapter in expected.items():
            self.assertTrue(any(str(resource.url).endswith(chapter) for resource in NODE_BY_ID[node_id].resources), node_id)

    def test_russian_courses_are_identified_without_changing_navigation_language(self):
        resources = [resource for node in GRAPH.nodes for resource in node.resources if resource.language == "ru"]
        urls = {str(resource.url) for resource in resources}
        self.assertIn("https://stepik.org/course/127124/promo", urls)
        self.assertIn("https://www.youtube.com/watch?v=HPHDG3pIgb8", urls)
        self.assertTrue(any("PLNq0DHP78fouEh9PqZQCH0PGx6t4FbAmj" in url for url in urls))
        self.assertEqual(GRAPH.language, "en")
        self.assertTrue(any("Биология старения" in resource.title for resource in resources))

    def test_database_assignments_are_exposed_in_node_details(self):
        for node_id in ["aging_gene_evidence", "gene_identifiers_pathways", "public_omics_data_retrieval", "human_cohort_data_selection", "genetic_combination_evidence", "clinical_trial_registry_review"]:
            with self.subTest(node_id=node_id):
                response = build_node_details(node_id).model_dump(mode="json")
                exercise = response["node"]["exercises"][0]
                self.assertGreaterEqual(len(exercise["steps"]), 3)
                self.assertGreaterEqual(len(exercise["success_criteria"]), 2)
                self.assertTrue(exercise["deliverable"])
                self.assertTrue(exercise["resources"])

    def test_sql_and_bayesian_assignments_progress_instead_of_repeating_an_advanced_task(self):
        schema = NODE_BY_ID["relational_research_schema"].exercises[0]
        queries = NODE_BY_ID["sql_queries_joins"].exercises[0]
        ingestion = NODE_BY_ID["reproducible_database_ingestion"].exercises[0]
        self.assertEqual(len({schema.id, queries.id, ingestion.id}), 3)
        self.assertNotIn("bayesian_model_checking", self.path("bayesian_inference"))
        self.assertNotIn("sql_queries_joins", self.path("relational_research_schema"))

    def test_invalid_or_duplicate_exercise_definitions_are_rejected(self):
        payload = NODE_BY_ID["aging_gene_evidence"].model_dump(mode="json")
        payload["exercises"][0]["success_criteria"] = []
        with self.assertRaises(ValidationError):
            GraphNode.model_validate(payload)
        payload = NODE_BY_ID["aging_gene_evidence"].model_dump(mode="json")
        payload["exercises"].append(copy.deepcopy(payload["exercises"][0]))
        with self.assertRaises(ValidationError):
            GraphNode.model_validate(payload)

    def test_standalone_validator_accepts_russian_resources_but_not_escaped_russian_navigation(self):
        data = GRAPH.model_dump(mode="json", by_alias=True)
        with tempfile.TemporaryDirectory() as directory:
            graph_path = Path(directory) / "graph.json"
            with patch.object(validate_graph, "GRAPH_PATH", graph_path):
                graph_path.write_text(json.dumps(data, ensure_ascii=True))
                with contextlib.redirect_stdout(io.StringIO()):
                    self.assertEqual(validate_graph.main(), 0)
                data["nodes"][0]["summary"] = "Непереведенная навигация"
                graph_path.write_text(json.dumps(data, ensure_ascii=True))
                with contextlib.redirect_stdout(io.StringIO()):
                    self.assertEqual(validate_graph.main(), 1)


if __name__ == "__main__":
    unittest.main()
