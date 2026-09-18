# The Harness repository does not contain the Sub2API server source. This
# wrapper keeps the backend deployment in Docker while the client runs in the
# ThunderUni Desktop package.
ARG SUB2API_IMAGE=weishaw/sub2api:latest
FROM ${SUB2API_IMAGE}

EXPOSE 8080
