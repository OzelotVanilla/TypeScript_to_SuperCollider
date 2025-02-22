import ts from "typescript";
import { GeneratorContext, default_generator_context } from "../context";
import { UnsupportedTypeError } from "../../../util/error";
import { convertTSExpressionToSC } from "./expr_conv";
import { convertTSCodeBlockToSC } from "./code_block_conv";
import { convertTSFunctionToSC, extractParameters, getArgLine, getDestructingParamSolvingPart, TSDestructingParameter, TSFunctionEssential } from "./literal_conv";
import { extractVarConstDeclarationAndDefinition } from "../name_decl_def_hoist";
import { escapeForSCClassIfNeeded, escapeForSCVarIfNeeded } from "./identifier_conv";

let unnamed_class_index = 1

export function convertTSClassToSC(
    c: ts.ClassLikeDeclaration,
    generator_context: GeneratorContext = default_generator_context
): string
{
    // TODO: If someone just wrote `let AClass = class {}`.
    return convertTSClassToSCWithClassName(c, c.name?.text ?? `UnnamedClass${unnamed_class_index++}`, generator_context)
}

export function convertTSClassToSCWithClassName(
    c: ts.ClassLikeDeclaration,
    name: string,
    generator_context: GeneratorContext = default_generator_context
): string
{
    // SCLang does not have `interface`.
    /** Either "" or ": SomeClass". */
    const inherits_part = convertInheritsPart(
        c.heritageClauses != undefined
            ? c.heritageClauses.find(c => c.token == ts.SyntaxKind.ExtendsKeyword)?.types[0].expression
            : null
    )
    const generator_context_new = generator_context
        .withClassInfo({ name, super_class_name: inherits_part.replace(": ", "") })
        .makeSuperMeans("as_it_is")
    const class_member_part = convertClassMembersOf(c, generator_context_new).indent(1)

    return `${escapeForSCClassIfNeeded(name)} ${inherits_part}\n{\n`
        + class_member_part
        + "\n}"
}

/**
 * Support TypeScript Syntax like:
 * 
 * * `extends A`.
 */
function convertInheritsPart(
    inherits_part: ts.HeritageClause["types"][number]["expression"] | null | undefined
)
{
    if (inherits_part == null || inherits_part == undefined) { return "" }

    let result = ""
    switch (inherits_part.kind)
    {
        case ts.SyntaxKind.Identifier:
            result = (inherits_part as ts.Identifier).text
            break

        // TODO: with module access: should resolve to `TSTOSC_Impl_` class name, rather than access the module
        //  (because SCLang only accept Identifier after `:`).

        default:
            throw UnsupportedTypeError.forNodeWithSyntaxKind(inherits_part, "inheriting class expression")
    }

    return ": " + escapeForSCClassIfNeeded(result)
}

function getNameFromPropertyName(name: ts.PropertyName)
{
    // `m.name` could be: Identifier | StringLiteral | NoSubstitutionTemplateLiteral | NumericLiteral 
    //                    | ComputedPropertyName | PrivateIdentifier | BigIntLiteral,
    // While only legal SC name must fulfill this regex: `/^[a-z]\w?$/g`.
    switch (true)
    {
        case ts.isPrivateIdentifier(name):
            console.warn(
                `SCLang does not support private-identifier in class.`,
                `Converting "${name.text}" to normal members.`
            )
        case ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNoSubstitutionTemplateLiteral(name):
            return escapeForSCVarIfNeeded(name.text)

        default:
            throw UnsupportedTypeError.forNodeWithSyntaxKind(name, "class member name")
    }
}

function convertClassMembersOf(
    c: ts.ClassLikeDeclaration,
    generator_context: GeneratorContext
)
{
    let var_like_decl: string[] = []
    let set_get_decl: string[] = []
    let method_like_decl: string[] = []

    for (const member of c.members)
    {
        const has_modifier = (
            function (member: ts.ClassElement): member is (ts.ClassElement & { modifiers: ts.NodeArray<ts.ModifierLike> })
            { return "modifiers" in member && member.modifiers != undefined }
        )(member)

        const is_static = has_modifier && member.modifiers.some(x => x.kind == ts.SyntaxKind.StaticKeyword)
        const is_readonly = has_modifier && member.modifiers.some(x => x.kind == ts.SyntaxKind.ReadonlyKeyword)

        /** For variable member. Contains a leading space. */
        const init_part = "initializer" in member && member.initializer != undefined
            ? ` = ${convertTSExpressionToSC(member.initializer as ts.Expression, generator_context)}`
            : ""

        switch (true)
        {
            case ts.isAutoAccessorPropertyDeclaration(member):
            case ts.isPropertyDeclaration(member): {
                const name = getNameFromPropertyName((member.name))
                const stored_name = "prtstosc__store__" + name

                var_like_decl.push(`${is_static ? "classvar" : "var"} <>${stored_name}${init_part} ;`)
                set_get_decl.push(
                    `${name} { ^this.${stored_name} ; }\n`
                    + `${name}_ { |tstosc__setter_arg| this.${stored_name} = tstosc__setter_arg ; }`
                )
                break
            }

            case ts.isMethodDeclaration(member): {
                const name = getNameFromPropertyName((member.name))
                const generator_context_new = (is_static
                    ? generator_context.makeSuperMeans("class_name")
                    : generator_context
                ).willGenerateMethod().makeThisComingFrom("itself")
                const body = member.body != undefined
                    ? convertTSFunctionToSC(member as TSFunctionEssential, generator_context_new)
                    : "{ }"
                const sep = body.includes("\n") ? "\n" : " "

                method_like_decl.push(name + sep + body)
                break
            }

            case ts.isGetAccessorDeclaration(member): {
                const name = getNameFromPropertyName((member.name))
                const body = member.body != undefined
                    ? convertTSFunctionToSC(
                        member as TSFunctionEssential,
                        generator_context.willGenerateMethod().makeThisComingFrom("itself")
                    )
                    : "{ }"
                const sep = body.includes("\n") ? "\n" : " "

                set_get_decl.push(name + sep + body)
                break
            }

            case ts.isSetAccessorDeclaration(member): {
                const name = getNameFromPropertyName((member.name))
                const body = member.body != undefined
                    ? convertTSFunctionToSC(
                        member as TSFunctionEssential,
                        generator_context.willGenerateMethod().makeThisComingFrom("itself")
                    )
                    : "{ }"
                const sep = body.includes("\n") ? "\n" : " "

                set_get_decl.push(name + "_" + sep + body)
                break
            }

            case ts.isConstructorDeclaration(member): {
                if (member.body == undefined) { continue }

                method_like_decl.push(...convertConstructor(member, generator_context))
                break
            }

            case ts.isClassStaticBlockDeclaration(member): {
                const body = member.body != undefined
                    ? convertTSCodeBlockToSC(member.body, generator_context)
                    : "{ }"
                const sep = body.includes("\n") ? "\n" : " "

                method_like_decl.push("*initClass" + sep + body)
                break
            }

            // Empty statement.
            case ts.isSemicolonClassElement(member): continue

            default:
                throw UnsupportedTypeError.forNodeWithSyntaxKind(member, "class member")
        }
    }

    return [
        var_like_decl.join("\n"),
        set_get_decl.join("\n"),
        method_like_decl.join("\n")
    ].filter(s => s.length > 0).join("\n\n")
}

/**
 * ### Processing Logic
 * 
 * The constructor needs to be divided into two parts: the part before `super` call, and the part after that.
 * 
 * For the former part (`former_statement` in code below),  it will generate to`*new` method.
 * For the latter part (`latter_statement`), it will generate to `initClassName` (special for each class generated).
 * 
 * For the variables used in the constructor, this function will move them like:
 * 
 * ```ts
 * class A : X
 * {
 *     constructor(a: number, {x, y, z}: SomeType, ...args)
 *     {
 *         let b = a + 1
 *         let c = 0
 *         super(b)
 *         someFunc(b, c)
 *     }
 * }
 * ```
 * 
 * to SuperCollider:
 * 
 * ```sclang
 * A : X
 * {
 *     *new
 *     { |a, complex_obj, *collect_param|
 *         var b = a + 1, c = 0 ;
 *         var x = complex_obj.x, y = complex_obj.y, z = complex_obj.z ;
 *         tstosc__instance_built = super.new(b) ;
 *         ^tstosc__instance_built.initA(
 *             Dictionary["a" -> a, "x" -> x, "y" -> y, "z" -> z, "collect_param" -> collect_param], // Original Parameters
 *             Dictionary["b" -> b, "c" -> c] // Collected from constructor
 *         )
 *     }
 * 
 *     initA
 *     { |tstosc__constructor_param, tstosc__constructor_env|
 *         // Restore parameter and environment
 *         var a = tstosc__constructor_param
 *     }
 * }
 * ```
 */
function convertConstructor(c: ts.ConstructorDeclaration, generator_context: GeneratorContext)
{
    if (c.body == undefined) { return "" }

    // For constructor, SCLang need the final result to be returned.
    generator_context = generator_context
        .willGenerateConstructor().willGenerateMethod() // SCLang's constructor is also a method.
        .makeThisComingFrom("built_instance")

    // Need to find where `super()` is called.
    const last_super_call__index = c.body.statements.findLastIndex(
        function findSuperCall(s: ts.Node): boolean
        {
            if (ts.isCallExpression(s) && s.expression.kind == ts.SyntaxKind.SuperKeyword) { return true }
            else { return s.forEachChild(findSuperCall) ?? false }
        }
    ) ?? 0 // If it is the base class, it has no `super` call.
    /** The statement before `super` call, should be generated into SCLang's `*new` method. */
    const former_statement = c.body.statements.slice(0, last_super_call__index + 1)
    /**
     * The statement after `super` call,
     *  should be generated into SCLang's `initTStoSCClassName` ("ClassName" depends on the class name) method.
     */
    const latter_statement = c.body.statements.slice(last_super_call__index + 1)
    const init__method_name = `initTStoSC${generator_context.class_info.name}`

    // For `*new` method:
    const { trivial_params, arg_omittable_params, destruct_params, collecting_param } = extractParameters(c)
    const new__arg_line = getArgLine(trivial_params, arg_omittable_params, destruct_params, collecting_param, generator_context)
    /** Already have indentation. */
    const new__destruct_solving_part = getDestructingParamSolvingPart(destruct_params, generator_context)
    const {
        lets, consts, vars, functions
    } = extractVarConstDeclarationAndDefinition(ts.factory.createBlock(former_statement), generator_context)
    const new__body_env_dict = ts.factory.createObjectLiteralExpression([
        ...lets, ...consts, ...vars, ...functions
    ].map(([n]) => ts.factory.createPropertyAssignment(n, ts.factory.createIdentifier(n))))
    const arg_for_initClassName = new__arg_line.replace(/^\s?arg|;$/g, "").split(",").filter(s => s.length > 0)
        .map(a => ts.factory.createIdentifier(a.trim().replace(/\s?\=\s?.+$/g, "")))
    let new__body = convertTSCodeBlockToSC(ts.factory.createBlock([
        // Use a variable to store the result coming from `super()` call.
        ts.factory.createVariableStatement(undefined,
            ts.factory.createVariableDeclarationList([
                ts.factory.createVariableDeclaration("tstosc__built_instance")
            ], ts.NodeFlags.Let)
        ),
        // Statements that contains `super()` call.
        ...former_statement,
        // Call `initClassName` here.
        ts.factory.createReturnStatement(ts.factory.createCallExpression(
            ts.factory.createPropertyAccessExpression(
                ts.factory.createIdentifier("tstosc__built_instance"), init__method_name
            ),
            undefined,
            // args for `initTStoSCClassName`:
            [...arg_for_initClassName, new__body_env_dict]
        ))
    ]), generator_context)
    const is_new_body_mul_line = new__destruct_solving_part.includes("\n") || new__body.includes("\n")
    const sep__new_body = is_new_body_mul_line ? "\n" : " "
    new__body = "{" + new__arg_line + sep__new_body
        + (new__destruct_solving_part != "" ? new__destruct_solving_part + sep__new_body : "")
        + new__body.indent(is_new_body_mul_line ? 1 : 0)
        + sep__new_body + "}"

    // For `initClassName` method.
    // This method accepts all parameter in constructor, and all previous defined name (environment of `*new`).
    // The parameter of this method will be all parameter defined previously in constructor (`*new`),
    //  and a dict containing previous environment.
    const init__destruct_params = [...destruct_params, ts.factory.createParameterDeclaration(undefined, undefined, ts.factory.createObjectBindingPattern([
        ...lets, ...consts, ...vars, ...functions
    ].map(([n]) => ts.factory.createBindingElement(undefined, n, n)))) as TSDestructingParameter]
    const init__arg_line = getArgLine(trivial_params, arg_omittable_params, init__destruct_params, collecting_param, generator_context)
    /** Already have indentation. */
    const init__destruct_solving_part = getDestructingParamSolvingPart(init__destruct_params, generator_context)
    let init__body = convertTSCodeBlockToSC(ts.factory.createBlock([
        ...latter_statement,
        ts.factory.createReturnStatement(ts.factory.createThis())
    ]), generator_context.makeThisComingFrom("itself"))
    const is_init_body_mul_line = init__destruct_solving_part.includes("\n") || init__body.includes("\n")
    const sep__init_body = is_init_body_mul_line ? "\n" : " "
    init__body = "{" + init__arg_line + sep__init_body
        + (init__destruct_solving_part != "" ? init__destruct_solving_part + sep__init_body : "")
        + init__body.indent(is_init_body_mul_line ? 1 : 0)
        + sep__init_body + "}"

    return [
        "*new" + sep__new_body + new__body,
        init__method_name + sep__init_body + init__body
    ]
}