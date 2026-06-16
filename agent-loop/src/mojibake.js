const COMMON_MOJIBAKE_FRAGMENTS = [
  'å',
  'æ',
  'ç',
  'è',
  'é',
  'ä',
  'Â',
  'Ã',
  '�',
];

const CJK_MOJIBAKE_RE = /[鍒鏉绯椋璇鎶瑙淇涓][\u4e00-\u9fff\u3400-\u4dbf]{1,5}/u;

export function findMojibakeInText({ file, text }) {
  const findings = [];
  const lines = String(text || '').split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    if (looksLikeMojibake(line)) {
      findings.push({
        file,
        line: index + 1,
        excerpt: line.trim().slice(0, 240),
      });
    }
  }
  return findings;
}

export function looksLikeMojibake(line) {
  if (!line) return false;
  if (COMMON_MOJIBAKE_FRAGMENTS.some((fragment) => line.includes(fragment))) {
    return true;
  }
  return CJK_MOJIBAKE_RE.test(line) && !looksLikeIntentionalChinese(line);
}

function looksLikeIntentionalChinese(line) {
  return /分析|权限|系统|风险|证据|报告|下一步|修复|解析|审查/.test(line);
}
