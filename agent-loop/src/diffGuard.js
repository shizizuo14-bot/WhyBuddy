const DEFAULT_PROTECTED_PATTERNS = [
  /(^|\/)__tests__\//i,
  /(^|\/)tests?\//i,
  /\.(test|spec)\.[cm]?[jt]sx?$/i,
  /(^|\/)(vitest|jest|playwright|cypress)\.config\.[cm]?[jt]s$/i,
  /(^|\/)package\.json$/i,
];

export function analyzeDiffGuard(diffText, { protectedPatterns = DEFAULT_PROTECTED_PATTERNS } = {}) {
  const files = parseDiffFiles(diffText).map((file) => {
    const isProtected = protectedPatterns.some((pattern) => pattern.test(file.path));
    const reasons = [];
    if (isProtected) reasons.push('protected_path_changed');
    if (isProtected && file.deletedLines > file.addedLines) reasons.push('protected_file_net_deletion');
    return {
      path: file.path,
      protected: isProtected,
      addedLines: file.addedLines,
      deletedLines: file.deletedLines,
      netDeletedLines: Math.max(0, file.deletedLines - file.addedLines),
      reasons,
    };
  });
  const findings = files.flatMap((file) => {
    return file.reasons.map((reason) => ({
      path: file.path,
      reason,
      addedLines: file.addedLines,
      deletedLines: file.deletedLines,
      netDeletedLines: file.netDeletedLines,
    }));
  });
  return {
    hasFindings: findings.length > 0,
    findings,
    files,
  };
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
