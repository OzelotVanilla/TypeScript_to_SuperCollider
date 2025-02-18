> This file contains content that is generated from ChatGPT.
> Current version is unstable, and the result is not guaranteed.

Current Target
====

### Transpiler

- [x] Variable Declaration (var and assignment =)
  - [ ] Escaped variable inconsistency/collision avoiding.
- [x] Function
- [x] Control Structure (`if`, `while`, `for`, etc.)
- [x] Arrays and Collection (`Array`, `List`, etc.)
- [ ] Instantiation and Evaluation (objects and message-passing syntax)
- [ ] Method and Message Passing (dot-notation syntax)
  - [ ] `this` in arrow function or function expression for object literal, works as the same.
        Maybe it is good to not always follow JavaScript ?
  - [ ] `isStoringObjectLiteral` should also check `any` (?) or union type.
- [ ] SCLang Class Definition
  - [ ] Define/Declare class in SuperCollider
  - [ ] Let user write TS object or function, just like they are using SCLang
         (e.g. make it possible to do `(1 + 2).postln()`).
        May need to make new declaration for TS files.
- [ ] Async (e.g., `Promise`)
- [ ] Class
  - [ ] Resolve the name correctly (TS has `as` import, class may also have same name).
  - [ ] Solving collision when user defines method like `initClass` or `new`.
  - [ ] Constructor generation is unreliable. Problem with `super`.
- [ ] Convert full class name (e.g., `SineOscillator`) to SCLang's name (e.g., `SinOsc`).
- [ ] Namespaces, and expression with namespace.
  
### CLI Tool

- [ ] Help and Doc
 
### Specification Document

- [ ] Write a document contains all functionality, with simple example.