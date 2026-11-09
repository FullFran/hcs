const dotted = '[a-z0-9]([a-z0-9-]*[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+';
const dottedPattern = new RegExp(`^(?:${dotted})$`);
const capabilityPattern = new RegExp(`^(${dotted})@(0|[1-9][0-9]{0,8})$`);
const extensionPattern = /^x-[a-z0-9]+(-[a-z0-9]+)*$/;

// JavaScript's $ also matches before a final newline; require a complete match.
function matches(pattern: RegExp, value: string): boolean {
  const match = pattern.exec(value);
  return match !== null && match[0].length === value.length;
}

export function isDottedId(value: string): boolean { return matches(dottedPattern, value); }
export function isExtensionName(value: string): boolean { return matches(extensionPattern, value); }

export function parseCapabilityRef(value: string): { ok: true; id: string; major: number } | { ok: false; reason: string } {
  const match = capabilityPattern.exec(value);
  if (!match || match[0].length !== value.length) return { ok: false, reason: 'Invalid capability reference' };
  return { ok: true, id: match[1], major: Number(value.slice(value.lastIndexOf('@') + 1)) };
}

export function capabilitySatisfies(required: string, provided: string): boolean {
  const need = parseCapabilityRef(required);
  const have = parseCapabilityRef(provided);
  return need.ok && have.ok && need.id === have.id && need.major === have.major;
}
