# Nginx production API configuration

## Asset upload size

`POST /api/assets` accepts image files up to `ASSET_MAX_BYTES` (10 MiB by
default). Nginx's default `client_max_body_size` is 1 MiB, so it can reject a
valid upload with `413 Request Entity Too Large` before the request reaches
Fastify. Set the API location limit to 12 MiB to allow the default 10 MiB file
limit plus multipart headers and fields. If production uses a different
`ASSET_MAX_BYTES`, keep this Nginx limit larger than that value plus multipart
overhead.

Add `client_max_body_size 12m;` to the existing production Nginx `location`
that proxies `/api/` to Fastify. Keep the existing `proxy_pass` and forwarding
headers:

```nginx
location /api/ {
    # Keep the existing proxy_pass and proxy_set_header directives here.
    client_max_body_size 12m;
    proxy_connect_timeout 15s;
    proxy_send_timeout 300s;
    proxy_read_timeout 300s;
}
```

Apply this to the existing API location, rather than adding a second
overlapping location. Then validate and reload Nginx:

```sh
sudo nginx -t
sudo systemctl reload nginx
```

Fastify continues to enforce `ASSET_MAX_BYTES`, so raising the proxy limit does
not raise the application's accepted file size. The setting applies to both
Instagram Creative uploads and metric-evidence uploads.

## API proxy timeouts

Creative Reference generation now returns a persisted batch immediately and runs image generation in the backend background. The API route should no longer remain open while all slides are generated.

For the production Nginx `location` that proxies `/api/` to Fastify, use the upload size and upstream timeout directives together with the existing `proxy_pass` and forwarding headers:

```nginx
location /api/ {
    # Keep the existing proxy_pass and proxy_set_header directives here.
    client_max_body_size 12m;
    proxy_connect_timeout 15s;
    proxy_send_timeout 300s;
    proxy_read_timeout 300s;
}
```

Apply the directives to the existing API location rather than adding a second overlapping location. Then validate and reload Nginx:

```sh
sudo nginx -t
sudo systemctl reload nginx
```

The longer read timeout gives the API room for other slow upstream calls. Creative Reference polling itself uses short GET requests and does not need to hold one HTTP request open for the image generation duration.
