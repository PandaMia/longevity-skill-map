from __future__ import annotations

import heapq
from collections import defaultdict

from .models import (
    EdgeStrength,
    EdgeType,
    FilterOptions,
    GraphBounds,
    GraphEdge,
    GraphFile,
    GraphQuery,
    GraphResponse,
    HealthResponse,
    LearningPathRequest,
    LearningPathResponse,
    MasteryDepth,
    NodeDetailsResponse,
    NodeKind,
    PathStep,
    PositionedNode,
    RelatedEdge,
    RenderEdge,
    TopicLane,
    TopicOption,
)
from .settings import GRAPH_PATH, LAYOUT_NAME
from .topics import TOPIC_CATEGORIES


class UnknownTopicsError(ValueError):
    def __init__(self, topics: list[str]) -> None:
        self.topics = topics
        super().__init__(f"Unknown topics: {', '.join(topics)}")


class UnknownNodeError(LookupError):
    def __init__(self, node_id: str) -> None:
        self.node_id = node_id
        super().__init__(f"Unknown node: {node_id}")


def load_graph() -> GraphFile:
    if not GRAPH_PATH.exists():
        raise RuntimeError(f"Graph file does not exist: {GRAPH_PATH}")
    return GraphFile.model_validate_json(GRAPH_PATH.read_text(encoding="utf-8"))


def validate_graph_references(graph: GraphFile) -> None:
    node_ids = {node.id for node in graph.nodes}
    if len(node_ids) != len(graph.nodes):
        raise RuntimeError("Graph contains duplicate node ids")
    by_id = {node.id: node for node in graph.nodes}
    for node in graph.nodes:
        if node.parent_id is not None:
            if node.parent_id not in node_ids or node.parent_id == node.id:
                raise RuntimeError(f"Invalid parent for {node.id}")
            if by_id[node.parent_id].parent_id is not None:
                raise RuntimeError("Containers currently support one level of components")
    for edge in graph.edges:
        if edge.from_ not in node_ids or edge.to not in node_ids:
            raise RuntimeError(f"Edge references an unknown node: {edge.from_} -> {edge.to}")


def deterministic_layout(
    graph: GraphFile,
) -> tuple[dict[str, tuple[float, float]], GraphBounds, list[TopicLane]]:
    """Place prerequisite ranks left-to-right inside deterministic topic lanes."""

    learning_types = {EdgeType.PREREQUISITE, EdgeType.RECOMMENDED_BEFORE}
    outgoing: dict[str, set[str]] = defaultdict(set)
    indegree = {node.id: 0 for node in graph.nodes}

    for edge in graph.edges:
        if edge.type not in learning_types:
            continue
        if edge.to not in outgoing[edge.from_]:
            outgoing[edge.from_].add(edge.to)
            indegree[edge.to] += 1

    queue = [node_id for node_id, degree in indegree.items() if degree == 0]
    heapq.heapify(queue)
    rank = {node.id: 0 for node in graph.nodes}
    topo_order: list[str] = []

    while queue:
        node_id = heapq.heappop(queue)
        topo_order.append(node_id)
        for target in sorted(outgoing[node_id]):
            rank[target] = max(rank[target], rank[node_id] + 1)
            indegree[target] -= 1
            if indegree[target] == 0:
                heapq.heappush(queue, target)

    if len(topo_order) != len(graph.nodes):
        if any(e.type == EdgeType.RECOMMENDED_BEFORE for e in graph.edges):
            return deterministic_layout_with_strict_edges(graph)
        raise RuntimeError("Cycle in prerequisite graph")

    return assign_topic_lane_coordinates(graph, rank)


def deterministic_layout_with_strict_edges(
    graph: GraphFile,
) -> tuple[dict[str, tuple[float, float]], GraphBounds, list[TopicLane]]:
    strict_graph = graph.model_copy(
        update={
            "edges": [
                edge for edge in graph.edges if edge.type == EdgeType.PREREQUISITE
            ]
        }
    )
    return deterministic_layout(strict_graph)


def assign_topic_lane_coordinates(
    graph: GraphFile,
    rank: dict[str, int],
) -> tuple[dict[str, tuple[float, float]], GraphBounds, list[TopicLane]]:
    node_width = 224.0
    rank_spacing = 600.0
    subcolumn_spacing = 260.0
    subcolumns = 2
    y_spacing = 98.0
    margin_x = 40.0
    margin_y = 40.0
    label_width = 280.0
    lane_header = 44.0
    lane_padding = 18.0
    lane_gap = 24.0
    node_start_x = margin_x + label_width

    node_by_id = {node.id: node for node in graph.nodes}
    topic_rank_nodes: dict[str, dict[int, list[str]]] = defaultdict(
        lambda: defaultdict(list)
    )
    for node in graph.nodes:
        topic_rank_nodes[node.topics[0]][rank[node.id]].append(node.id)

    kind_order = {
        NodeKind.FOUNDATION: 0,
        NodeKind.DISCIPLINE: 1,
        NodeKind.SKILL: 2,
        NodeKind.TECHNOLOGY: 3,
        NodeKind.RESEARCH_DIRECTION: 4,
        NodeKind.INTEGRATION_GOAL: 5,
    }
    for rank_nodes in topic_rank_nodes.values():
        for node_ids in rank_nodes.values():
            node_ids.sort(
                key=lambda node_id: (
                    kind_order[node_by_id[node_id].kind],
                    node_by_id[node_id].title.casefold(),
                    node_id,
                )
            )

    positions: dict[str, tuple[float, float]] = {}
    lanes: list[TopicLane] = []
    cursor_y = margin_y
    for topic_id, topic_config in TOPIC_CATEGORIES.items():
        rank_nodes = topic_rank_nodes.get(topic_id, {})
        if not rank_nodes:
            continue
        max_rows = max(
            (len(node_ids) + subcolumns - 1) // subcolumns
            for node_ids in rank_nodes.values()
        )
        lane_height = lane_header + lane_padding * 2 + max_rows * y_spacing
        lanes.append(
            TopicLane(
                id=topic_id,
                label=topic_config["label"],
                color=topic_config["color"],
                y=cursor_y,
                height=lane_height,
            )
        )
        content_top = cursor_y + lane_header + lane_padding
        for node_rank, node_ids in sorted(rank_nodes.items()):
            row_count = (len(node_ids) + subcolumns - 1) // subcolumns
            vertical_offset = (max_rows - row_count) * y_spacing / 2
            for item_index, node_id in enumerate(node_ids):
                subcolumn = item_index % subcolumns
                row = item_index // subcolumns
                x = (
                    node_start_x
                    + node_rank * rank_spacing
                    + subcolumn * subcolumn_spacing
                )
                y = content_top + vertical_offset + y_spacing / 2 + row * y_spacing
                positions[node_id] = (x, y)
        cursor_y += lane_height + lane_gap

    max_rank = max(rank.values(), default=0)
    width = (
        node_start_x
        + max_rank * rank_spacing
        + (subcolumns - 1) * subcolumn_spacing
        + node_width / 2
        + margin_x
    )
    height = cursor_y - lane_gap + margin_y
    return positions, GraphBounds(min_x=0, min_y=0, width=width, height=height), lanes


GRAPH = load_graph()
validate_graph_references(GRAPH)
NODE_BY_ID = {node.id: node for node in GRAPH.nodes}
CHILDREN: dict[str, list[str]] = defaultdict(list)
for _node in GRAPH.nodes:
    if _node.parent_id:
        CHILDREN[_node.parent_id].append(_node.id)
KNOWN_TOPICS = {topic for node in GRAPH.nodes for topic in node.topics}
UNKNOWN_CONFIG_TOPICS = KNOWN_TOPICS - TOPIC_CATEGORIES.keys()
if UNKNOWN_CONFIG_TOPICS:
    raise RuntimeError(f"Missing topic configuration: {sorted(UNKNOWN_CONFIG_TOPICS)}")
POSITIONS, GRAPH_BOUNDS, TOPIC_LANES = deterministic_layout(GRAPH)
LAYOUT_VERSION = f"{LAYOUT_NAME}-{GRAPH.schema_version}"


def filter_options() -> FilterOptions:
    return FilterOptions(
        topics=[
            TopicOption(id=topic_id, **TOPIC_CATEGORIES[topic_id])
            for topic_id in TOPIC_CATEGORIES
            if topic_id in KNOWN_TOPICS
        ],
        kinds=sorted({node.kind for node in GRAPH.nodes}, key=lambda value: value.value),
        statuses=sorted(
            {node.status for node in GRAPH.nodes}, key=lambda value: value.value
        ),
        levels=sorted({node.level for node in GRAPH.nodes}, key=lambda value: value.value),
        edge_types=sorted({edge.type for edge in GRAPH.edges}, key=lambda value: value.value),
    )


def build_graph_response(query: GraphQuery) -> GraphResponse:
    unknown_topics = sorted(set(query.topics) - KNOWN_TOPICS)
    if unknown_topics:
        raise UnknownTopicsError(unknown_topics)

    selected_nodes = [
        node
        for node in GRAPH.nodes
        if (not query.topics or set(query.topics).intersection(node.topics))
        and (not query.kinds or node.kind in query.kinds)
        and (not query.statuses or node.status in query.statuses)
        and (not query.levels or node.level in query.levels)
    ]
    selected_ids = {node.id for node in selected_nodes}
    selected_primary_topics = {node.topics[0] for node in selected_nodes}
    selected_edges = [
        edge
        for edge in GRAPH.edges
        if edge.from_ in selected_ids
        and edge.to in selected_ids
        and (not query.edge_types or edge.type in query.edge_types)
    ]

    return GraphResponse(
        schema_version=GRAPH.schema_version,
        layout_version=LAYOUT_VERSION,
        nodes=[
            PositionedNode(
                id=node.id,
                title=node.title,
                summary=node.summary,
                kind=node.kind,
                topics=node.topics,
                level=node.level,
                status=node.status,
                evidence_note=node.evidence_note,
                x=POSITIONS[node.id][0],
                y=POSITIONS[node.id][1],
                parent_id=node.parent_id,
                children=CHILDREN[node.id],
            )
            for node in selected_nodes
        ],
        edges=[
            RenderEdge(
                **{
                    "from": edge.from_,
                    "to": edge.to,
                    "type": edge.type,
                    "strength": edge.strength,
                    "min_depth": edge.min_depth,
                    "source_depth": edge.source_depth,
                }
            )
            for edge in selected_edges
        ],
        bounds=GRAPH_BOUNDS,
        lanes=[lane for lane in TOPIC_LANES if lane.id in selected_primary_topics],
        options=filter_options(),
    )


def related_edge(edge: GraphEdge, counterpart_id: str, relation: str) -> RelatedEdge:
    counterpart = NODE_BY_ID[counterpart_id]
    return RelatedEdge(
        node_id=counterpart.id,
        node_title=counterpart.title,
        relation=relation,
        type=edge.type,
        strength=edge.strength,
        rationale=edge.rationale,
        min_depth=edge.min_depth,
        source_depth=edge.source_depth,
    )


def build_node_details(node_id: str) -> NodeDetailsResponse:
    node = NODE_BY_ID.get(node_id)
    if node is None:
        raise UnknownNodeError(node_id)

    prerequisites: list[RelatedEdge] = []
    dependents: list[RelatedEdge] = []
    other_relations: list[RelatedEdge] = []
    learning_types = {EdgeType.PREREQUISITE, EdgeType.RECOMMENDED_BEFORE}

    for edge in GRAPH.edges:
        if edge.to == node.id and edge.type in learning_types:
            prerequisites.append(related_edge(edge, edge.from_, "incoming"))
        elif edge.from_ == node.id and edge.type in learning_types:
            dependents.append(related_edge(edge, edge.to, "outgoing"))
        elif edge.to == node.id:
            other_relations.append(related_edge(edge, edge.from_, "incoming"))
        elif edge.from_ == node.id:
            other_relations.append(related_edge(edge, edge.to, "outgoing"))

    sort_key = lambda item: (item.type.value, item.node_title.casefold(), item.node_id)
    prerequisites.sort(key=sort_key)
    dependents.sort(key=sort_key)
    other_relations.sort(key=sort_key)
    return NodeDetailsResponse(
        node=node,
        prerequisites=prerequisites,
        dependents=dependents,
        other_relations=other_relations,
        children=[NODE_BY_ID[child_id] for child_id in CHILDREN[node.id]],
        parent=NODE_BY_ID.get(node.parent_id),
    )


def build_learning_path(request: LearningPathRequest) -> LearningPathResponse:
    """Resolve required AND dependencies, propagating the depth needed at each step.

    Membership never implies learning every sibling. A container is only a visual
    shell unless it is itself requested by a prerequisite. Recommended edges do
    not enter a required path. Incoming application-only edges activate only for
    tasks, and source_depth can request conceptual knowledge of a prerequisite.
    """
    if request.node_id not in NODE_BY_ID:
        raise UnknownNodeError(request.node_id)
    incoming: dict[str, list[tuple[int, GraphEdge]]] = defaultdict(list)
    for index, edge in enumerate(GRAPH.edges):
        if edge.type == EdgeType.PREREQUISITE and edge.strength == EdgeStrength.REQUIRED:
            incoming[edge.to].append((index, edge))
    required: dict[str, MasteryDepth] = {}
    active: set[tuple[str, MasteryDepth]] = set()
    selected_edges: set[int] = set()

    def visit(node_id: str, depth: MasteryDepth) -> None:
        key = (node_id, depth)
        if key in active:
            raise RuntimeError(f"Cycle in learning path at {node_id}")
        previous = required.get(node_id)
        if previous == MasteryDepth.APPLY or previous == depth:
            return
        active.add(key)
        required[node_id] = depth
        for index, edge in incoming[node_id]:
            if depth == MasteryDepth.UNDERSTAND and edge.min_depth == MasteryDepth.APPLY:
                continue
            selected_edges.add(index)
            visit(edge.from_, edge.source_depth or depth)
        active.remove(key)

    visit(request.node_id, request.depth)
    # Stable topological stages include every branch and count shared skills once.
    stage: dict[str, int] = {}
    def stage_for(node_id: str) -> int:
        if node_id not in stage:
            parents = [GRAPH.edges[i].from_ for i in selected_edges if GRAPH.edges[i].to == node_id]
            stage[node_id] = 1 + max((stage_for(parent) for parent in parents), default=-1)
        return stage[node_id]
    for node_id in required:
        stage_for(node_id)
    ordered = sorted(required, key=lambda node_id: (stage[node_id], NODE_BY_ID[node_id].title, node_id))
    containers = sorted({NODE_BY_ID[node_id].parent_id for node_id in required if NODE_BY_ID[node_id].parent_id})
    return LearningPathResponse(
        target_id=request.node_id,
        depth=request.depth,
        node_ids=ordered,
        container_ids=containers,
        edge_indices=sorted(selected_edges),
        steps=[PathStep(node_id=node_id, depth=required[node_id], stage=stage[node_id]) for node_id in ordered],
    )


def health_response() -> HealthResponse:
    return HealthResponse(
        status="ok",
        nodes=len(GRAPH.nodes),
        edges=len(GRAPH.edges),
        layout_version=LAYOUT_VERSION,
    )
