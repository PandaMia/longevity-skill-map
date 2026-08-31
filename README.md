# longevity-skill-map

A prerequisite and skill map for research on radical healthy life extension.

## Project files

- [Machine-readable graph](graph/longevity-skills.json)
- [Graph schema and example learning routes](graph/README.md)
- [Map construction rules](research/map-rules.md)
- [Longevity direction review](research/longevity-directions.md)

## Graph validation

```bash
python3 scripts/validate_graph.py
```

## Web visualization

Application structure:

```text
app.py             FastAPI initialization, endpoints, and local runner
config/models.py   Pydantic models and enums
config/graph.py    Graph loading, validation, queries, and deterministic layout
config/settings.py Filesystem and layout settings
static/index.html  Page structure
static/styles.css  Visual styles
static/app.js      Graph rendering and interactions
```

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000) after startup. Node positions are computed deterministically and remain unchanged across application restarts.

Application tests:

```bash
python -m unittest discover -s tests -v
```
