export type ConditionIdentifierResult = {
  found: boolean;
  value: any;
};

export type ConditionIdentifierResolver = (
  name: string,
) => ConditionIdentifierResult;

type TokenKind =
  | "identifier"
  | "number"
  | "string"
  | "operator"
  | "lparen"
  | "rparen"
  | "eof";

type Token = {
  kind: TokenKind;
  value: any;
};

function tokenize(expression: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < expression.length) {
    const current = expression[index];

    if (/\s/.test(current)) {
      index += 1;
      continue;
    }

    if (current === "(") {
      tokens.push({
        kind: "lparen",
        value: current,
      });
      index += 1;
      continue;
    }

    if (current === ")") {
      tokens.push({
        kind: "rparen",
        value: current,
      });
      index += 1;
      continue;
    }

    if (current === "'" || current === '"') {
      const quote = current;
      index += 1;

      let value = "";

      while (index < expression.length) {
        const char = expression[index];

        if (char === "\\") {
          index += 1;

          if (index >= expression.length) {
            throw new Error(
              "Invalid escape sequence in condition",
            );
          }

          value += expression[index];
          index += 1;
          continue;
        }

        if (char === quote) {
          index += 1;
          break;
        }

        value += char;
        index += 1;
      }

      tokens.push({
        kind: "string",
        value,
      });

      continue;
    }

    const remaining = expression.slice(index);

    const numberMatch = remaining.match(
      /^-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/,
    );

    if (numberMatch) {
      tokens.push({
        kind: "number",
        value: Number(numberMatch[0]),
      });

      index += numberMatch[0].length;
      continue;
    }

    const identifierMatch = remaining.match(
      /^[A-Za-z_][A-Za-z0-9_]*/,
    );

    if (identifierMatch) {
      const value = identifierMatch[0];

      if (
        value === "and" ||
        value === "or" ||
        value === "not" ||
        value === "is"
      ) {
        tokens.push({
          kind: "operator",
          value,
        });
      } else {
        tokens.push({
          kind: "identifier",
          value,
        });
      }

      index += value.length;
      continue;
    }

    const twoCharOperator =
      expression.slice(
        index,
        index + 2,
      );

    if (
      twoCharOperator === "==" ||
      twoCharOperator === "!=" ||
      twoCharOperator === ">=" ||
      twoCharOperator === "<="
    ) {
      tokens.push({
        kind: "operator",
        value: twoCharOperator,
      });

      index += 2;
      continue;
    }

    if (twoCharOperator === "&&") {
      tokens.push({
        kind: "operator",
        value: "and",
      });

      index += 2;
      continue;
    }

    if (twoCharOperator === "||") {
      tokens.push({
        kind: "operator",
        value: "or",
      });

      index += 2;
      continue;
    }

    if (
      current === ">" ||
      current === "<" ||
      current === "="
    ) {
      tokens.push({
        kind: "operator",
        value: current,
      });

      index += 1;
      continue;
    }

    if (current === "!") {
      tokens.push({
        kind: "operator",
        value: "not",
      });

      index += 1;
      continue;
    }

    throw new Error(
      `Unsupported condition token: ${current}`,
    );
  }

  tokens.push({
    kind: "eof",
    value: null,
  });

  return tokens;
}

function pythonTruthy(value: any): boolean {
  if (
    value === null ||
    value === undefined
  ) {
    return false;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value !== 0 && !Number.isNaN(value);
  }

  if (typeof value === "string") {
    return value.length > 0;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  return true;
}

function numericComparable(
  value: any,
): number | null {
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }

  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return value;
  }

  return null;
}

function pythonEquals(
  left: any,
  right: any,
): boolean {
  if (
    left === null ||
    right === null
  ) {
    return left === right;
  }

  const leftNumber = numericComparable(left);
  const rightNumber = numericComparable(right);

  if (
    leftNumber !== null &&
    rightNumber !== null
  ) {
    return leftNumber === rightNumber;
  }

  return left === right;
}

function pythonCompare(
  left: any,
  right: any,
  operator: string,
): boolean {
  if (operator === "=" || operator === "==") {
    return pythonEquals(
      left,
      right,
    );
  }

  if (operator === "!=") {
    return !pythonEquals(
      left,
      right,
    );
  }

  const leftNumber = numericComparable(left);
  const rightNumber = numericComparable(right);

  const leftValue =
    leftNumber !== null
      ? leftNumber
      : left;

  const rightValue =
    rightNumber !== null
      ? rightNumber
      : right;

  switch (operator) {
    case ">":
      return leftValue > rightValue;

    case "<":
      return leftValue < rightValue;

    case ">=":
      return leftValue >= rightValue;

    case "<=":
      return leftValue <= rightValue;

    default:
      throw new Error(
        `Unsupported comparison operator: ${operator}`,
      );
  }
}

class ConditionParser {
  private index = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly resolveIdentifier:
      ConditionIdentifierResolver,
    private readonly staticContext:
      Record<string, any>,
  ) {}

  parse(): any {
    const result = this.parseOr();

    if (
      this.peek().kind !== "eof"
    ) {
      throw new Error(
        "Unexpected token after condition",
      );
    }

    return result;
  }

  private peek(): Token {
    return this.tokens[this.index];
  }

  private advance(): Token {
    const token = this.tokens[this.index];
    this.index += 1;
    return token;
  }

  private matchOperator(
    operator: string,
  ): boolean {
    const token = this.peek();

    if (
      token.kind === "operator" &&
      token.value === operator
    ) {
      this.advance();
      return true;
    }

    return false;
  }

  private parseOr(): any {
    let result = this.parseAnd();

    while (
      this.matchOperator("or")
    ) {
      const right = this.parseAnd();

      result =
        pythonTruthy(result) ||
        pythonTruthy(right);
    }

    return result;
  }

  private parseAnd(): any {
    let result = this.parseNot();

    while (
      this.matchOperator("and")
    ) {
      const right = this.parseNot();

      result =
        pythonTruthy(result) &&
        pythonTruthy(right);
    }

    return result;
  }

  private parseNot(): any {
    if (
      this.matchOperator("not")
    ) {
      return !pythonTruthy(
        this.parseNot(),
      );
    }

    return this.parseComparison();
  }

  private parseComparison(): any {
    let left = this.parsePrimary();
    let compared = false;
    let result = true;

    while (true) {
      const token = this.peek();

      if (token.kind !== "operator") {
        break;
      }

      if (token.value === "is") {
        this.advance();

        const negate =
          this.matchOperator("not");

        const right =
          this.parsePrimary();

        const comparison =
          left === right;

        result =
          result &&
          (
            negate
              ? !comparison
              : comparison
          );

        left = right;
        compared = true;
        continue;
      }

      if (
        token.value === "==" ||
        token.value === "=" ||
        token.value === "!=" ||
        token.value === ">" ||
        token.value === "<" ||
        token.value === ">=" ||
        token.value === "<="
      ) {
        this.advance();

        const right =
          this.parsePrimary();

        result =
          result &&
          pythonCompare(
            left,
            right,
            token.value,
          );

        left = right;
        compared = true;
        continue;
      }

      break;
    }

    return compared
      ? result
      : left;
  }

  private parsePrimary(): any {
    const token = this.advance();

    if (token.kind === "lparen") {
      const value = this.parseOr();

      if (
        this.peek().kind !== "rparen"
      ) {
        throw new Error(
          "Missing closing parenthesis",
        );
      }

      this.advance();
      return value;
    }

    if (token.kind === "number") {
      return token.value;
    }

    if (token.kind === "string") {
      return token.value;
    }

    if (token.kind === "identifier") {
      if (
        token.value === "True" ||
        token.value === "true"
      ) {
        return true;
      }

      if (
        token.value === "False" ||
        token.value === "false"
      ) {
        return false;
      }

      if (
        token.value === "None" ||
        token.value === "null"
      ) {
        return null;
      }

      const resolved =
        this.resolveIdentifier(
          token.value,
        );

      if (resolved.found) {
        return resolved.value;
      }

      if (
        Object.prototype.hasOwnProperty.call(
          this.staticContext,
          token.value,
        )
      ) {
        return this.staticContext[
          token.value
        ];
      }

      throw new Error(
        `Unknown condition identifier: ${token.value}`,
      );
    }

    throw new Error(
      "Expected condition value",
    );
  }
}

export function evaluateScipionCondition(
  expressionRaw: any,
  resolveIdentifier:
    ConditionIdentifierResolver,
  staticContext:
    Record<string, any> = {},
): boolean {
  if (
    expressionRaw === null ||
    expressionRaw === undefined
  ) {
    return true;
  }

  const expression =
    String(expressionRaw).trim();

  if (!expression) {
    return true;
  }

  try {
    const parser =
      new ConditionParser(
        tokenize(expression),
        resolveIdentifier,
        staticContext,
      );

    return pythonTruthy(
      parser.parse(),
    );
  } catch {
    return false;
  }
}