// @vitest-environment node
// (The Vite configuration loads the build toolchain, which cannot run inside the simulated browser.)
import { describe, expect, it } from 'vitest';
import nginxConfig from '../../nginx.conf?raw';
import viteConfig from '../../vite.config';

/**
 * The browser reaches both services through one origin. In production Nginx does the routing; in
 * development the Vite dev server does. These checks read the two configurations. They prove what is
 * configured, not that Nginx behaves: the end-to-end tests exercise the Vite routing for real.
 */

/** The body of the `location <prefix> { ... }` block, or undefined when there is no such block. */
function nginxLocation(prefix: string): string | undefined {
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  return new RegExp(`location\\s+${escaped}\\s*\\{([^}]*)\\}`).exec(nginxConfig)?.[1];
}

function viteProxyTarget(prefix: string): string | undefined {
  const proxy = viteConfig.server?.proxy as Record<string, string | { target?: string }> | undefined;
  const entry = proxy?.[prefix];
  return typeof entry === 'string' ? entry : entry?.target;
}

describe('Gateway: Nginx', () => {
  it('AC-4.3 sends /api/register/ to the register service', () => {
    expect(nginxLocation('/api/register/')).toMatch(/proxy_pass\s+http:\/\/product-crud:8080;/);
  });

  it('AC-4.3 sends every other /api/ path, /health and /uploads/ to the inspection service', () => {
    expect(nginxLocation('/api/')).toMatch(/proxy_pass\s+http:\/\/inspection-api:4000;/);
    expect(nginxLocation('/health')).toMatch(/proxy_pass\s+http:\/\/inspection-api:4000;/);
    expect(nginxLocation('/uploads/')).toMatch(/proxy_pass\s+http:\/\/inspection-api:4000;/);
  });

  it('AC-4.3 does not rewrite the path on the way to either service', () => {
    // A proxy_pass with a path after the host would strip the matched prefix; the services expect it.
    expect(nginxConfig).not.toMatch(/proxy_pass\s+http:\/\/[^/;]+\/[^;]*;/);
  });
});

describe('Gateway: Vite dev server', () => {
  it('AC-4.3 sends /api/register to the register service on port 8080', () => {
    expect(viteProxyTarget('/api/register')).toBe('http://localhost:8080');
  });

  it('AC-4.3 sends every other /api path, /health and /uploads to the inspection service on port 4000', () => {
    expect(viteProxyTarget('/api')).toBe('http://localhost:4000');
    expect(viteProxyTarget('/health')).toBe('http://localhost:4000');
    expect(viteProxyTarget('/uploads')).toBe('http://localhost:4000');
  });

  it('AC-4.3 lists the register rule before the general /api rule, because the first match wins', () => {
    const prefixes = Object.keys(viteConfig.server?.proxy ?? {});

    expect(prefixes.indexOf('/api/register')).toBeGreaterThanOrEqual(0);
    expect(prefixes.indexOf('/api/register')).toBeLessThan(prefixes.indexOf('/api'));
  });
});
