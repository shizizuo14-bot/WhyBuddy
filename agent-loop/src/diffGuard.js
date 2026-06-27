const DEFAULT_TEST_FILE_PATTERNS = [
  /(^|\/)__tests__\//i,
  /(^|\/)tests?\//i,
  /\.(test|spec)\.[cm]?[jt]sx?$/i,
];

const DEFAULT_TEST_CONTROL_PATTERNS = [
  /(^|\/)(vitest|jest|playwright|cypress)\.config\.[cm]?[jt]s$/i,
  /(^|\/)package\.json$/i,
];

const DEFAULT_PROTECTED_PATTERNS = [
  ...DEFAULT_TEST_FILE_PATTERNS,
  ...DEFAULT_TEST_CONTROL_PATTERNS,
];

export function analyzeDiffGuard(diffText, { protectedPatterns = DEFAULT_PROTECTED_PATTERNS, policy = {} } = {}) {
  const effectivePolicy = normalizeGuardPolicy(policy);
  const protectedGlobMatchers = effectivePolicy.protectedGlobs.map(globToRegExp);
  const filesWithProtection = parseDiffFiles(diffText).map((file) => {
    const normalizedPath = normalizePath(file.path);
    const isDefaultTestFile = DEFAULT_TEST_FILE_PATTERNS.some((pattern) => pattern.test(normalizedPath));
    const isDefaultTestControl = DEFAULT_TEST_CONTROL_PATTERNS.some((pattern) => pattern.test(normalizedPath));
    const isDefaultProtected = effectivePolicy.protectTests
      && protectedPatterns.some((pattern) => pattern.test(file.path));
    const isGlobProtected = protectedGlobMatchers.some((pattern) => pattern.test(file.path));
    const isTaskDocProtected = effectivePolicy.protectTaskDocs && isTaskDoc(file.path);
    const isProtected = isDefaultProtected || isGlobProtected || isTaskDocProtected;
    const reasons = [];
    if (isTaskDocProtected) {
      reasons.push('protected_task_doc_changed');
    } else if (isProtected) {
      reasons.push('protected_path_changed');
    }
    if (isProtected && file.deletedLines > file.addedLines) reasons.push('protected_file_net_deletion');
    return {
      path: file.path,
      protected: isProtected,
      addedLines: file.addedLines,
      deletedLines: file.deletedLines,
      netDeletedLines: Math.max(0, file.deletedLines - file.addedLines),
      reasons,
      protectionKind: classifyProtectionKind({
        isDefaultTestFile,
        isDefaultTestControl,
        isGlobProtected,
        isTaskDocProtected,
        isProtected,
      }),
    };
  });
  const findings = filesWithProtection.flatMap((file) => {
    return file.reasons.map((reason) => ({
      path: file.path,
      reason,
      severity: classifyGuardSeverity(file, reason),
      addedLines: file.addedLines,
      deletedLines: file.deletedLines,
      netDeletedLines: file.netDeletedLines,
    }));
  });
  const advisoryFindings = findings.filter((finding) => finding.severity === 'advisory');
  const blockingFindings = findings.filter((finding) => finding.severity === 'blocking');
  const files = filesWithProtection.map(({ protectionKind, ...file }) => file);
  return {
    hasFindings: findings.length > 0,
    hasBlockingFindings: blockingFindings.length > 0,
    findings,
    advisoryFindings,
    blockingFindings,
    files,
  };
}

export function normalizeGuardPolicy(policy = {}) {
  return {
    protectTests: policy.protectTests ?? true,
    protectTaskDocs: policy.protectTaskDocs ?? false,
    protectedGlobs: Array.isArray(policy.protectedGlobs) ? policy.protectedGlobs : [],
  };
}

function isTaskDoc(filePath) {
  return /^agent-loop\/tasks\/[^/]+\.md$/i.test(normalizePath(filePath));
}

function classifyProtectionKind({
  isDefaultTestFile,
  isDefaultTestControl,
  isGlobProtected,
  isTaskDocProtected,
  isProtected,
}) {
  if (isTaskDocProtected) return 'task_doc';
  if (isGlobProtected) return 'protected_glob';
  if (isDefaultTestControl) return 'test_control';
  if (isDefaultTestFile) return 'test_file';
  if (isProtected) return 'protected_path';
  return null;
}

function classifyGuardSeverity(file, reason) {
  if (
    reason === 'protected_path_changed'
    && file.protectionKind === 'test_file'
    && file.netDeletedLines === 0
  ) {
    return 'advisory';
  }
  return 'blocking';
}

function globToRegExp(glob) {
  const normalized = normalizePath(glob);
  const escaped = normalized
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replaceAll('**', '\u0000')
    .replaceAll('*', '[^/]*')
    .replaceAll('\u0000', '.*');
  return new RegExp(`^${escaped}$`, 'i');
}

function normalizePath(filePath) {
  return String(filePath || '').replaceAll('\\', '/');
}

function parseDiffFiles(diffText) {
  const files = [];
  let current = null;
  for (const line of String(diffText || '').split(/\r?\n/)) {
    const header = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (header) {
      if (current) files.push(current);
      current = {
        path: header[2],
        addedLines: 0,
        deletedLines: 0,
      };
      continue;
    }
    if (!current) continue;
    if (line.startsWith('+++ ') || line.startsWith('--- ') || line.startsWith('@@')) continue;
    if (line.startsWith('+')) current.addedLines++;
    if (line.startsWith('-')) current.deletedLines++;
  }
  if (current) files.push(current);
  return files;
}
