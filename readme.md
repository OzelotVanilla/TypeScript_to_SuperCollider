TypeScript-to-SuperCollider Transpiler: `tstosc`
====

This project, is a transpiler converting TypeScript to SuperCollider's own language, SCLang.

Currently, this project is still not stable, may contains unexpected bug,
 and the result might not be reliable.


Installation
----

Use `npm` or your favourite Node package manager to install them.
You need NodeJS to be installed before install `tstosc`.

```bash
npm install -g tstosc
```

Usage
----

After installing that, you can use `tstosc` in console for transpilation.
Notice that class in your file will be written to SuperCollider's User Extension folder.

```bash
tstosc ./file_to_convert.ts # Will convert `./file_to_convert.ts` to `./file_to_convert.sc`.
```