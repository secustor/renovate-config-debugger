/**
 * Browser stubs for the four heavy leaves the manager extract graph reaches at
 * module scope but never calls on the single-file extract path (roadmap 078):
 *
 * - modules/datasource/docker/ecr.js — @aws-sdk/client-ecr; the two regexes
 *   are copied verbatim because docker's common.js runs them on registry
 *   hosts, the auth call cannot happen without a lookup.
 * - modules/datasource/maven/util.js — @aws-sdk/client-s3 + node:stream;
 *   download helpers used only at lookup time.
 * - modules/datasource/util.js — google-auth-library.
 * - util/git/index.js — simple-git/fs-extra; git-refs-backed datasources
 *   import `createSimpleGit` for their lookup path only.
 *
 * modules/manager/npm/extract/yarn.js gets its own shim (npm-yarn.ts): its two
 * entry points DO run during npm extraction and need honest return values.
 */

function unavailable(): never {
  throw new Error("datasource lookups are not available in the browser engine");
}

// ---- modules/datasource/docker/ecr.js --------------------------------------

// Verbatim from the pinned dist (regEx() there is just a caching RegExp
// factory): the fips group must stay NON-capturing — both consumers
// destructure group 1 as the region (`const [, region] = ecrRegex.exec(…)`).
export const ecrRegex =
  /\d+\.(?:dkr\.ecr|dkr-ecr)(?:-fips)?\.([-a-z0-9]+)\.(?:amazonaws\.com|on\.aws|amazonaws\.com\.cn|on\.amazonwebservices\.com\.cn|amazonaws\.eu|on\.amazonwebservices\.eu|c2s\.ic\.gov|on\.aws\.ic\.gov|sc2s\.sgov\.gov|on\.aws\.scloud|scloud\.adc-e\.uk|on\.cloud-aws\.adc-e\.uk|csp\.hci\.ic\.gov|on\.aws\.hci\.ic\.gov|)/;
export const ecrPublicRegex = /public\.ecr\.aws|ecr-public\.aws\.com/;

export function getECRAuthToken(): Promise<null> {
  return Promise.resolve(null);
}

export function isECRMaxResultsError(): boolean {
  return false;
}

export function isECRMaxResultsResponse(): boolean {
  return false;
}

// ---- modules/datasource/maven/util.js --------------------------------------

export function createUrlForDependencyPom(): never {
  unavailable();
}

export function downloadMaven(): never {
  unavailable();
}

export function downloadMavenXml(): never {
  unavailable();
}

export function downloadHttpProtocol(): never {
  unavailable();
}

export function downloadHttpContent(): never {
  unavailable();
}

export function downloadS3Protocol(): never {
  unavailable();
}

export function downloadArtifactRegistryProtocol(): never {
  unavailable();
}

export function getDependencyInfo(): never {
  unavailable();
}

export function getDependencyParts(): never {
  unavailable();
}

export function getMavenUrl(): never {
  unavailable();
}

// ---- modules/datasource/util.js --------------------------------------------

export function getGoogleAuthHostRule(): Promise<Record<string, never>> {
  return Promise.resolve({});
}

export function getGoogleAuthToken(): Promise<null> {
  return Promise.resolve(null);
}

export function isArtifactoryServer(): boolean {
  return false;
}

export function isCrossOriginPaginationAllowed(): boolean {
  return false;
}

export function resolvePaginationUrl(): never {
  unavailable();
}

// ---- util/git/index.js -----------------------------------------------------

export function createSimpleGit(): never {
  throw new Error("git is not available in the browser engine");
}
