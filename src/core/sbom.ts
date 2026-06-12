import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { buildDependencyGraph } from "./graph-builder.js";
import { auditLicenses } from "./licenses.js";

export interface SbomExportOptions {
  format?: "cyclonedx" | "spdx";
  outPath?: string;
}

export interface SbomExportResult {
  success: boolean;
  outputPath: string;
  format: string;
  componentCount: number;
}

export async function exportSbom(
  rootDir: string,
  options: SbomExportOptions = {}
): Promise<SbomExportResult> {
  const format = options.format ?? "cyclonedx";
  const defaultFile = format === "cyclonedx" ? "bom.json" : "bom.spdx.json";
  const outPath = options.outPath ?? defaultFile;
  const resolvedOut = path.resolve(rootDir, outPath);

  const graph = await buildDependencyGraph(rootDir);
  const licenseAudit = await auditLicenses(rootDir);

  // Read root package info
  let rootName = "project";
  let rootVersion = "1.0.0";
  try {
    const raw = await fs.readFile(path.join(rootDir, "package.json"), "utf8");
    const pkg = JSON.parse(raw);
    rootName = pkg.name ?? rootName;
    rootVersion = pkg.version ?? rootVersion;
  } catch {}

  // Collect all package components
  const componentsList: Array<{
    name: string;
    version: string;
    license: string;
    purl: string;
    hash?: { alg: string; content: string };
    dependencies: string[];
    spdxId: string;
  }> = [];

  const purlMap = new Map<string, string>(); // name@version -> purl
  const spdxIdMap = new Map<string, string>(); // name@version -> spdxId

  // 1. Process root component
  const rootPurl = getPurl(rootName, rootVersion);
  const rootSpdxId = "SPDXRef-RootPackage";
  purlMap.set(`${rootName}@${rootVersion}`, rootPurl);
  spdxIdMap.set(`${rootName}@${rootVersion}`, rootSpdxId);

  // 2. Process all dependencies
  for (const [name, instances] of Object.entries(graph.lockPackages ?? {})) {
    for (const inst of instances) {
      const version = inst.version;
      const key = `${name}@${version}`;
      const purl = getPurl(name, version);
      const spdxId = `SPDXRef-npm-${name.replace(/[^a-zA-Z0-9]/g, "-")}-${version.replace(/[^a-zA-Z0-9]/g, "-")}`;
      
      purlMap.set(key, purl);
      spdxIdMap.set(key, spdxId);
    }
  }

  for (const [name, instances] of Object.entries(graph.lockPackages ?? {})) {
    for (const inst of instances) {
      const version = inst.version;
      const key = `${name}@${version}`;
      const purl = purlMap.get(key)!;
      const spdxId = spdxIdMap.get(key)!;

      const license = licenseAudit.packages.find((p) => p.name === name && p.version === version)?.license ?? "UNKNOWN";

      // Parse hash/integrity from instance details if available (or load local package-lock pkg details)
      let hashInfo: { alg: string; content: string } | undefined;
      
      // Attempt to load package-lock pkg description for integrity
      const integrity = await findIntegrity(rootDir, inst.path);
      if (integrity) {
        const parts = integrity.split("-");
        if (parts.length === 2 && parts[0] && parts[1]) {
          let alg = parts[0].toUpperCase();
          if (alg === "SHA512") alg = "SHA-512";
          else if (alg === "SHA256") alg = "SHA-256";
          else if (alg === "SHA1") alg = "SHA-1";
          hashInfo = { alg, content: parts[1] };
        }
      }

      // Find dependency purls
      const deps = graph.lockDependencies?.[name] ?? [];
      const dependsOnPurls: string[] = [];
      for (const depName of deps) {
        // Resolve version of depName in this instance context
        const depVersion = resolveDepVersion(graph, inst.path, depName);
        if (depVersion) {
          dependsOnPurls.push(purlMap.get(`${depName}@${depVersion}`)!);
        }
      }

      componentsList.push({
        name,
        version,
        license,
        purl,
        hash: hashInfo,
        dependencies: dependsOnPurls,
        spdxId
      });
    }
  }

  // Resolve root dependencies purls
  const rootDeps: string[] = [];
  const directDeps = Object.keys({
    ...(graph.dependencies ?? {}),
    ...(graph.devDependencies ?? {})
  });
  for (const depName of directDeps) {
    const depVersion = resolveDepVersion(graph, "", depName);
    if (depVersion) {
      const purl = purlMap.get(`${depName}@${depVersion}`);
      if (purl) {
        rootDeps.push(purl);
      }
    }
  }

  let sbomContent = "";

  if (format === "cyclonedx") {
    const cycloneDxSbom = {
      bomFormat: "CycloneDX",
      specVersion: "1.6",
      serialNumber: `urn:uuid:${crypto.randomUUID()}`,
      version: 1,
      metadata: {
        timestamp: new Date().toISOString(),
        component: {
          type: "application",
          name: rootName,
          version: rootVersion,
          purl: rootPurl
        }
      },
      components: componentsList.map((c) => {
        const comp: any = {
          type: "library",
          name: c.name,
          version: c.version,
          purl: c.purl
        };
        if (c.license !== "UNKNOWN") {
          comp.licenses = [
            {
              license: {
                id: c.license
              }
            }
          ];
        }
        if (c.hash) {
          comp.hashes = [
            {
              alg: c.hash.alg,
              content: c.hash.content
            }
          ];
        }
        return comp;
      }),
      dependencies: [
        {
          ref: rootPurl,
          dependsOn: rootDeps
        },
        ...componentsList.map((c) => ({
          ref: c.purl,
          dependsOn: c.dependencies
        }))
      ]
    };
    sbomContent = JSON.stringify(cycloneDxSbom, null, 2);
  } else {
    // SPDX v2.3 Format
    const spdxSbom = {
      spdxVersion: "SPDX-2.3",
      dataLicense: "CC0-1.0",
      SPDXID: "SPDXRef-DOCUMENT",
      name: `${rootName}-SBOM`,
      documentNamespace: `https://spdx.org/spdxdocs/${rootName}-${crypto.randomUUID()}`,
      creationInfo: {
        created: new Date().toISOString(),
        creators: ["Tool: dep-brain"]
      },
      packages: [
        {
          name: rootName,
          SPDXID: rootSpdxId,
          versionInfo: rootVersion,
          downloadLocation: "NONE",
          filesAnalyzed: false,
          licenseDeclared: "NOASSERTION",
          externalRefs: [
            {
              referenceCategory: "PACKAGE-MANAGER",
              referenceType: "purl",
              referenceLocator: rootPurl
            }
          ]
        },
        ...componentsList.map((c) => ({
          name: c.name,
          SPDXID: c.spdxId,
          versionInfo: c.version,
          downloadLocation: "NONE",
          filesAnalyzed: false,
          licenseDeclared: c.license !== "UNKNOWN" ? c.license : "NOASSERTION",
          externalRefs: [
            {
              referenceCategory: "PACKAGE-MANAGER",
              referenceType: "purl",
              referenceLocator: c.purl
            }
          ]
        }))
      ],
      relationships: [
        {
          spdxElementId: "SPDXRef-DOCUMENT",
          relatedSpdxElement: rootSpdxId,
          relationshipType: "DESCRIBES"
        },
        ...rootDeps.map((purl) => {
          const key = purlToKey(purl);
          const spdxId = spdxIdMap.get(key) || "SPDXRef-npm-unknown";
          return {
            spdxElementId: rootSpdxId,
            relatedSpdxElement: spdxId,
            relationshipType: "DEPENDS_ON"
          };
        }),
        ...componentsList.flatMap((c) =>
          c.dependencies.map((depPurl) => {
            const key = purlToKey(depPurl);
            const depSpdxId = spdxIdMap.get(key) || "SPDXRef-npm-unknown";
            return {
              spdxElementId: c.spdxId,
              relatedSpdxElement: depSpdxId,
              relationshipType: "DEPENDS_ON"
            };
          })
        )
      ]
    };
    sbomContent = JSON.stringify(spdxSbom, null, 2);
  }

  await fs.mkdir(path.dirname(resolvedOut), { recursive: true });
  await fs.writeFile(resolvedOut, sbomContent, "utf8");

  return {
    success: true,
    outputPath: resolvedOut,
    format,
    componentCount: componentsList.length
  };
}

function getPurl(name: string, version: string): string {
  if (name.startsWith("@")) {
    const [scope, suffix] = name.split("/");
    if (scope && suffix) {
      return `pkg:npm/${encodeURIComponent(scope)}/${suffix}@${version}`;
    }
  }
  return `pkg:npm/${name}@${version}`;
}

function purlToKey(purl: string): string {
  // Translate purl back to name@version key
  // pkg:npm/react@18.2.0 -> react@18.2.0
  // pkg:npm/%40types/node@18.0.0 -> @types/node@18.0.0
  const match = purl.match(/^pkg:npm\/(.+?)@(.+?)$/);
  if (match && match[1] && match[2]) {
    return `${decodeURIComponent(match[1])}@${match[2]}`;
  }
  return "";
}

async function findIntegrity(rootDir: string, installPath: string): Promise<string | null> {
  // Read package.json or metadata files to locate package-lock description integrity
  // Simple heuristic: read package-lock.json packages key
  try {
    const lockRaw = await fs.readFile(path.join(rootDir, "package-lock.json"), "utf8");
    const lock = JSON.parse(lockRaw);
    const pkgKey = installPath.replace(/\\/g, "/");
    const pkg = lock.packages?.[pkgKey] || lock.packages?.[`node_modules/${pkgKey}`];
    if (pkg && typeof pkg.integrity === "string") {
      return pkg.integrity;
    }
  } catch {}
  return null;
}

function resolveDepVersion(graph: any, parentPath: string, depName: string): string | null {
  const instances = graph.lockPackages?.[depName] ?? [];
  if (instances.length === 0) return null;
  if (instances.length === 1) return instances[0]?.version ?? null;

  // Resolve version closest to the parent path (in nested node_modules structure)
  let bestInstance = instances[0];
  let bestCommonLength = -1;

  for (const inst of instances) {
    if (parentPath && inst.path.startsWith(parentPath)) {
      const commonLength = parentPath.length;
      if (commonLength > bestCommonLength) {
        bestCommonLength = commonLength;
        bestInstance = inst;
      }
    }
  }

  return bestInstance?.version ?? null;
}
