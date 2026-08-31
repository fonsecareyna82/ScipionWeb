# Scipion protocol form compatibility

ScipionWeb protocol forms must preserve the semantics defined by
`scipion-pyworkflow` protocol forms. The web representation is not free to
flatten, reinterpret, or approximate Scipion form structures when doing so
changes visibility, values, layout meaning, or protocol behavior.

## Form structure

`Group` and `Line` are semantic form decorators and their hierarchy must be
preserved.

A structure such as:

```text
Group
  Line
    Param
    Param
  Param
```

must not be flattened into a list of independent parameters.

In particular, a `Line` nested inside a `Group` must preserve:

- its label;
- its help;
- its condition;
- its expert level;
- its child parameters;
- its horizontal layout semantics.

ScipionWeb must recursively render nested `Group` and `Line` definitions.

## Path parameters

The backend normalizes subclasses of Scipion `PathParam` to the common web
`PathParam` semantic type.

ScipionWeb must therefore use the same path renderer and state semantics for
all such parameters, including subclasses such as `FileParam` and
`FolderParam`.

Do not add frontend special cases for individual Python subclasses when the
backend can resolve the inheritance using the real Scipion class hierarchy.

## Conditions

Protocol parameter visibility conditions are Scipion expressions.

ScipionWeb must evaluate the supported Scipion condition subset without using
JavaScript `eval`, `Function`, or any equivalent arbitrary-code execution.

The supported compatibility contract currently includes:

- `True` and `False`;
- direct boolean parameters, for example `dataStreaming`;
- `not`;
- `and`;
- `or`;
- nested parentheses with correct precedence;
- `==`;
- `!=`;
- `>`;
- `<`;
- `>=`;
- `<=`;
- `is None`;
- `is not None`;
- protocol constants supplied by ScipionAPI through `conditionContext`;
- references to parameters outside the current section;
- Scipion `EnumParam` comparisons using the underlying Scipion value/index;
- Python-compatible boolean/numeric equality, including `True == 1` and
  `False == 0`.

Unknown identifiers or unsupported syntax must fail closed: the condition must
not make the dependent parameter visible accidentally.

Do not simplify conditions by removing parentheses or by splitting strings on
`and`/`or`, since this changes Python expression precedence.

## Condition values

Conditions must use Scipion runtime semantics rather than purely visual
frontend values.

In particular:

- `EnumParam` conditions use the Scipion enum value/index, not merely the
  displayed label;
- empty pointer parameters behave as `None` for `is None` / `is not None`;
- boolean parameters remain booleans;
- integer and float parameters remain numeric when possible.

Parameter references are global to the protocol form, not restricted to the
section where the conditioned parameter is rendered.

## Expert level

Condition evaluation and expert-level visibility are separate mechanisms.

Replacing or refactoring the condition evaluator must not remove expert-level
filtering.

When the protocol form is in Normal expert level:

- parameters with `expertLevel == 1` are hidden;
- advanced `Group` and `Line` decorators follow the same visibility rule;
- the `Expert Level` selector itself remains visible.

When the form is in Advanced expert level, advanced parameters are visible.

Regression tests must cover both Normal and Advanced behavior.

## Regression expectations

Changes to protocol form serialization or rendering should preserve at least
the following cases:

- nested `Group -> Line -> Param`;
- literal `True` conditions;
- enum conditions such as `importFrom != 5`;
- conditions referencing parameters in another section;
- nested boolean expressions such as
  `not (chooseAtRandom or selectIds)`;
- grouped expressions such as `(a or b) and c`;
- `inputCoordinates is not None`;
- protocol constants such as
  `importFrom == IMPORT_FROM_FILES`;
- Python boolean/numeric comparisons;
- Normal versus Advanced expert-level visibility.

This compatibility layer exists to reproduce Scipion form semantics in the web
UI. Protocol-specific workarounds should not be added when the behavior can be
fixed generically at this layer.