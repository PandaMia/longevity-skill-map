# Deploy

Deploy the application with Docker Compose behind the existing host-level Caddy.

| Setting | Value |
|---|---|
| Server directory | `/srv/longevity-skill-map` |
| Public URL | `https://longevity-skill-map.pandamia.org` |
| Host upstream | `127.0.0.1:18000` |
| Application port inside Docker | `8000` |
| Compose service / container | `app` / `longevity-skill-map` |

Docker Compose runs only the FastAPI application. The existing host-level Caddy
owns ports 80/443 and HTTPS certificates. This project's `Caddyfile` is a site
block to merge into the shared configuration, not a replacement for it.

The image contains the graph, Python application and static frontend. No model
weights, database, Node.js runtime, secrets or persistent volumes are needed.
The graph is checked during the image build and loaded at application startup.

## 1. Server prerequisites and DNS

Use a server with Docker Engine and the Docker Compose v2 plugin installed.
The shared host-level Caddy service should already be running.

```bash
docker --version
docker compose version
sudo systemctl status caddy --no-pager
```

Point `longevity-skill-map.pandamia.org` to the server's public IP. If an AAAA
record exists, it must point to a working IPv6 address on the same server.
Ports 80 and 443 must reach the existing Caddy service.

```bash
dig +short A longevity-skill-map.pandamia.org
dig +short AAAA longevity-skill-map.pandamia.org
```

Check that port `18000` is available before starting the container:

```bash
sudo ss -ltnp 'sport = :18000'
```

If the domain or port needs to change, update the site block in `Caddyfile` and
the host port in `docker-compose.yml` together. Keep the host binding on
`127.0.0.1`; do not publish the application directly on a public interface.

## 2. Clone the repository

Commit and push the application and deployment files before cloning or updating
the server checkout.

```bash
sudo mkdir -p /srv/longevity-skill-map
sudo chown "$(id -u):$(id -g)" /srv/longevity-skill-map
git clone https://github.com/PandaMia/longevity-skill-map.git /srv/longevity-skill-map
cd /srv/longevity-skill-map
```

For an existing checkout, skip cloning and use the update instructions below.
If the repository is private, use your usual Git authentication on the server.

## 3. Build and start the application

```bash
cd /srv/longevity-skill-map
docker compose config --quiet
docker compose up -d --build --wait --wait-timeout 120
```

The container runs as a non-root user, uses a read-only root filesystem and has
a small temporary filesystem at `/tmp`. Logs go to Docker with size limits.
`restart: unless-stopped` restarts the service after crashes or a Docker/host
restart, unless it was explicitly stopped.

Check the application before changing Caddy:

```bash
docker compose ps
curl --fail --silent --show-error http://127.0.0.1:18000/health
curl --fail --silent --show-error -o /dev/null http://127.0.0.1:18000/
```

The health response is JSON with `"status":"ok"`, node/edge counts and the
layout version. Counts change when the curriculum changes.

If startup fails:

```bash
docker compose logs --tail=100 app
docker inspect --format '{{json .State.Health}}' longevity-skill-map
```

## 4. Add the site to the shared Caddy configuration

Copy the site block from this project's `Caddyfile` into the existing
`/etc/caddy/Caddyfile` on the server. If that shared file uses imports, place the
block in its existing imported site directory instead. Add it only once.

Add the block as a separate top-level site, outside any existing block.

```caddyfile
longevity-skill-map.pandamia.org {
    encode zstd gzip
    reverse_proxy 127.0.0.1:18000
}
```

**Do not replace the shared file with this project's Caddyfile.** Retain its
existing configuration. No additional Caddy
container or Caddy service is started by this project.

Paste plain Caddyfile text: Markdown fences such as \`\`\`graphql and chat-escaped
forms such as `reverse\_proxy` or `root \*` are not configuration syntax. The
actual directives are `reverse_proxy` and `root *`.

Validate the complete shared configuration, then reload it only if validation
succeeds:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile \
  && sudo systemctl reload caddy
```

Caddy forwards the original host and scheme. Uvicorn is configured to accept
forwarded headers because the app's published port is reachable via host
loopback; Docker may present the host proxy as a bridge address.

## 5. Verify HTTPS and the learning-path API

```bash
curl --fail --silent --show-error https://longevity-skill-map.pandamia.org/health
curl --fail --silent --show-error -o /dev/null -w '%{http_code}\n' \
  https://longevity-skill-map.pandamia.org/
curl --fail --silent --show-error \
  https://longevity-skill-map.pandamia.org/api/learning-path \
  -H 'Content-Type: application/json' \
  --data '{"node_id":"flow_gating","depth":"apply"}'
```

Expect an `ok` health response, HTTP `200` for the page, and a path response with
`"target_id":"flow_gating"` and `"depth":"apply"`. In the browser, verify a
container expansion, node details, **Lock learning path**, depth switching and
**Reset path**.

For proxy or certificate problems, inspect the existing host service:

```bash
sudo journalctl -u caddy -n 100 --no-pager
```

## 6. Update the application and graph

```bash
cd /srv/longevity-skill-map
git pull --ff-only
docker compose up -d --build --wait --wait-timeout 120
curl --fail --silent --show-error http://127.0.0.1:18000/health
```

Graph and frontend changes require an image rebuild because they are bundled
into the image. The app reloads the graph when its container starts. Refresh the
browser after frontend updates.

An ordinary application update does **not** require reloading the shared Caddy
service. Validate and reload Caddy only when its site configuration changes.
This single-container setup can have a brief interruption during replacement.

## 7. Stop, restart and inspect this service

Run these commands from `/srv/longevity-skill-map`:

```bash
docker compose logs -f app
docker compose ps
docker compose restart app
docker compose stop app
docker compose start app
```

To remove this application's containers and private Compose network:

```bash
docker compose down
```

If retiring the public site, remove only its block from the shared Caddy configuration,
validate the complete configuration and reload Caddy.

## References

- [FastAPI in Docker](https://fastapi.tiangolo.com/deployment/docker/)
- [FastAPI behind a proxy](https://fastapi.tiangolo.com/advanced/behind-a-proxy/)
- [Caddy reverse proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)
