import type { DepBrainConfig } from "../utils/config.js";

function globToRegExp(pattern: string): RegExp {
  if (pattern === "*") {
    return /^.*$/;
  }
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "___GLOBSTAR___")
    .replace(/\*/g, "___STAR___")
    .replace(/\?/g, "___QUESTION___")
    .replace(/___GLOBSTAR___/g, ".*")
    .replace(/___STAR___/g, ".*")
    .replace(/___QUESTION___/g, ".");
  return new RegExp(`^${escaped}$`, "i");
}

/**
 * Attributes owners to a finding based on its name and optional file/workspace path.
 */
export function attributeOwners(
  findingName: string,
  filePath?: string,
  ownershipConfig?: DepBrainConfig["ownership"]
): string[] {
  if (!ownershipConfig || !ownershipConfig.owners) {
    return [];
  }

  const matchedOwners: string[] = [];

  for (const [owner, patterns] of Object.entries(ownershipConfig.owners)) {
    for (const pattern of patterns) {
      const regex = globToRegExp(pattern);
      if (regex.test(findingName) || (filePath && regex.test(filePath))) {
        matchedOwners.push(owner);
        break; // Match once per owner
      }
    }
  }

  return matchedOwners;
}
