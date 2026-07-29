# Security Policy

## Supported version

Security fixes are made against the latest `main` revision. This repository is
a single-process, local MCP server; it does not provide a hosted service,
multi-tenant boundary, or a guarantee that untrusted web content is safe to
execute.

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability. Report it to
the repository owner through GitHub's private vulnerability reporting flow, or
use the contact address published on the repository profile. Include a minimal
reproduction, affected revision, impact, and any suggested mitigation. An
initial acknowledgement is targeted within seven days.

## Deployment guidance

- Treat MCP clients and target URLs as trusted by default. Browser automation
  can submit forms, access authenticated sessions, and expose page data to an
  optional LLM provider.
- Keep `PHOENIX_ALLOW_PRIVATE_NETWORK` unset in normal deployments. It exists
  only for explicitly trusted local development targets.
- Store LLM credentials in the runtime secret mechanism; never bake `.env`
  files or API keys into an image, source control, logs, or prompts.
- Run with a non-root user and a read-only filesystem where practical. The
  supplied container configuration uses writable temporary filesystems only
  for browser and Phoenix runtime state.
- Restrict outbound network access at the host, container, or proxy layer. URL
  validation checks syntax, literal addresses, and DNS results before routed
  browser requests, but remains defense in depth rather than a replacement
  for DNS-aware egress policy.
- Review any use of browser evaluation tools and authenticated browsing before
  exposing the server to another user or agent.

## Supply-chain baseline

Use `npm ci` with the committed lockfile for reproducible dependency installs.
Before publishing or deploying a new image, run `npm run check`, the test suite
appropriate for the environment, and a dependency/image vulnerability scan.
Verify the image tag or digest in the deployment system rather than relying on
an unpinned `latest` tag.
