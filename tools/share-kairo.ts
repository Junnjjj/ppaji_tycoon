import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { once } from 'node:events';
import { resolve4 } from 'node:dns/promises';
import { createBuildIdentity, type BuildIdentity } from './build-identity.js';
export type { BuildIdentity } from './build-identity.js';

export interface PortOwner {
  pid: number;
  command: string;
}

interface InspectSharePortOptions {
  port: number;
  expected: BuildIdentity;
  findOwners: (port: number) => Promise<readonly PortOwner[]>;
  readIdentity: (origin: string) => Promise<BuildIdentity | null>;
}

export type SharePortInspection =
  | { kind: 'free' }
  | { kind: 'reuse'; identity: BuildIdentity; owners: readonly PortOwner[] };

function isBuildIdentity(value: unknown): value is BuildIdentity {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return ['sha', 'shortSha', 'branch', 'sourceDigest', 'startedAt']
    .every((key) => typeof item[key] === 'string' && item[key] !== '');
}

function reusableIdentity(actual: BuildIdentity, expected: BuildIdentity): boolean {
  return actual.sha === expected.sha &&
    actual.branch === expected.branch &&
    actual.sourceDigest === expected.sourceDigest;
}

function identityDiff(actual: BuildIdentity, expected: BuildIdentity): string[] {
  const keys = ['sha', 'shortSha', 'branch', 'sourceDigest', 'startedAt'] as const;
  return keys
    .filter((key) => actual[key] !== expected[key])
    .map((key) => `${key}: ${actual[key]} != ${expected[key]}`);
}

/** 외부 URL은 HTTP 상태가 아니라 이번 실행의 정체 전부가 일치해야 성공이다. */
export function assertBuildIdentity(
  actual: BuildIdentity | null,
  expected: BuildIdentity,
  source: string,
): void {
  if (!actual) throw new Error(`${source}: build identity 없음 (예상 SHA ${expected.sha})`);
  const diff = identityDiff(actual, expected);
  if (diff.length > 0) {
    throw new Error(`${source}: build identity 불일치 — ${diff.join(' · ')}`);
  }
}

/**
 * Vite를 띄우기 전에 요청 포트의 소유권을 확정한다.
 *
 * 같은 HEAD·branch·working-tree content의 Vite만 재사용하고, 나머지는 PID를 밝힌 뒤 중단한다. 이 경계가
 * 먼저 실행되므로 Vite의 다음 포트 자동 이동을 공유 명령이 성공으로 오인할 수 없다.
 */
export async function inspectSharePort(
  options: InspectSharePortOptions,
): Promise<SharePortInspection> {
  const owners = await options.findOwners(options.port);
  if (owners.length === 0) return { kind: 'free' };

  const origin = `http://127.0.0.1:${options.port}`;
  const actual = await options.readIdentity(origin);
  if (actual && reusableIdentity(actual, options.expected)) {
    return { kind: 'reuse', identity: actual, owners };
  }

  const ownerText = owners.map((owner) => `PID ${owner.pid} (${owner.command})`).join(', ');
  const actualText = actual
    ? `응답 SHA ${actual.sha}, source ${actual.sourceDigest}`
    : 'build identity 없음';
  throw new Error(
    `포트 ${options.port}가 ${ownerText}에 점유됨 — ${actualText}. ` +
      '기존 프로세스를 확인한 뒤 명시적으로 종료하고 다시 실행하세요.',
  );
}

export function currentBuildIdentity(cwd: string, startedAt = new Date().toISOString()): BuildIdentity {
  return createBuildIdentity(cwd, { startedAt });
}

/** Quick Tunnel 생성 직후 로컬 NXDOMAIN 캐시가 남아도 권위 DNS의 새 주소로 검증한다. */
export function tunnelResolution(
  origin: string,
  address: string,
): { curlResolve: string; chromeRule: string } {
  const url = new URL(origin);
  const port = url.port || (url.protocol === 'https:' ? '443' : '80');
  return {
    curlResolve: `${url.hostname}:${port}:${address}`,
    chromeRule: `MAP ${url.hostname} ${address}`,
  };
}

export async function readBuildIdentity(origin: string): Promise<BuildIdentity | null> {
  try {
    const endpoint = new URL('/__ppaji_build', origin);
    let value: unknown;
    if (endpoint.protocol === 'https:' && endpoint.hostname.endsWith('.trycloudflare.com')) {
      const [address] = await resolve4(endpoint.hostname);
      if (!address) return null;
      const resolution = tunnelResolution(origin, address);
      const raw = execFileSync(
        'curl',
        ['-fsS', '--max-time', '3', '--resolve', resolution.curlResolve, endpoint.toString()],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
      );
      value = JSON.parse(raw) as unknown;
    } else {
      const response = await fetch(endpoint, {
        signal: AbortSignal.timeout(2_000),
        cache: 'no-store',
      });
      if (!response.ok) return null;
      value = await response.json() as unknown;
    }
    return isBuildIdentity(value) ? value : null;
  } catch {
    return null;
  }
}

export async function findPortOwners(port: number): Promise<readonly PortOwner[]> {
  let raw: string;
  try {
    raw = execFileSync(
      'lsof',
      ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-Fpc'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 1) return [];
    throw new Error(`포트 ${port} 소유자를 lsof로 확인하지 못했습니다: ${String(error)}`);
  }

  const owners: PortOwner[] = [];
  let pid: number | null = null;
  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith('p')) {
      pid = Number(line.slice(1));
      continue;
    }
    if (line.startsWith('c') && pid !== null && Number.isInteger(pid)) {
      owners.push({ pid, command: line.slice(1) || '?' });
    }
  }
  return owners;
}

interface ParsedArgs {
  port: number;
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  let port = 5173;
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--port') {
      const value = argv[index + 1];
      if (!value) throw new Error('--port 뒤에 포트 번호가 필요합니다.');
      port = Number(value);
      index++;
      continue;
    }
    if (arg?.startsWith('--port=')) {
      port = Number(arg.slice('--port='.length));
      continue;
    }
    throw new Error(`알 수 없는 인자: ${arg ?? ''}`);
  }
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`유효하지 않은 포트: ${String(port)}`);
  }
  return { port };
}

async function waitForIdentity(
  origin: string,
  expected: BuildIdentity,
  child?: ChildProcess,
): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child && child.exitCode !== null) {
      throw new Error(`Vite가 health check 전에 종료했습니다 (code ${String(child.exitCode)}).`);
    }
    const actual = await readBuildIdentity(origin);
    if (actual) {
      assertBuildIdentity(actual, expected, origin);
      return;
    }
    await new Promise<void>((resolveWait) => setTimeout(resolveWait, 200));
  }
  throw new Error(`${origin}: 30초 안에 build identity health check가 준비되지 않았습니다.`);
}

function startVite(cwd: string, port: number, identity: BuildIdentity): ChildProcess {
  const viteBin = resolve(cwd, 'node_modules/vite/bin/vite.js');
  return spawn(
    process.execPath,
    [viteBin, '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    {
      cwd,
      stdio: 'inherit',
      env: {
        ...process.env,
        PPAJI_BUILD_SHA: identity.sha,
        PPAJI_BUILD_SHORT_SHA: identity.shortSha,
        PPAJI_BUILD_BRANCH: identity.branch,
        PPAJI_BUILD_SOURCE_DIGEST: identity.sourceDigest,
        PPAJI_BUILD_STARTED_AT: identity.startedAt,
      },
    },
  );
}

async function startTunnel(origin: string): Promise<{ child: ChildProcess; url: string }> {
  const child = spawn('cloudflared', ['tunnel', '--url', origin, '--no-autoupdate'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let buffer = '';
  let settled = false;
  const url = await new Promise<string>((resolveUrl, rejectUrl) => {
    const timer = setTimeout(() => {
      if (!settled) rejectUrl(new Error('cloudflared가 45초 안에 외부 URL을 내지 않았습니다.'));
    }, 45_000);
    const consume = (chunk: Buffer, stderr: boolean): void => {
      const text = chunk.toString();
      (stderr ? process.stderr : process.stdout).write(text);
      buffer = (buffer + text).slice(-16_384);
      const match = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i.exec(buffer);
      if (match && !settled) {
        settled = true;
        clearTimeout(timer);
        resolveUrl(match[0]);
      }
    };
    child.stdout?.on('data', (chunk: Buffer) => consume(chunk, false));
    child.stderr?.on('data', (chunk: Buffer) => consume(chunk, true));
    child.once('error', (error) => {
      clearTimeout(timer);
      rejectUrl(new Error(`cloudflared 시작 실패: ${error.message}`));
    });
    child.once('exit', (code) => {
      if (!settled) {
        clearTimeout(timer);
        rejectUrl(new Error(`cloudflared가 URL 발급 전에 종료했습니다 (code ${String(code)}).`));
      }
    });
  });
  return { child, url };
}

async function runFocusedVerify(
  cwd: string,
  url: string,
  identity: BuildIdentity,
  chromeRule: string,
): Promise<void> {
  const tsxBin = resolve(cwd, 'node_modules/tsx/dist/cli.mjs');
  const child = spawn(
    process.execPath,
    [tsxBin, 'tools/verify-kairo.ts', '--identity'],
    {
      cwd,
      stdio: 'inherit',
      env: {
        ...process.env,
        PPAJI_URL: url,
        PPAJI_EXPECTED_SHA: identity.sha,
        PPAJI_EXPECTED_SOURCE_DIGEST: identity.sourceDigest,
        PPAJI_RESOLVE_RULE: chromeRule,
      },
    },
  );
  const [code] = await once(child, 'exit') as [number | null];
  if (code !== 0) throw new Error(`외부 focused verify 실패 (code ${String(code)}).`);
}

function stop(child: ChildProcess | undefined): void {
  if (child && child.exitCode === null && !child.killed) child.kill('SIGTERM');
}

async function main(): Promise<void> {
  const { port } = parseArgs(process.argv.slice(2));
  const cwd = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const wanted = currentBuildIdentity(cwd);
  const origin = `http://127.0.0.1:${port}`;
  console.log(
    `[share:kairo] ${wanted.branch}@${wanted.shortSha} · source ${wanted.sourceDigest} · ${wanted.startedAt}`,
  );

  const inspection = await inspectSharePort({
    port,
    expected: wanted,
    findOwners: findPortOwners,
    readIdentity: readBuildIdentity,
  });

  let vite: ChildProcess | undefined;
  const served = inspection.kind === 'reuse' ? inspection.identity : wanted;
  if (inspection.kind === 'reuse') {
    console.log(
      `[share:kairo] 같은 build를 제공 중인 PID ${inspection.owners.map((owner) => owner.pid).join(', ')} 재사용`,
    );
  } else {
    vite = startVite(cwd, port, wanted);
    await waitForIdentity(origin, wanted, vite);
  }

  let tunnel: ChildProcess | undefined;
  const cleanup = (): void => {
    stop(tunnel);
    stop(vite);
  };
  process.once('SIGINT', cleanup);
  process.once('SIGTERM', cleanup);

  try {
    const started = await startTunnel(origin);
    tunnel = started.child;
    await waitForIdentity(started.url, served, tunnel);
    const [externalAddress] = await resolve4(new URL(started.url).hostname);
    if (!externalAddress) throw new Error(`${started.url}: 권위 DNS에서 주소를 찾지 못했습니다.`);
    const resolution = tunnelResolution(started.url, externalAddress);
    await runFocusedVerify(cwd, started.url, served, resolution.chromeRule);
    console.log(
      `\n[share:kairo] 검증 완료: ${started.url}\n` +
        `  SHA ${served.sha}\n  branch ${served.branch}\n  source ${served.sourceDigest}\n` +
        '  capture tmp-shots/kairo-share-identity.png',
    );
    if (tunnel.exitCode === null) await once(tunnel, 'exit');
  } finally {
    cleanup();
  }
}

const entry = process.argv[1] ? resolve(process.argv[1]) : '';
if (entry === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(`[share:kairo] 실패: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
