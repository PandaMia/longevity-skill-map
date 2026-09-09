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

NODE_FIELDS = {"id", "title", "summary", "kind", "topics", "level", "status", "resources", "outcomes", "practice"}
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

    # The skill map remains English; resource titles/sections may use their
    # original Russian names when language is explicitly marked as ru.
    if data.get("language") != "en":
        fail(errors, "The graph navigation language must be en")

    ids = [node.get("id") for node in nodes]
    id_set = set(ids)
    node_by_id = {node.get("id"): node for node in nodes}
    containers = {node.get("parent_id") for node in nodes if node.get("parent_id")}
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
        parent = node.get("parent_id")
        if parent:
            if parent not in id_set or parent == node_id:
                fail(errors, f"{node_id}: invalid parent {parent}")
            elif node_by_id[parent].get("parent_id"):
                fail(errors, f"{node_id}: only one level of containment is supported")
        for depth in ("understand", "apply"):
            if not node.get("outcomes", {}).get(depth):
                fail(errors, f"{node_id}: missing {depth} outcome")
        if not node.get("practice"):
            fail(errors, f"{node_id}: missing practice task")
        if node.get("kind") not in NODE_KINDS:
            fail(errors, f"{node_id}: invalid kind {node.get('kind')!r}")
        if node.get("level") not in NODE_LEVELS:
            fail(errors, f"{node_id}: invalid level {node.get('level')!r}")
        if node.get("status") not in status_values:
            fail(errors, f"{node_id}: invalid status {node.get('status')!r}")
        if node.get("kind") in TARGET_KINDS and not node.get("evidence_note"):
            fail(errors, f"{node_id}: research targets require evidence_note")
        for field in ("id", "title", "summary", "practice", "evidence_note", "outcomes"):
            if CYRILLIC.search(json.dumps(node.get(field, ""), ensure_ascii=False)):
                fail(errors, f"{node_id}: {field} must be English-only")
        exercises = node.get("exercises", [])
        if not isinstance(exercises, list):
            fail(errors, f"{node_id}: exercises must be a list")
            exercises = []
        exercise_ids = set()
        for exercise in exercises:
            exercise_id = exercise.get("id", "")
            prefix = f"{node_id}: exercise {exercise_id}"
            if not re.fullmatch(r"[a-z0-9_]+", exercise_id) or exercise_id in exercise_ids:
                fail(errors, f"{prefix}: invalid or duplicate ID")
            exercise_ids.add(exercise_id)
            for field in ("title", "objective", "deliverable"):
                if not isinstance(exercise.get(field), str) or not exercise[field].strip():
                    fail(errors, f"{prefix}: {field} is required")
            for field in ("steps", "success_criteria"):
                entries = exercise.get(field)
                if not isinstance(entries, list) or len(entries) < 2 or any(not isinstance(entry, str) or not entry.strip() for entry in entries):
                    fail(errors, f"{prefix}: {field} needs at least two nonempty entries")
            if not exercise.get("resources"):
                fail(errors, f"{prefix}: supporting resources are required")
            for field in ("title", "objective", "deliverable", "steps", "success_criteria"):
                if CYRILLIC.search(json.dumps(exercise.get(field, ""), ensure_ascii=False)):
                    fail(errors, f"{prefix}: {field} must be English-only")
        resources = node.get("resources", [])
        if not resources:
            fail(errors, f"{node_id}: at least one learning resource is required")
        all_resources = resources + [resource for exercise in exercises for resource in exercise.get("resources", [])]
        for index, resource in enumerate(all_resources):
            language = resource.get("language", "en")
            if language not in {"en", "ru"}:
                fail(errors, f"{node_id}: resource #{index + 1} has unsupported language")
            if language != "ru" and CYRILLIC.search(json.dumps(resource, ensure_ascii=False)):
                fail(errors, f"{node_id}: Russian resources must declare language ru")
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
        if edge.get("min_depth") not in {"understand", "apply"}:
            fail(errors, f"{prefix}: invalid minimum mastery depth")
        if edge.get("source_depth") not in {None, "understand", "apply"}:
            fail(errors, f"{prefix}: invalid source mastery depth")
        if edge_type == "prerequisite" and strength != "required":
            fail(errors, f"{prefix}: prerequisites must be required; use recommended_before")
        if edge.get("min_depth") == "understand" and edge.get("source_depth") == "apply":
            fail(errors, f"{prefix}: understanding cannot require practical mastery")
        if CYRILLIC.search(edge.get("rationale", "")):
            fail(errors, f"{prefix}: rationale must be English-only")
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
        if node.get("kind") not in TARGET_KINDS and node_id not in containers and not learning_graph[node_id]:
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
