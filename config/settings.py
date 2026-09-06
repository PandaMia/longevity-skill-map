from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[1]
GRAPH_PATH = BASE_DIR / "graph" / "longevity-skills.json"
STATIC_DIR = BASE_DIR / "static"
INDEX_PATH = STATIC_DIR / "index.html"
LAYOUT_NAME = "topic-lanes-v1"
