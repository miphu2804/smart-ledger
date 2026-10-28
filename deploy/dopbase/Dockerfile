# Dopbase publishes release archives but no image, so this one wraps the pinned release and checks its digest.
# To upgrade, change the version and both digests from the release page of github.com/dopbase/dopbase.
FROM debian:bookworm-slim

ARG DOPBASE_VERSION=0.1.10
ARG SHA256_AMD64=b294f56057cb21f5ca22348944ac538ed4d6a751282b342c96761483a3114868
ARG SHA256_ARM64=6a5c973944ed222d398c0e542a05b6321de706201c56222de652fd85329007f5
ARG TARGETARCH

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \
    && archive="dopbase_${DOPBASE_VERSION}_linux_${TARGETARCH}.tar.gz" \
    && sha="$([ "$TARGETARCH" = arm64 ] && echo "$SHA256_ARM64" || echo "$SHA256_AMD64")" \
    && curl -fsSLo "/tmp/$archive" "https://github.com/dopbase/dopbase/releases/download/${DOPBASE_VERSION}/$archive" \
    && echo "$sha  /tmp/$archive" | sha256sum -c - \
    && tar -xzf "/tmp/$archive" -C /usr/local/bin dopbase \
    && rm "/tmp/$archive" && rm -rf /var/lib/apt/lists/*

ENV DOPBASE_DATA_DIR=/data \
    DOPBASE_HOST=0.0.0.0 \
    DOPBASE_PORT=8840
VOLUME /data
EXPOSE 8840
CMD ["dopbase", "server", "start"]
