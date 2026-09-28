import { test } from "node:test";
import assert from "node:assert/strict";

// Minimal vitest-compat shim so the vendored app test suites run under
// node --test (strip-only safe: no namespaces, no parameter properties).
// Covers the matchers the suites actually use.

export function describe(name: string, fn: () => void): void {
  // Vitest suites run inline; node:test collects subtests globally.
  fn();
}

interface ItFn {
  (name: string, fn: () => void | Promise<void>): void;
  each<T>(
    table: readonly (T | readonly T[])[],
  ): (name: string, fn: (...args: T[]) => void | Promise<void>) => void;
}

export const it = ((name: string, fn: () => void | Promise<void>) => {
  test(name, fn);
}) as ItFn;

it.each = <T>(table: readonly (T | readonly T[])[]) => {
  return (name: string, fn: (...args: T[]) => void | Promise<void>) => {
    for (const row of table) {
      const args = (Array.isArray(row) ? row : [row]) as T[];
      test(`${name} (${JSON.stringify(row)})`, () => fn(...args));
    }
  };
};

export class Expectation<T> {
  private readonly actual: T;
  private readonly negated: boolean;

  constructor(actual: T, negated = false) {
    this.actual = actual;
    this.negated = negated;
  }

  get not(): Expectation<T> {
    return new Expectation(this.actual, !this.negated);
  }

  private check(ok: boolean, message: string): void {
    const failed = this.negated ? ok : !ok;
    if (failed) {
      throw new assert.AssertionError({
        message: this.negated ? `expected NOT ${message}` : `expected ${message}`,
        actual: this.actual,
      });
    }
  }

  toBe(expected: T): void {
    this.check(
      Object.is(this.actual, expected),
      `${JSON.stringify(this.actual)} to be ${JSON.stringify(expected)}`,
    );
  }

  toEqual(expected: unknown): void {
    let equal = false;
    try {
      assert.deepEqual(this.actual, expected);
      equal = true;
    } catch {
      equal = false;
    }
    this.check(equal, `${JSON.stringify(this.actual)} to equal ${JSON.stringify(expected)}`);
  }

  toBeNull(): void {
    this.check(this.actual === null, `${JSON.stringify(this.actual)} to be null`);
  }

  toContain(item: unknown): void {
    const contains =
      typeof this.actual === "string"
        ? this.actual.includes(String(item))
        : Array.isArray(this.actual) && this.actual.includes(item);
    this.check(contains, `${JSON.stringify(this.actual)} to contain ${JSON.stringify(item)}`);
  }

  toMatchObject(expected: Record<string, unknown> | unknown[]): void {
    let ok = true;
    const stack: Array<[unknown, unknown]> = [[this.actual, expected]];
    while (stack.length > 0 && ok) {
      const pair = stack.pop() as [unknown, unknown];
      const a = pair[0];
      const e = pair[1];
      if (Array.isArray(e)) {
        const arr = a as unknown[];
        ok = Array.isArray(arr) && arr.length >= e.length;
        if (ok) for (let i = 0; i < e.length; i++) stack.push([arr[i], e[i]]);
      } else if (e !== null && typeof e === "object") {
        ok = a !== null && typeof a === "object";
        if (ok) {
          const ra = a as Record<string, unknown>;
          const re = e as Record<string, unknown>;
          for (const k of Object.keys(re)) stack.push([ra[k], re[k]]);
        }
      } else {
        ok = Object.is(a, e);
      }
    }
    this.check(ok, `${JSON.stringify(this.actual)} to match object ${JSON.stringify(expected)}`);
  }

  toThrow(message?: string | RegExp): void {
    if (typeof this.actual !== "function") {
      this.check(false, "toThrow target to be a function");
      return;
    }
    let threw = false;
    let thrown = "";
    try {
      (this.actual as () => unknown)();
    } catch (error) {
      threw = true;
      thrown = error instanceof Error ? error.message : String(error);
    }
    if (!threw) {
      this.check(false, "function to throw");
      return;
    }
    if (typeof message === "string") {
      this.check(
        thrown.includes(message),
        `thrown ${JSON.stringify(thrown)} to include ${JSON.stringify(message)}`,
      );
    } else if (message instanceof RegExp) {
      this.check(message.test(thrown), `thrown ${JSON.stringify(thrown)} to match ${message}`);
    }
  }

  toMatch(pattern: RegExp | string): void {
    const regex = typeof pattern === "string" ? new RegExp(pattern) : pattern;
    this.check(
      typeof this.actual === "string" && regex.test(this.actual),
      `${JSON.stringify(this.actual)} to match ${regex}`,
    );
  }
}

export function expect<T>(actual: T): Expectation<T> {
  return new Expectation(actual);
}
