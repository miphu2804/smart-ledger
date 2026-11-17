# Runtime of scripts/infra/run.sh: Ansible, its collections, the Dopbase CLI and an ssh client, so any runner with
# Docker runs the same flow with no setup on the machine. The repository is mounted, not copied:
#   docker build -t smartledger-infra deploy/ansible
#   docker run --rm -v "$PWD:/work" -w /work -e SMARTLEDGER_VPS_HOST -e SMARTLEDGER_VPS_USER -e SSH_PRIVATE_KEY -e SSH_KNOWN_HOSTS \
#     -e DOPBASE_URL -e DOPBASE_TOKEN_CORE -e DOPBASE_TOKEN_AI -e DOPBASE_TOKEN_BIFROST -e DOPBASE_TOKEN_VPS \
#     -e DOPBASE_TOKEN_MONITOR smartledger-infra scripts/infra/run.sh plan staging --scope app
FROM python:3.15.0-slim-bookworm

ARG ANSIBLE_CORE_VERSION=2.21.5
# From the release page of github.com/dopbase/dopbase, as in .github/workflows/deploy-backend.yml; the digests
# change with the version.
ARG DOPBASE_VERSION=0.1.10
ARG DOPBASE_SHA256_AMD64=b294f56057cb21f5ca22348944ac538ed4d6a751282b342c96761483a3114868
ARG DOPBASE_SHA256_ARM64=6a5c973944ed222d398c0e542a05b6321de706201c56222de652fd85329007f5
ARG TARGETARCH

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl openssh-client \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir "ansible-core==${ANSIBLE_CORE_VERSION}"

COPY requirements.yml /tmp/requirements.yml
RUN ansible-galaxy collection install -r /tmp/requirements.yml -p /usr/share/ansible/collections \
    && rm /tmp/requirements.yml

RUN case "${TARGETARCH:-amd64}" in \
      amd64) sha="${DOPBASE_SHA256_AMD64}" ;; \
      arm64) sha="${DOPBASE_SHA256_ARM64}" ;; \
      *) echo "no Dopbase release for ${TARGETARCH}" >&2; exit 1 ;; \
    esac \
    && curl -fsSLo /tmp/dopbase.tar.gz "https://github.com/dopbase/dopbase/releases/download/${DOPBASE_VERSION}/dopbase_${DOPBASE_VERSION}_linux_${TARGETARCH:-amd64}.tar.gz" \
    && echo "${sha}  /tmp/dopbase.tar.gz" | sha256sum -c - \
    && tar -xzf /tmp/dopbase.tar.gz -C /usr/local/bin dopbase \
    && rm /tmp/dopbase.tar.gz

# Writable so entrypoint.sh can name the uid of `docker run --user`; the container is discarded after each run.
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod 0666 /etc/passwd
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
