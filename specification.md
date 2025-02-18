Transformation
====

Function
----

Following the usage in TypeScript,
the declaration of function will be converted using this rule:



Example:

```ts
function f(a, b=2) { }
```

will be converted to:

```sclang
{ args a, b=2;

}
```

Naming of the functions in this project
====

### Abbrivation

`self-indecr`: Self increment or decrement.

### For functions converting TypeScript things to SuperCollider

When a function starts with `convert`, such as `convertTSPropertyAccessExpressionToSC`,
 it means this conversion (do not include further conversion such that operand is `1 + 1`)
 could be done **without** referencing to outer.

When it starts with `translate`, it may **need** referencing to outer.
Example: `translateTSReturnStatementToSC` need a SC's `block` for early return.

When it starts with `restyle`, it **may** or **may not** generate result depending on its rules.
Example: `restyleTSVariableStatementToSC` ignores statement that is already initialised.