export function stripJsonFence(text) {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return match ? match[1].trim() : text;
}

export function extractFirstJsonObject(text) {
  const candidates = [stripJsonFence(text), text];
  for (const candidate of candidates) {
    const parsed = extractBalancedObject(candidate);
    if (parsed) return parsed;
  }
  return null;
}

function extractBalancedObject(text) {
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (start === -1) {
      if (ch === '{') {
        start = i;
        depth = 1;
      }
      continue;
    }

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        const json = text.slice(start, i + 1);
        try {
          return JSON.parse(json);
        } catch {
          start = -1;
          depth = 0;
        }
      }
    }
  }

  return null;
}
