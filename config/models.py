from __future__ import annotations

from enum import Enum
from typing import Annotated, Any

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class NodeKind(str, Enum):
    FOUNDATION = "foundation"
    DISCIPLINE = "discipline"
    SKILL = "skill"
    TECHNOLOGY = "technology"
    RESEARCH_DIRECTION = "research_direction"
    INTEGRATION_GOAL = "integration_goal"


class NodeLevel(str, Enum):
    SCHOOL = "school"
    INTRODUCTORY = "introductory"
    UNDERGRADUATE = "undergraduate"
    GRADUATE = "graduate"
    PROFESSIONAL = "professional"
    FRONTIER = "frontier"


class NodeStatus(str, Enum):
    FOUNDATIONAL = "foundational"
    ESTABLISHED_BIOLOGY = "established_biology"
    ACTIVE_PRECLINICAL = "active_preclinical"
    EARLY_CLINICAL = "early_clinical"
    CLINICAL_PLATFORM = "clinical_platform"
    SPECULATIVE = "speculative"


class EdgeType(str, Enum):
    PREREQUISITE = "prerequisite"
    RECOMMENDED_BEFORE = "recommended_before"
    APPLIED_IN = "applied_in"
    ENABLES = "enables"
    PART_OF = "part_of"
    COMPLEMENTS = "complements"


class EdgeStrength(str, Enum):
    REQUIRED = "required"
    RECOMMENDED = "recommended"
    CONTEXTUAL = "contextual"


class MasteryDepth(str, Enum):
    UNDERSTAND = "understand"
    APPLY = "apply"


class ResourceLanguage(str, Enum):
    ENGLISH = "en"
    RUSSIAN = "ru"


class LearningOutcomes(StrictModel):
    understand: str = Field(min_length=1, max_length=1200)
    apply: str = Field(min_length=1, max_length=1200)


NodeId = Annotated[str, Field(min_length=1, max_length=96, pattern=r"^[a-z0-9_]+$")]
TopicName = Annotated[str, Field(min_length=1, max_length=64, pattern=r"^[a-z0-9_]+$")]


class LearningResource(StrictModel):
    title: str = Field(min_length=1, max_length=240)
    url: HttpUrl
    type: str = Field(min_length=1, max_length=64)
    provider: str = Field(min_length=1, max_length=160)
    level: NodeLevel
    section: str | None = None
    depth: MasteryDepth = MasteryDepth.UNDERSTAND
    language: ResourceLanguage = ResourceLanguage.ENGLISH


class PracticeExercise(StrictModel):
    id: NodeId
    title: str = Field(min_length=1, max_length=240)
    objective: str = Field(min_length=1, max_length=1200)
    steps: list[Annotated[str, Field(min_length=1, max_length=1200)]] = Field(min_length=2, max_length=12)
    deliverable: str = Field(min_length=1, max_length=1200)
    success_criteria: list[Annotated[str, Field(min_length=1, max_length=1200)]] = Field(min_length=2, max_length=12)
    resources: list[LearningResource] = Field(min_length=1, max_length=8)


class GraphNode(StrictModel):
    id: NodeId
    title: str = Field(min_length=1, max_length=180)
    summary: str = Field(min_length=1, max_length=1200)
    kind: NodeKind
    topics: list[TopicName] = Field(min_length=1, max_length=8)
    level: NodeLevel
    status: NodeStatus
    resources: list[LearningResource] = Field(min_length=1, max_length=16)
    evidence_note: str | None = Field(default=None, max_length=1600)
    parent_id: NodeId | None = None
    outcomes: LearningOutcomes
    practice: str = Field(min_length=1, max_length=1200)
    exercises: list[PracticeExercise] = Field(default_factory=list, max_length=12)

    @field_validator("exercises")
    @classmethod
    def unique_exercise_ids(cls, exercises: list[PracticeExercise]) -> list[PracticeExercise]:
        if len({exercise.id for exercise in exercises}) != len(exercises):
            raise ValueError("Exercise IDs must be unique within a node")
        return exercises


class GraphEdge(StrictModel):
    from_: NodeId = Field(alias="from")
    to: NodeId
    type: EdgeType
    strength: EdgeStrength
    rationale: str = Field(min_length=1, max_length=600)
    min_depth: MasteryDepth = MasteryDepth.UNDERSTAND
    source_depth: MasteryDepth | None = None

    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class ExcludedDirection(StrictModel):
    id: NodeId
    reason: str = Field(min_length=1, max_length=1200)
    disposition: str = Field(min_length=1, max_length=800)


class GraphFile(StrictModel):
    schema_version: str
    generated_at: str
    language: str
    edge_direction: str
    status_values: list[str]
    nodes: list[GraphNode]
    edges: list[GraphEdge]
    excluded_directions: list[ExcludedDirection]


class GraphQuery(StrictModel):
    topics: list[TopicName] = Field(default_factory=list, max_length=16)
    kinds: list[NodeKind] = Field(default_factory=list, max_length=8)
    statuses: list[NodeStatus] = Field(default_factory=list, max_length=8)
    levels: list[NodeLevel] = Field(default_factory=list, max_length=8)
    edge_types: list[EdgeType] = Field(default_factory=list, max_length=8)

    @field_validator("topics", "kinds", "statuses", "levels", "edge_types")
    @classmethod
    def deduplicate(cls, values: list[Any]) -> list[Any]:
        return list(dict.fromkeys(values))


class NodeDetailsRequest(StrictModel):
    node_id: NodeId


class LearningPathRequest(StrictModel):
    node_id: NodeId
    depth: MasteryDepth = MasteryDepth.UNDERSTAND


class PathStep(StrictModel):
    node_id: NodeId
    depth: MasteryDepth
    stage: int


class LearningPathResponse(StrictModel):
    target_id: NodeId
    depth: MasteryDepth
    node_ids: list[NodeId]
    container_ids: list[NodeId]
    edge_indices: list[int]
    steps: list[PathStep]


class PositionedNode(StrictModel):
    id: NodeId
    title: str
    summary: str
    kind: NodeKind
    topics: list[TopicName]
    level: NodeLevel
    status: NodeStatus
    evidence_note: str | None
    x: float
    y: float
    parent_id: NodeId | None
    children: list[NodeId]


class RenderEdge(StrictModel):
    from_: NodeId = Field(alias="from")
    to: NodeId
    type: EdgeType
    strength: EdgeStrength
    min_depth: MasteryDepth
    source_depth: MasteryDepth | None

    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class GraphBounds(StrictModel):
    min_x: float
    min_y: float
    width: float
    height: float


class TopicOption(StrictModel):
    id: TopicName
    label: str
    color: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")


class TopicLane(StrictModel):
    id: TopicName
    label: str
    color: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")
    y: float
    height: float


class FilterOptions(StrictModel):
    topics: list[TopicOption]
    kinds: list[NodeKind]
    statuses: list[NodeStatus]
    levels: list[NodeLevel]
    edge_types: list[EdgeType]


class GraphResponse(StrictModel):
    schema_version: str
    layout_version: str
    nodes: list[PositionedNode]
    edges: list[RenderEdge]
    bounds: GraphBounds
    lanes: list[TopicLane]
    options: FilterOptions


class RelatedEdge(StrictModel):
    node_id: NodeId
    node_title: str
    relation: str
    type: EdgeType
    strength: EdgeStrength
    rationale: str
    min_depth: MasteryDepth
    source_depth: MasteryDepth | None


class NodeDetailsResponse(StrictModel):
    node: GraphNode
    prerequisites: list[RelatedEdge]
    dependents: list[RelatedEdge]
    other_relations: list[RelatedEdge]
    children: list[GraphNode]
    parent: GraphNode | None


class HealthResponse(StrictModel):
    status: str
    nodes: int
    edges: int
    layout_version: str
