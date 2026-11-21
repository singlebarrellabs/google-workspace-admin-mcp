export type Shape =
  | { kind: "null" }
  | { kind: "string" | "number" | "boolean" | "mixed" }
  | { kind: "array"; items: Shape }
  | { kind: "object"; fields: Record<string, Shape> };

export interface Drift {
  path: string;
  expected: string;
  observed: string;
}

/** Key presence and types only; no values, so nothing tenant-specific is kept. */
export function shapeOf(value: unknown): Shape {
  if (value === null || value === undefined) return { kind: "null" };
  if (typeof value === "string") return { kind: "string" };
  if (typeof value === "number") return { kind: "number" };
  if (typeof value === "boolean") return { kind: "boolean" };

  if (Array.isArray(value)) {
    const items = value.reduce<Shape>((merged, item) => mergeShapes(merged, shapeOf(item)), {
      kind: "null",
    });
    return { kind: "array", items };
  }

  if (typeof value === "object") {
    const fields: Record<string, Shape> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      fields[key] = shapeOf(child);
    }
    return { kind: "object", fields };
  }

  return { kind: "mixed" };
}

export function mergeShapes(a: Shape, b: Shape): Shape {
  if (a.kind === "null") return b;
  if (b.kind === "null") return a;
  if (a.kind !== b.kind) return { kind: "mixed" };

  if (a.kind === "array" && b.kind === "array") {
    return { kind: "array", items: mergeShapes(a.items, b.items) };
  }

  if (a.kind === "object" && b.kind === "object") {
    const fields: Record<string, Shape> = { ...a.fields };
    for (const [key, shape] of Object.entries(b.fields)) {
      fields[key] = fields[key] ? mergeShapes(fields[key], shape) : shape;
    }
    return { kind: "object", fields };
  }

  return a;
}

/**
 * Compares a recorded shape with a live one. A field that disappeared, appeared
 * or changed type is drift; values are never compared.
 */
export function diffShapes(expected: Shape, observed: Shape, path = "data"): Drift[] {
  if (expected.kind !== observed.kind) {
    // null is what the API returns for an absent optional field, so it is not
    // drift against a real type; it is how optionality shows up.
    if (expected.kind === "null" || observed.kind === "null") return [];
    return [
      {
        path,
        expected: describeShape(expected),
        observed: describeShape(observed),
      },
    ];
  }

  if (expected.kind === "array" && observed.kind === "array") {
    return diffShapes(expected.items, observed.items, `${path}[]`);
  }

  if (expected.kind === "object" && observed.kind === "object") {
    const drifts: Drift[] = [];

    for (const [key, shape] of Object.entries(expected.fields)) {
      const live = observed.fields[key];
      if (!live) {
        drifts.push({ path: `${path}.${key}`, expected: describeShape(shape), observed: "absent" });
        continue;
      }
      drifts.push(...diffShapes(shape, live, `${path}.${key}`));
    }

    for (const key of Object.keys(observed.fields)) {
      if (!(key in expected.fields)) {
        drifts.push({
          path: `${path}.${key}`,
          expected: "absent",
          observed: describeShape(observed.fields[key]),
        });
      }
    }

    return drifts;
  }

  return [];
}

export function describeShape(shape: Shape): string {
  if (shape.kind === "array") return `array<${describeShape(shape.items)}>`;
  if (shape.kind === "object") return "object";
  return shape.kind;
}
