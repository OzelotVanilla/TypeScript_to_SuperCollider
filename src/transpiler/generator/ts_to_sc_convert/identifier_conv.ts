import ts from "typescript"
import { GeneratorContext, default_generator_context } from "../context"

export function convertTSIdentifierToSC(
    literal: ts.Identifier,
    generator_context: GeneratorContext = default_generator_context
)
{
    // Check if it is built-in class, if so, change to polyfill class (starts with "TSTOSC__").
    if (isJavaScriptBuiltinClass(literal, generator_context)) { return "TSTOSC__" + literal.text }

    return (generator_context.is_generating_class_name
        ? escapeForSCClassIfNeeded
        : escapeForSCVarIfNeeded
    )(literal.text)
}

/**
 * Check whether the identifier means a JavaScript Built-in class.
 * 
 * ### Example
 * 
 * * `Number` is a built-in class.
 * * `Infinity` or `undefined` are not, because these simple [value properties](
 *    https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects#value_properties
 *   ) are classified as literal in `tstosc`.
 * * `MyClass` is not, it is a user-defined class.
 */
export function isJavaScriptBuiltinClass(
    node: ts.Node,
    generator_context: GeneratorContext = default_generator_context
)
{
    const node_type = generator_context.compiler_program.getTypeChecker().getTypeAtLocation(node)
    if (!("symbol" in node_type)) { return false }
    const decls = node_type.symbol.getDeclarations()
    if (decls == undefined || decls.length <= 0) { return false }
    return generator_context.compiler_program.isSourceFileDefaultLibrary(decls[0].getSourceFile())
}

/**
 * Test if an identifier (including variable, function, or class) will be considered legal in SuperCollider.
 * 
 * * Check if first character is a English letter.
 * * Check if remain characters (if exist) are word-like (`\w` in regex).
 */
export function isLegalSCIdentifier(name: string)
{
    return /^[A-Za-z]\w*$/g.test(name)
}

/**
 * Test if an variable will be considered legal in SuperCollider.
 * 
 * * Check if first character is a English letter, and it is lower-case.
 * * Check if remain characters (if exist) are word-like (`\w` in regex).
 */
export function isLegalSCVar(name: string)
{
    return isLegalSCIdentifier(name)
        && "a" <= name[0] && name[0] <= "z"
}

/**
 * Test if an class will be considered legal in SuperCollider.
 * 
 * * Check if first character is a English letter, and it is Upper-Case.
 * * Check if remain characters (if exist) are word-like (`\w` in regex).
 */
export function isLegalSCClass(name: string)
{
    return isLegalSCIdentifier(name)
        && "A" <= name[0] && name[0] <= "Z"
}

// TODO: A better substitution method.
// Current one is not reliable if `esc_seq` is not the same, and it has chance of getting collision.

/**
 * Escape the inputed variable's name, if it is not legal in SCLang.
 */
export function escapeForSCVarIfNeeded(name: string, esc_seq: string = "escvar_")
{
    if (isLegalSCVar(name)) { return name }
    else
    {
        const escaped_name = esc_seq + name.replace(/\W/g, "_")
        console.warn(
            `The variable name "${name}" is illegal in SCLang, and will be replaced to "${escaped_name}".`
        )
        return escaped_name
    }
}

/**
 * Escape the inputed function/method's name, if it is not legal in SCLang.
 */
export function escapeForSCFunctionIfNeeded(name: string, esc_seq: string = "escfunction_")
{
    return escapeForSCVarIfNeeded(name, esc_seq)
}

/**
 * Escape the inputed class's name, if it is not legal in SCLang.
 */
export function escapeForSCClassIfNeeded(name: string, esc_seq: string = "ESCCLASS_")
{
    if (isLegalSCClass(name)) { return name }
    else
    {
        const escaped_name = esc_seq + name.replace(/\W/g, "_")
        console.warn(
            `The class name "${name}" is illegal in SCLang, and will be replaced to "${escaped_name}".`
        )
        return escaped_name
    }
}