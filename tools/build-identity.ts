import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync, readlinkSync } from 'node:fs';
import { relative, resolve } from 'node:path';

export interface BuildIdentity {
  sha: string;
  shortSha: string;
  branch: string;
  sourceDigest: string;
  startedAt: string;
}

export type GitReader = (cwd: string, ...args: string[]) => string | null;

const FALLBACK_IGNORES = new Set([
  '.git', 'node_modules', 'dist', 'coverage', 'tmp-shots', '.DS_Store',
]);

function defaultGit(cwd: string, ...args: string[]): string | null {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
}

function fallbackPaths(root: string): string[] {
  const paths: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (FALLBACK_IGNORES.has(entry.name)) continue;
      const absolute = resolve(directory, entry.name);
      const path = relative(root, absolute).split('\\').join('/');
      if (entry.isDirectory()) visit(absolute);
      else paths.push(path);
    }
  };
  visit(root);
  return paths.sort();
}

/** Git tracked/untracked content, or the same deterministic filesystem fallback when Git is absent. */
export function sourcePaths(root: string, git: GitReader = defaultGit): string[] {
  const raw = git(root, 'ls-files', '--cached', '--others', '--exclude-standard', '-z');
  if (raw === null) return fallbackPaths(root);
  return raw.split('\0').filter(Boolean).sort();
}

/** Absolute checkout location never enters the digest: only normalized relative path + content does. */
export function sourceDigest(root: string, paths = sourcePaths(root)): string {
  const hash = createHash('sha256');
  for (const path of [...paths].sort()) {
    hash.update(String(Buffer.byteLength(path)));
    hash.update(':');
    hash.update(path);
    hash.update('\0');
    const absolute = resolve(root, path);
    try {
      const stat = lstatSync(absolute);
      if (stat.isSymbolicLink()) {
        hash.update('link\0');
        hash.update(readlinkSync(absolute));
      } else if (stat.isFile()) {
        hash.update('file\0');
        hash.update(readFileSync(absolute));
      } else {
        hash.update('other\0');
      }
    } catch {
      // A deleted tracked path remains in git ls-files and therefore changes the digest deterministically.
      hash.update('missing\0');
    }
    hash.update('\0');
  }
  return hash.digest('hex');
}

interface BuildIdentityOptions {
  env?: Readonly<Record<string, string | undefined>>;
  startedAt?: string;
  git?: GitReader;
}

/** Build identity works in archives/containers without Git and has one detached-HEAD label. */
export function createBuildIdentity(
  root: string,
  options: BuildIdentityOptions = {},
): BuildIdentity {
  const env = options.env ?? process.env;
  const git = options.git ?? defaultGit;
  const digest = env['PPAJI_BUILD_SOURCE_DIGEST'] ?? sourceDigest(root, sourcePaths(root, git));
  const gitSha = git(root, 'rev-parse', 'HEAD')?.trim() || '';
  const sha = env['PPAJI_BUILD_SHA']?.trim() || gitSha || 'unversioned';
  const gitBranch = git(root, 'branch', '--show-current')?.trim() || '';
  const branch = env['PPAJI_BUILD_BRANCH']?.trim() ||
    (gitSha ? (gitBranch || '(detached)') : '(no-git)');
  const shortSha = env['PPAJI_BUILD_SHORT_SHA']?.trim() ||
    (sha === 'unversioned' ? digest.slice(0, 12) : sha.slice(0, 12));
  const startedAt = env['PPAJI_BUILD_STARTED_AT']?.trim() || options.startedAt || new Date().toISOString();
  return { sha, shortSha, branch, sourceDigest: digest, startedAt };
}
