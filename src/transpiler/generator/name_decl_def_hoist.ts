import ts from "typescript"
import { bin, zip, ZipOption } from "../../util/util"
import { convertTSExpressionToSC, hasSelfIndecrExpression } from "./ts_to_sc_convert/expr_conv"
import { default_generator_context, GeneratorContext } from "./context"
import { escapeForSCVarIfNeeded } from "./ts_to_sc_convert/identifier_conv"

/**
 * This scans the variable/constant defined in this scope, and output the SCLang code as string.
 * * In variable statement.
 * * Identifier in `for` or `while` statement.
 * 
 * Note that due to SCLang's settings, class should be defined beforehand in specific files.
 * For processing class, see `extractClassDeclarationAndDefinition`.
 */
export function generateVarConstDeclarationAndDefinition(
    node: ts.BlockLike,
    generator_context: GeneratorContext = default_generator_context
): string
{
    const {
        lets, consts, vars, loopvars, functions
    } = extractVarConstDeclarationAndDefinition(node, generator_context)

    const lets_output = getDefDeclOutput("let", lets, generator_context)
    const consts_output = getDefDeclOutput("const", consts, generator_context)
    const vars_output = getDefDeclOutput("var", vars, generator_context)
    const loopvars_output = getDefDeclOutput("loopvar", loopvars, generator_context)
    const functions_output = getDefDeclOutput("function", functions, generator_context)
    const all_output = [lets_output, consts_output, vars_output, loopvars_output, functions_output]
        .filter(s => s.length > 0)
        .join("\n")
    // lets.forEach(([n, v]) => console.log(n, " = ", v != undefined ? convertToTSExpression(v) : ""))
    // consts.forEach(([n, v]) => console.log(n, " = ", v != undefined ? convertToTSExpression(v) : ""))
    return all_output + (all_output.length > 0 ? "\n" : "")
}

/**
 * This scans the variable/constant defined in this scope, and output them in an object.
 * * In variable statement.
 * * Identifier in `for` or `while` statement.
 * 
 * Note that due to SCLang's settings, class should be defined beforehand in specific files.
 * For processing class, see `extractClassDeclarationAndDefinition`.
 */
export function extractVarConstDeclarationAndDefinition(
    node: ts.BlockLike,
    generator_context: GeneratorContext = default_generator_context
)
{
    let lets: DefDeclCollection = []
    let consts: DefDeclCollection = []
    let vars: DefDeclCollection = []
    let loopvars: DefDeclCollection = []
    let functions: DefDeclCollection = node.statements
        .filter(s => ts.isFunctionDeclaration(s))
        .filter(s => s.name != undefined)
        .map(f => [f.name!.text, undefined])

    const decl_lists = node.statements.filter(s => ts.isVariableStatement(s)).flatMap(s => s.declarationList)
    const loopvar_lists = node.statements
        .flatMap(s => ts.isLabeledStatement(s) ? s.statement : s)
        .filter(s => isLoopvarIncludingStatement(s))

    for (const l of decl_lists)
    {
        // The variable `l` stores whether the stmt is a `let` or a `const` one.
        /** Collects all name and initialiser in this statement (`l`). */
        let collection: DefDeclCollection
        if (isLetDeclarationList(l)) { collection = lets }
        else if (isConstDeclarationList(l)) { collection = consts }
        else if (isVarDeclarationList(l)) { collection = vars }
        else { throw TypeError(`Cannot solve the flag ${l.flags} (${bin(l.flags)}).`) }

        // The `d` will be things like `[a, b]` and `c` in `let [a, b] = [0, 1], c = 2`.
        for (const d of l.declarations)
        {
            // Check if uses object/array binding pattern. If just trivial:
            if (ts.isIdentifier(d.name))
            {
                collection.push([d.name.text, d.initializer])
            }
            // Or if it is binding pattern. At this time, `d.initializer` must not be undefined.
            else 
            {
                collection.push(...solveRecurBinding(d.name, d.initializer as ts.AssignmentPattern))
            }
        }
    }

    for (const s of loopvar_lists)
    {
        const initialiser = s.initializer
        if (initialiser != undefined && ts.isVariableDeclarationList(initialiser))
        {
            for (const d of initialiser.declarations)
            {
                // Check if uses object/array binding pattern. If just trivial:
                if (ts.isIdentifier(d.name))
                {
                    loopvars.push([d.name.text, d.initializer])
                }
                // Or if it is binding pattern. At this time, `d.initializer` must not be undefined.
                else 
                {
                    loopvars.push(...solveRecurBinding(d.name, d.initializer as ts.AssignmentPattern))
                }
            }
        }
    }

    return { lets, consts, vars, loopvars, functions }
}

function isLoopvarIncludingStatement(s: ts.Node)
{
    return ts.isForStatement(s) || ts.isForOfStatement(s) || ts.isForInStatement(s)
}

/**
  * ### Generate Context Relationship
  * 
  * * `indent_level` (`is_standalone_statement`):
  *   This function generate a whole statement.
  *   If the statement is explicitly stand-alone, indent will be generated.
  * 
  * ### Warning
  * 
  * * If self-indecr happens in the initialisation, skip it, initialise after.
  *   (since `var` declaration cannot after global-variables assignment.s)
 */
export function getDefDeclOutput(
    type: "let" | "const" | "var" | "param" | "loopvar" | "function" | "catchvar",
    collection: DefDeclCollection,
    generator_context: GeneratorContext = default_generator_context
)
{
    const { indent_level, is_standalone_statement } = generator_context

    if (collection.length > 0)
    {
        // const kwd = type == "let" ? "var" : "const"
        function convert([n, v]: DefDeclCollection[number])
        {
            // Escape the name start with a underscore
            const name = escapeForSCVarIfNeeded(n.toString())
            const init_part = v == undefined || isAfterwhileInitInitialiser(v)
                ? ""
                : ` = ${convertTSExpressionToSC(v, generator_context.atValuePosition())}`
            return `${name}${init_part}`
        }

        // Notice that until this project is created, `const` is not supported in SC.
        // Until `const` is supported, this `return` is commented.
        // return `${kwd} ${collection.map(c => convert(c)).join(", ")} ;`
        return `var /* ${type} */ ${collection.map(c => convert(c)).join(", ")} ;`
            .indent(is_standalone_statement ? indent_level : 0)
    }
    else { return "" }
}

/**
 * Check if a initialiser can be directly put after hoisted var declaration,
 *  or if it contains things such as self-indecr operator that need to be converted later.
 */
export function isAfterwhileInitInitialiser(v: ts.Expression)
{
    return hasSelfIndecrExpression(v)
}

export type DefDeclCollection = [ts.Identifier["text"], ts.VariableDeclaration["initializer"]][]

function extractNameOnly(pattern: ts.BindingName)
{
    let result: string[] = []
    function traverse(n: ts.Node)
    {
        if (ts.isIdentifier(n)) { result.push(n.text) }
        n.forEachChild(traverse)
    }
    traverse(pattern)

    return []
}

/**
 * Recursion solver for the array-binding or object-binding.
 * 
 * Pair the name and the value, and add to the `collection`
 * (in function `extractNameDeclarationAndDefinition`).
 * 
 * Example:
 * ```ts
 * let [d,[e,f]]=[0,[1,2]]
 * let obj={l:1,x:{m:2,n:3}}
 * let {l,x:{m,n}}=obj
 * ```
 */
export function solveRecurBinding(
    pattern: ts.BindingName, initialiser: ts.AssignmentPattern | ts.Identifier | ts.Expression
): DefDeclCollection
{
    // If, like in `for-of` loop, right-hand-side is `undefined`.
    if (initialiser == undefined)
    {
        return extractNameOnly(pattern).map(n => [n, undefined])
    }

    let result: DefDeclCollection = []
    // If it is an ArrayBindingPattern.
    if (ts.isArrayBindingPattern(pattern))
    {
        // If the right-hand-side is an literal.
        if (ts.isArrayLiteralExpression(initialiser))
        {
            // Make an one-to-one zipped array for `name` and `initialiser`.
            const names_and_init_values = zip(pattern.elements, initialiser.elements, ZipOption.minimal_zip)
            for (const [n, v] of names_and_init_values)
            {
                if (ts.isBindingElement(n))
                {
                    // `n` is an single identifier: no need further recursion.
                    if (ts.isIdentifier(n.name)) { result.push([n.name.text, v]) }
                    // `n` is a complicated pattern: continue recursion.
                    else { result.push(...solveRecurBinding(n.name, v as ts.ArrayLiteralExpression)) }
                }
                // Else, no name defined (e.g. `ts.OmittedExpression`), do nothing.
            }
        }
        // Or, the right-hand-side is an identifier or an expression.
        else if (ts.isIdentifier(initialiser) || ts.isExpression(initialiser))
        {
            const names_and_init_values = zip(
                pattern.elements, [...new Array(pattern.elements.length)].map((_, index) => index),
                ZipOption.minimal_zip
            )
            for (const [n, i] of names_and_init_values)
            {
                if (ts.isBindingElement(n))
                {
                    // `n` is an single identifier: no need further recursion.
                    if (ts.isIdentifier(n.name))
                    {
                        result.push([
                            n.name.text,
                            // Be careful that `n` might have default parameter (`n.initializer`).
                            n.initializer == undefined
                                ? ts.factory.createElementAccessExpression(initialiser, i)
                                : ts.factory.createBinaryExpression(
                                    ts.factory.createElementAccessExpression(initialiser, i),
                                    ts.SyntaxKind.QuestionQuestionToken,
                                    n.initializer
                                )
                        ])
                    }
                    // `n` is a complicated pattern: continue recursion.
                    else
                    {
                        result.push(...solveRecurBinding(
                            n.name, ts.factory.createElementAccessExpression(initialiser, i)
                        ))
                    }
                }
                // Else, no name defined (e.g. `ts.OmittedExpression`), do nothing.
            }
        }
    }
    // Or it is an ObjectBindingPattern.
    else if (ts.isObjectBindingPattern(pattern))
    {
        let init_part_is_literal: boolean
        // If the right-hand-side is an object literal.
        if (ts.isObjectLiteralExpression(initialiser)) { init_part_is_literal = true }
        // Or, the right-hand-side is an identifier or an expression.
        else if (ts.isIdentifier(initialiser) || ts.isExpression(initialiser)) { init_part_is_literal = false }
        else { throw TypeError(`Unknown type of initialiser ${JSON.stringify(initialiser)}.`) }

        for (const n of pattern.elements)
        {
            // If it is like `let {a} = {a: 1}`, the `name` of binding element is `Identifier`.
            if (ts.isIdentifier(n.name))
            {
                result.push([
                    n.name.text,
                    init_part_is_literal
                        ? (initialiser as ts.ObjectLiteralExpression).properties.find(
                            (p): p is ts.PropertyAssignment =>
                                ts.isPropertyAssignment(p)
                                && ts.isIdentifier(p.name)
                                && p.name.text == (n.name as ts.Identifier).text
                        )!.initializer
                        : ts.factory.createPropertyAccessExpression(initialiser, n.name.text)
                ])
            }
            // Or, if it is like `let {a: {b, c}} = {a: {b: 1, c: 2}}`, the `name` is `ObjectBindingPattern`.
            else if (ts.isObjectBindingPattern(n.name) && ts.isIdentifier(n.propertyName!))
            {
                result.push(...solveRecurBinding(
                    n.name,
                    init_part_is_literal
                        ? (initialiser as ts.ObjectLiteralExpression).properties.find(
                            (p): p is ts.PropertyAssignment =>
                                ts.isPropertyAssignment(p)
                                && ts.isIdentifier(p.name)
                                && p.name.text == (n.propertyName as ts.Identifier).text
                        )!.initializer
                        : ts.factory.createPropertyAccessExpression(initialiser, n.propertyName)
                ))
            }
        }
    }
    else if (ts.isIdentifier(pattern))
    {
        result.push([pattern.text, initialiser])
    }

    return result
}

export function isLetDeclarationList(decl_list: ts.VariableDeclarationList)
{ return (decl_list.flags & ts.NodeFlags.Let) > 0 }

export function isConstDeclarationList(decl_list: ts.VariableDeclarationList)
{ return (decl_list.flags & ts.NodeFlags.Const) > 0 }

export function isVarDeclarationList(decl_list: ts.VariableDeclarationList)
{ return decl_list.flags == ts.NodeFlags.None }