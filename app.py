from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from config.graph import (
    UnknownNodeError,
    UnknownTopicsError,
    build_graph_response,
    build_node_details,
    health_response,
    build_learning_path,
)
from config.models import (
    GraphQuery,
    GraphResponse,
    HealthResponse,
    NodeDetailsRequest,
    NodeDetailsResponse,
    LearningPathRequest,
    LearningPathResponse,
)
from config.settings import INDEX_PATH, STATIC_DIR

app = FastAPI(
    title="Longevity Skill Map",
    version="0.1.0",
    description="Static, deterministic visualization of the longevity skill graph.",
)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/", response_class=FileResponse, include_in_schema=False)
def index() -> FileResponse:
    return FileResponse(INDEX_PATH)


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return health_response()


@app.get("/api/graph", response_model=GraphResponse)
def get_full_graph() -> GraphResponse:
    return build_graph_response(GraphQuery())


@app.post("/api/graph/query", response_model=GraphResponse)
def query_graph(query: GraphQuery) -> GraphResponse:
    try:
        return build_graph_response(query)
    except UnknownTopicsError as error:
        raise HTTPException(
            status_code=422,
            detail={"unknown_topics": error.topics},
        ) from error


@app.post("/api/nodes/details", response_model=NodeDetailsResponse)
def node_details(request: NodeDetailsRequest) -> NodeDetailsResponse:
    try:
        return build_node_details(request.node_id)
    except UnknownNodeError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@app.post("/api/learning-path", response_model=LearningPathResponse)
def learning_path(request: LearningPathRequest) -> LearningPathResponse:
    try:
        return build_learning_path(request)
    except UnknownNodeError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=False)
