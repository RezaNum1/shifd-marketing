# Nginx API timeouts

Creative Reference generation now returns a persisted batch immediately and runs image generation in the backend background. The API route should no longer remain open while all slides are generated.

For the production Nginx `location` that proxies `/api/` to Fastify, set the upstream timeouts to five minutes. Keep the existing `proxy_pass` and forwarding headers for this site:

```nginx
location /api/ {
    # Keep the existing proxy_pass and proxy_set_header directives here.
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
