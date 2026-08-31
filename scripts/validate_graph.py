#!/usr/bin/env python3
"""Validate the longevity skill graph using only the Python standard library."""

from __future__ import annotations

import json
import re
import sys
from collections import defaultdict, deque
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
GRAPH_PATH = ROOT / "graph" / "longevity-skills.json"

NODE_FIELDS = {"id", "title", "summary", "kind", "topics", "level", "status", "resources"}
NODE_KINDS = {"foundation", "discipline", "skill", "technology", "research_direction", "integration_goal"}
NODE_LEVELS = {"school", "introductory", "undergraduate", "graduate", "professional", "frontier"}
EDGE_TYPES = {"prerequisite", "recommended_before", "applied_in", "enables", "part_of", "complements"}
EDGE_STRENGTHS = {"required", "recommended", "contextual"}
TARGET_KINDS = {"research_direction", "integration_goal"}
CYRILLIC = re.compile(r"[А-Яа-яЁё]")


def fail(errors: list[str], message: str) -> None:
    errors.append(message)


def main() -> int:
    graph_text = GRAPH_PATH.read_text(encoding="utf-8")
    data = json.loads(graph_text)
    nodes = data.get("nodes", [])
    edges = data.get("edges", [])
    errors: list[str] = []

    if CYRILLIC.search(graph_text):
        fail(errors, "Graph content must be English-only; Cyrillic text was found")

    ids = [node.get("id") for node in nodes]
    id_set = set(ids)
    status_values = set(data.get("status_values", []))
    if len(ids) != len(id_set):
        duplicates = sorted({node_id for node_id in ids if ids.count(node_id) > 1})
        fail(errors, f"Duplicate node ids: {duplicates}")

    title_to_ids: dict[str, list[str]] = defaultdict(list)
    for node in nodes:
        node_id = node.get("id", "<missing-id>")
        missing = sorted(NODE_FIELDS - node.keys())
        if missing:
            fail(errors, f"{node_id}: missing fields {missing}")
        if not node.get("topics"):
            fail(errors, f"{node_id}: topics must not be empty")
        if not node.get("summary"):
            fail(errors, f"{node_id}: summary must not be empty")
        if node.get("kind") not in NODE_KINDS:
            fail(errors, f"{node_id}: invalid kind {node.get('kind')!r}")
        if node.get("level") not in NODE_LEVELS:
            fail(errors, f"{node_id}: invalid level {node.get('level')!r}")
        if node.get("status") not in status_values:
            fail(errors, f"{node_id}: invalid status {node.get('status')!r}")
        if node.get("kind") in TARGET_KINDS and not node.get("evidence_note"):
            fail(errors, f"{node_id}: research targets require evidence_note")
        resources = node.get("resources", [])
        if not resources:
            fail(errors, f"{node_id}: at least one learning resource is required")
        for index, resource in enumerate(resources):
            if not resource.get("title") or not resource.get("url"):
                fail(errors, f"{node_id}: resource #{index + 1} needs title and url")
            elif not resource["url"].startswith(("https://", "http://")):
                fail(errors, f"{node_id}: resource #{index + 1} has invalid url {resource['url']!r}")
        title_to_ids[node.get("title", "")].append(node_id)

    duplicate_titles = {title: node_ids for title, node_ids in title_to_ids.items() if title and len(node_ids) > 1}
    if duplicate_titles:
        fail(errors, f"Duplicate titles: {duplicate_titles}")

    learning_graph: dict[str, set[str]] = defaultdict(set)
    strict_graph: dict[str, set[str]] = defaultdict(set)
    inbound_learning: dict[str, int] = defaultdict(int)

    edge_keys: set[tuple[str, str, str]] = set()
    for index, edge in enumerate(edges):
        prefix = f"edge #{index + 1}"
        source = edge.get("from")
        target = edge.get("to")
        edge_type = edge.get("type")
        strength = edge.get("strength")
        if source not in id_set:
            fail(errors, f"{prefix}: unknown source {source!r}")
        if target not in id_set:
            fail(errors, f"{prefix}: unknown target {target!r}")
        if edge_type not in EDGE_TYPES:
            fail(errors, f"{prefix}: invalid type {edge_type!r}")
        if strength not in EDGE_STRENGTHS:
            fail(errors, f"{prefix}: invalid strength {strength!r}")
        if not edge.get("rationale"):
            fail(errors, f"{prefix}: rationale is required")
        if source == target:
            fail(errors, f"{prefix}: self-edge is not allowed")
        edge_key = (source, target, edge_type)
        if edge_key in edge_keys:
            fail(errors, f"{prefix}: duplicate edge {edge_key}")
        edge_keys.add(edge_key)
        if source in id_set and target in id_set and edge_type in {"prerequisite", "recommended_before"}:
            learning_graph[source].add(target)
            inbound_learning[target] += 1
        if source in id_set and target in id_set and edge_type == "prerequisite":
            strict_graph[source].add(target)

    indegree = {node_id: 0 for node_id in id_set}
    for targets in strict_graph.values():
        for target in targets:
            indegree[target] += 1
    queue = deque(sorted(node_id for node_id, degree in indegree.items() if degree == 0))
    visited = 0
    while queue:
        source = queue.popleft()
        visited += 1
        for target in strict_graph.get(source, set()):
            indegree[target] -= 1
            if indegree[target] == 0:
                queue.append(target)
    if visited != len(id_set):
        cycle_nodes = sorted(node_id for node_id, degree in indegree.items() if degree > 0)
        fail(errors, f"Cycle in prerequisite graph involving: {cycle_nodes}")

    school_ids = {node["id"] for node in nodes if node.get("level") == "school"}
    reachable = set(school_ids)
    queue = deque(sorted(school_ids))
    while queue:
        source = queue.popleft()
        for target in learning_graph.get(source, set()):
            if target not in reachable:
                reachable.add(target)
                queue.append(target)

    for node in nodes:
        node_id = node["id"]
        if node.get("kind") in TARGET_KINDS and node_id not in reachable:
            fail(errors, f"{node_id}: target is not reachable from a school-level node")
        if node.get("level") != "school" and inbound_learning[node_id] == 0:
            fail(errors, f"{node_id}: non-school node has no learning prerequisite")
        if node.get("kind") not in TARGET_KINDS and not learning_graph[node_id]:
            fail(errors, f"{node_id}: non-target node has no learning dependent")

    if errors:
        print("Graph validation failed:")
        for error in errors:
            print(f"- {error}")
        return 1

    target_count = sum(node.get("kind") in TARGET_KINDS for node in nodes)
    print(
        f"Graph is valid: {len(nodes)} nodes, {len(edges)} edges, "
        f"{target_count} targets, {len(school_ids)} school roots."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
