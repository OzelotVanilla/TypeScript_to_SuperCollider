TypeScript-to-SuperCollider Transpiler: `tstosc`
====

This project, is a transpiler converting TypeScript to SuperCollider's own language, SCLang.

Currently, this project is still not stable, may contains unexpected bug,
 and the result might not be reliable.


Installation
----

Use `npm` or your favourite Node package manager (such as `pnpm`) to install them.
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

Develop Environment Setup / Build by Yourself
----

If you are developing this project, or you simply want a quicker update of `tstosc`,
it might be good for you to build it by yourself.

After cloning/downloading this project, at the root of this project, run this command
to get the necessary package and environment for the project
(if you are using other Node package manager, use them instead):

```bash
npm i
pnpm i # if using `pnpm`
```

After that, run:

```bash
npm run build
pnpm run build
```

This will build the JavaScript file. Finally to make `tstosc` available in CLI, run:

```bash
npm link
pnpm link -g
```

Finally, check if `tstosc` works by `tstosc -v`, or run it directly.
By now, you can develop/run it based on local project.
If you changed something, just need to run `npm run build` to reflect your changes.