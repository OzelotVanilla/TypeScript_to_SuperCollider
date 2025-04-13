import ts from "typescript";
import { UnsupportedTypeError } from "../../../util/error";
import { Result } from "../../../util/Result";
import { convertTSExpressionToSC, escapeForSCVarIfNeeded } from "./expr_conv";
import { default_generator_context, GeneratorContext } from "../context";
import { convertTSCodeBlockToSC, hasEarlyReturnIn } from "./code_block_conv";
import { getDefDeclOutput, solveRecurBinding } from "../name_decl_def_hoist";
import { bifilter } from "../../../util/util";

/**
 * Constant array to store all supported `SyntaxKind`.
 * `class` is not considered a literal here, since it need special handling.
 * 
 * Notice that all recorded syntax kind is supported **does not means that**
 *  only the member listed here is supported.
 * For example, `undefined` acts like a constant, but it is defined as an `ts.Identifier`.
 */
export const supported_literal_syntax_kind = [
    // These are from `ts.LiteralSyntaxKind`
    ts.SyntaxKind.NumericLiteral, ts.SyntaxKind.BigIntLiteral,
    ts.SyntaxKind.StringLiteral,
    ts.SyntaxKind.RegularExpressionLiteral, ts.SyntaxKind.NoSubstitutionTemplateLiteral,
    // These are extended to make the program easy-to-write-and-understand.
    ts.SyntaxKind.TemplateExpression,
    ts.SyntaxKind.ArrayLiteralExpression,
    ts.SyntaxKind.ObjectLiteralExpression,
    ts.SyntaxKind.FunctionExpression, ts.SyntaxKind.ArrowFunction,
    // ts.SyntaxKind.ClassDeclaration, ts.SyntaxKind.ClassExpression,
    ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword,
    ts.SyntaxKind.NullKeyword
] as const

/**
 * Convert TypeScript's literal into SuperCollider's.
 * 
 * ### Caution
 * 
 * Instead of using `null` and `undefined`, when writing programs for SuperCollider, please use `nil`.
 * 
 * ### Conversion Table
 * 
 * | TS                       | SC                   | Example      | Convert Result         |
 * | ------------------------ | -------------------- | :----------- | :--------------------- |
 * | `number`                 | `Integer` or `Float` | `42`         | `42`                   |
 * | `boolean`                | `Boolean`            | `true`       | `true`                 |
 * | `string`                 | `String`             | `"a"`        | `"a"`                  |
 * | `string` (template)      | `String`             | `${a}0${b}`  | `"" ++ a ++ "0" ++ b`  |
 * | `array`                  | `Array`              | `[0, 1]`     | `[0, 1]`               |
 * | `object`                 | `Dictionary`         | `{a:0}`      | `Dictionary["a" -> 0]` |
 * | `function`               | `Function`           | `a => a + 1` | `{ arg a; a + 1 }`     |
 * | `null` (deprecated)      | `Nil`                | `null`       | `nil`                  |
 * | `undefined` (deprecated) | `Nil`                | `undefined`  | `nil`                  |
 * 
 * ### Generate Context Relationship
 * 
 * Notice that at most situation, `convertTSExpressionToSC` does not indent result.
 * See `convertTSStatementToSC` for indentation rule.
 */
export function convertTSLiteralToSC(
    literal: TSLiteral,
    generator_context: GeneratorContext = default_generator_context
): string
{
    switch (literal.kind)
    {
        case ts.SyntaxKind.NumericLiteral:
        case ts.SyntaxKind.BigIntLiteral:
            return convertTSNumberToSC(literal as TSNumberType, generator_context)

        case ts.SyntaxKind.StringLiteral:
        case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
            return `"${literal.text}"`

        case ts.SyntaxKind.TemplateExpression:
            return convertTSTemplateStringToSC(literal as ts.TemplateLiteral, generator_context)

        case ts.SyntaxKind.TrueKeyword:
            return `true`

        case ts.SyntaxKind.FalseKeyword:
            return `false`

        case ts.SyntaxKind.ArrayLiteralExpression:
            return convertTSArrayToSC(literal as ts.ArrayLiteralExpression, generator_context)

        case ts.SyntaxKind.ObjectLiteralExpression:
            return convertTSObjectToSC(literal as ts.ObjectLiteralExpression, generator_context)

        case ts.SyntaxKind.ArrowFunction:
        case ts.SyntaxKind.FunctionExpression:
            return convertTSFunctionToSC(literal as TSFunctionEssential, generator_context)

        case ts.SyntaxKind.RegularExpressionLiteral: // TODO: Not supported yet.
        default:
            if (isNullOrUndefined(literal))
            {
                console.warn(
                    `Please use SCLang's "nil" instead of TypeScript's "null" or "undefined",`,
                    ` since SCLang only have "nil" for empty values,`,
                    ` and using "null" or "undefined" may result in confusing result.`
                )
                return `nil`
            }

            throw UnsupportedTypeError.forNodeWithSyntaxKind(literal, "literal")
    }
}

export function isNullOrUndefined(node: ts.Node)
{
    return node.kind == ts.SyntaxKind.NullKeyword // If it is `null`,
        || (ts.isIdentifier(node) && node.text == "undefined") // Or if it is `undefined`.
}

export type TSNumberType = { numericLiteralFlags: ts.TokenFlags } & (
    | ts.NumericLiteral
    | ts.BigIntLiteral
)

/**
 * ### Logic
 * 
 * First, check if number inside range. If safe, go to the next stage.
 * * If literal is integer outside of `i32` range, convert to sclang `float` (which is actually `f64`)
 *   **without** lost of precision.
 * * If literal is integer outside of `i64` range, convert to `float` **with** lost of precision,
 *   giving warning.
 * 
 * ### Warning
 * 
 * SCLang only support integer literal up to `i32`, but float literal to `f64`.
 * 
 * TypeScript does **not** support `float` to have radix-prefix, but SCLang **does**.
 */
export function convertTSNumberToSC(
    literal: TSNumberType,
    generator_context: GeneratorContext = default_generator_context
): string
{
    /** Add a `.0` suffix if needed. */
    let force_to_float_suffix: "" | ".0" = ""
    /**
     * The number part of the final result, such as `2` in `8r2`, or `A4` in `0xA4`.
     * Initialised without prefix and `bigint` suffix from TS literal.
     * 
     * `(?=.+)` to not replace the literal `0` to ` `.
     */
    let number_part = literal.text.replace(/^(?:0[box]?)+(?!\.|$)|n$/g, "")
    /** The radix prefix in SCLang. */
    let radix_prefix: string = ""

    // Check if number is integer and out-of-range.
    const check_safe_int_result = assertSafeIntegerInSC(literal)
    if (check_safe_int_result.isErr())
    {
        force_to_float_suffix = ".0"

        let precision_lost_hint: string
        switch (check_safe_int_result.unwrapErr())
        {
            case OutOfSCIntRange.out_of_i64:
                precision_lost_hint = "with lost of precision"; break

            case OutOfSCIntRange.out_of_i32_inside_i64:
                precision_lost_hint = "without lost of precision"; break
        }

        const line_col_pos = ts.getLineAndCharacterOfPosition(literal.getSourceFile(), literal.pos)
        console.warn(
            `The number ${literal.getFullText().trim()} `,
            `at line ${line_col_pos.line}, column ${line_col_pos.character}, `,
            `will be converted to 64-digit float number ${precision_lost_hint}.`
        )
    }

    // Assign the prefix of number's radix.
    // If literal is `bigint`, need to check the flag manually.
    switch (ts.isBigIntLiteral(literal) ? getRadix(literal) : literal.numericLiteralFlags)
    {
        // These could be converted directly.
        case ts.TokenFlags.None: // Decimals.
        case ts.TokenFlags.Scientific: // Seems it could be only used in decimals.
            break

        case ts.TokenFlags.HexSpecifier:
            radix_prefix = "0x"; break

        // These need to use sclang's r-prefix expression.
        case ts.TokenFlags.OctalSpecifier:
        case ts.TokenFlags.Octal: // Since octal literal is not allowed in TS, this should never be checked.
            radix_prefix = "8r"; break

        case ts.TokenFlags.BinarySpecifier:
            radix_prefix = "2r"; break
    }

    return `${radix_prefix}${number_part}${force_to_float_suffix}`
}

enum OutOfSCIntRange
{
    out_of_i32_inside_i64,
    out_of_i64
}

export function assertSafeIntegerInSC(literal: TSNumberType): Result<null, OutOfSCIntRange>
{
    let n: number | bigint = literal.kind == ts.SyntaxKind.BigIntLiteral
        ? BigInt(literal.text.slice(0, -1)) // Trim the `n` in `bigint`.
        : Number(literal.text)

    if ((n < Math.pow(2, 32) - 1) && (n > -Math.pow(2, 32))) { return Result.createOk(null) }
    else if ((n < Math.pow(2, 64) - 1) && (n > -Math.pow(2, 64))) { return Result.createErr(OutOfSCIntRange.out_of_i32_inside_i64) }
    else { return Result.createErr(OutOfSCIntRange.out_of_i64) }
}

/**
 * This function use the prefix to infer the radix.
 * Notice that this function **does not** check the correctness of literal.
 * 
 * @param literal A correct TypeScript numeric literal.
 */
export function getRadix(literal: TSNumberType)
{
    switch (/^0[box]/g.exec(literal.getFullText())?.[0])
    {
        case "0b": return ts.TokenFlags.BinarySpecifier

        case "0": // This should not present in TS. For JS/TS syntax design reason, this `case` is remained.
        case "0o": return ts.TokenFlags.OctalSpecifier

        case "0x": return ts.TokenFlags.HexSpecifier

        default: return ts.TokenFlags.None
    }
}

export function convertTSTemplateStringToSC(
    literal: ts.TemplateLiteral,
    generator_context: GeneratorContext = default_generator_context
): string
{
    // No need to handle the non-substitution one.
    if (ts.isNoSubstitutionTemplateLiteral(literal)) { return `"${literal.getText()}"` }

    return [
        `"${literal.head.text}"`,
        ...literal.templateSpans.flatMap(
            s =>
            {
                const l_text = s.literal.text
                if (l_text.length > 0) { return [convertTSExpressionToSC(s.expression), `"${l_text}"`] }
                else { return convertTSExpressionToSC(s.expression) }
            }
        )
    ].join(" ++ ")
}

export function convertTSArrayToSC(
    literal: ts.ArrayLiteralExpression,
    generator_context: GeneratorContext = default_generator_context
): string
{
    // Need to check if there is spread element.
    let result = literal.elements.reduce(
        function (result_until_now, current, current_index)
        {
            const is_last_element = current_index == literal.elements.length - 1
            if (ts.isSpreadElement(current))
            {
                result_until_now.push(
                    "] ++ ",
                    convertTSExpressionToSC(current.expression, generator_context),
                    " ++ ["
                )
            }
            else
            {
                result_until_now.push(
                    convertTSExpressionToSC(current, generator_context),
                    is_last_element ? "" : ", "
                )
            }

            return result_until_now
        },
        ["["] // Initial value.
    )
    result.push("]")

    return result.join("")
}

export function convertTSObjectToSC(
    literal: ts.ObjectLiteralExpression,
    generator_context: GeneratorContext = default_generator_context
)//: string
{
    generator_context = generator_context
        .willGenerateMemberOfObjectLiteral()
        .makeThisComingFrom("object_literal_parameter")

    function convertAssignmentPair(p: ts.ObjectLiteralElementLike)
    {
        let name: string
        let value: string

        function getPropertyName(p: ts.ObjectLiteralElement & { name: ts.PropertyName })
        {

            // `p.name` could be: Identifier | StringLiteral | NoSubstitutionTemplateLiteral | NumericLiteral 
            //                    | ComputedPropertyName | PrivateIdentifier | BigIntLiteral
            switch (true)
            {
                case ts.isPrivateIdentifier(p.name):
                    console.warn(
                        `SCLang does not support private members in Dictionary.`,
                        `Converting "${p.name.text}" to normal members.`
                    )
                case ts.isIdentifier(p.name):
                    return `"${p.name.text}"`

                case isTSLiteral(p.name):
                    return convertTSExpressionToSC(p.name)

                case ts.isComputedPropertyName(p.name):
                    return convertTSExpressionToSC(p.name.expression)

                default:
                    throw UnsupportedTypeError.forNodeWithSyntaxKind(p.name, "property assignment")
            }
        }

        if (ts.isPropertyAssignment(p))
        {
            name = getPropertyName(p)
            value = convertTSExpressionToSC(p.initializer, generator_context)
        }
        else if (ts.isShorthandPropertyAssignment(p))
        {
            value = p.name.text
            name = `"${value}"`
        }
        else if (ts.isMethodDeclaration(p))
        {
            name = getPropertyName(p)

            value = p.body != undefined
                ? convertTSFunctionToSC(p as TSFunctionEssential, generator_context.willGenerateMethod())
                : "{ |tstosc__this_param| }"
        }
        // Spread-assignment is handled specially
        else { throw UnsupportedTypeError.forNodeWithSyntaxKind(p) }

        return `${name} -> ${value}`
    }

    const [spread_assignment_property, non_spread_property] = bifilter(literal.properties, p => ts.isSpreadAssignment(p))
    /** Something like `"a" -> 1, "b" -> 2`, or empty. */
    const non_spread_part = non_spread_property.map(p => convertAssignmentPair(p)).join(", ")
    /** Something like `.putAll(a).putAll(b)`, or empty. */
    const spread_part = spread_assignment_property
        .map(p => `.putAll(${convertTSExpressionToSC(p.expression, generator_context)})`)
        .join("")

    return `TSTOSC__ObjectLiteral.new(Dictionary[${non_spread_part}]${spread_part})`
}

/** 
 * Contains a leading space, and a `;` if necessay.
 */
export function getArgLine(
    trivial_params: TSTrivialParameter[],
    arg_omittable_params: TSArgOmittableParameter[],
    destruct_params: TSDestructingParameter[],
    collecting_param: TSCollectingParameter | null,
    generator_context: GeneratorContext
)
{
    const args = [
        trivial_params.map(p => escapeForSCVarIfNeeded(p.name.text)).join(", "),
        arg_omittable_params.map(p =>
            `${escapeForSCVarIfNeeded(p.name.text)}=${convertTSExpressionToSC(p.initializer, generator_context)}`
        ).join(", "),
        destruct_params.map(
            (p, index) => `tstosc_dvar_${index}` + (p.initializer != undefined
                ? ` = ${convertTSExpressionToSC(p.initializer)}`
                : ""
            )
        ).join(", "),
        collecting_param != null ? `*${escapeForSCVarIfNeeded(collecting_param?.name.text ?? "tstosc_cvar")}` : ""
    ].filter(r => r.length > 0).join(", ")

    return args.length != 0
        ? " arg " + args + " ;"
        : ""
}

export function getDestructingParamSolvingPart(
    destruct_params: TSDestructingParameter[],
    generator_context: GeneratorContext
)
{
    const result = destruct_params.length > 0
        ? destruct_params.map((p, index) => getDefDeclOutput(
            "param",
            solveRecurBinding(p.name, ts.factory.createIdentifier(`tstosc_dvar_${index}`)),
            generator_context.indent().isStandalongStatement()
        )).join(" ;\n")
        : ""
    return result != ""
        ? result + "\n"
        : ""
}

export function convertTSFunctionToSCWithParam(
    literal: TSFunctionEssential,
    trivial_params: TSTrivialParameter[],
    arg_omittable_params: TSArgOmittableParameter[],
    destruct_params: TSDestructingParameter[],
    collecting_param: TSCollectingParameter | null,
    generator_context: GeneratorContext = default_generator_context,
)
{
    const { indent_level, is_standalone_statement } = generator_context

    // Destructing-parameters need to be operated in the function body,
    //  with a placeholder in `arg`.
    /** Contains a leading space, and a `;` if necessay. */
    const sc_arg_line = literal.parameters.length > 0
        || ([...trivial_params, ...arg_omittable_params, ...destruct_params].length > 0 || collecting_param != null)
        ? getArgLine(trivial_params, arg_omittable_params, destruct_params, collecting_param, generator_context)
        // If no args, do not generate anything.
        : ""

    /** This value is for assigning destrucing variable. */
    const destruct_solving_part = getDestructingParamSolvingPart(destruct_params, generator_context)

    let sc_function_body: string
    // Convert to one-liner function if the source code is also concise.
    // It must not has early return.
    if (ts.isArrowFunction(literal) && ts.isExpression(literal.body))
    {
        sc_function_body = convertTSExpressionToSC(literal.body, generator_context)
        return `{${sc_arg_line} ${destruct_solving_part.replace("\n", "")} ${sc_function_body} }`
            .indent(is_standalone_statement ? indent_level : 0)
    }
    else if (ts.isBlock(literal.body))
    {
        const is_early_return = generator_context.with_early_return
            || (!generator_context.is_generating_method && hasEarlyReturnIn(literal.body.statements))
        sc_function_body = convertTSCodeBlockToSC(
            literal.body,
            generator_context.isStandalongStatement().indent().withEarlyReturn(is_early_return)
        )
        const is_body_mul_line = destruct_solving_part.includes("\n") || sc_function_body.includes("\n")
        const sep = is_body_mul_line ? "\n" : " "
        if (!is_body_mul_line) { sc_function_body = sc_function_body.trim() }

        return is_early_return
            ? `block { |return_with|`.indent(is_standalone_statement ? indent_level : 0) + "\n"
            + `{${sc_arg_line}`.indent(is_standalone_statement ? indent_level + 1 : 0) + "\n"
            + destruct_solving_part.indent(1)
            + sc_function_body.indent(1) + "\n" // Already with indent.
            + `}`.indent(is_standalone_statement ? indent_level + 1 : 0) + "\n"
            + `}`.indent(is_standalone_statement ? indent_level : 0)
            // No early return:
            : `{${sc_arg_line}`.indent(is_standalone_statement ? indent_level : 0) + sep
            + destruct_solving_part
            + sc_function_body + sep // Already with indent.
            + `}`.indent(is_standalone_statement ? indent_level : 0)
    }
    else { throw UnsupportedTypeError.forNodeWithSyntaxKind(literal, "function literal") }
}

export function convertTSFunctionToSC(
    literal: TSFunctionEssential,
    generator_context: GeneratorContext = default_generator_context,
)
{
    let { trivial_params, arg_omittable_params, destruct_params, collecting_param } = extractParameters(literal)
    if (generator_context.is_generating_member_of_object_literal)
    {
        trivial_params.unshift({
            ...ts.factory.createParameterDeclaration(undefined, undefined, "tstosc__this_param"),
            kind: ts.SyntaxKind.Parameter
        } as TSTrivialParameter)
    }

    return convertTSFunctionToSCWithParam(
        literal,
        trivial_params, arg_omittable_params, destruct_params, collecting_param,
        generator_context
    )
}

export function convertToSCSymbol(node: ts.Identifier)
{
    return "\\" + node.text
}

export function extractParameters(f: Pick<TSFunctionEssential, "parameters">)
{
    let parameters = [...f.parameters]
    let trivial_params: TSTrivialParameter[] = []
    let arg_omittable_params: TSArgOmittableParameter[] = []
    let destruct_params: TSDestructingParameter[] = []
    let collecting_param: TSCollectingParameter | null = null
    const last_param = f.parameters.at(-1)
    const has_rest_param = last_param != undefined && ts.isRestParameter(last_param)
    if (has_rest_param) { collecting_param = parameters.at(-1) as TSCollectingParameter; parameters = parameters.slice(0, -1) }

    for (const p of parameters)
    {
        if (ts.isIdentifier(p.name))
        {
            if (p.initializer == undefined && p.dotDotDotToken == undefined) { trivial_params.push(p as TSTrivialParameter) }
            else { arg_omittable_params.push(p as TSArgOmittableParameter) }
        }
        else // No name found, must be binding pattern, so it is destructing param.
        {
            destruct_params.push(p as TSDestructingParameter)
        }
    }

    return ({
        /** Which could be simply convert alike `a`. */
        trivial_params,
        /** Which could be simply convert alike `a = nil` or `a = 0`. */
        arg_omittable_params,
        /** Need to generate a dummy parameter, and handled inside function body. */
        destruct_params,
        /** The rest param collecting parameter. */
        collecting_param
    })
}

/**
 * Parameters that are positional, non-default-initialised.
 * 
 * Example: `a` in `function (a) { }`.
 */
export type TSTrivialParameter = Pick<ts.ParameterDeclaration, "kind"> & {
    name: ts.Identifier
    questionToken: undefined;
    dotDotDotToken: undefined
    initializer: undefined
}

/**
 * Parameters that could be omitted when passing argument.
 * 
 * Example: `a` and `b` in `function (a?, b = 1) { }`.
 */
export type TSArgOmittableParameter =
    | TSUndefinedableParameter
    | TSDefaultValuedParameter

/**
 * Parameters that could be `undefined` when passing argument.
 * 
 * Example: `a` in `function (a?) { }`.
 */
export type TSUndefinedableParameter = ts.ParameterDeclaration & {
    name: ts.Identifier
    questionToken: ts.QuestionToken;
    dotDotDotToken: undefined
    initializer: ts.Expression
}

/**
 * Parameters with a default value.
 * 
 * Example: `a` in `function (a = 1) { }`.
 */
export type TSDefaultValuedParameter = ts.ParameterDeclaration & {
    name: ts.Identifier
    questionToken: undefined;
    dotDotDotToken: undefined
    initializer: ts.Expression
}

/**
 * Parameters with a default value.
 * 
 * Example: `a` in `function (a = 1) { }`.
 */
export type TSCollectingParameter = ts.ParameterDeclaration & {
    name: ts.Identifier
    questionToken: undefined;
    dotDotDotToken: undefined
    initializer: ts.Expression
}

/**
 * Parameters that is a destructing pattern.
 * 
 * Example: `[a, b]` and `{c, d}` in `function ([a, b], {c, d}) { }`.
 */
export type TSDestructingParameter = ts.ParameterDeclaration & {
    name: ts.BindingPattern
}

/**
 * Due to the special design of TypeScript compiler,
 * this project will extends the definition of `ts.LiteralExpression`
 *  in order to make program easy-to-understand.
 */
type TSLiteral =
    | ts.LiteralExpression
    | ts.BooleanLiteral
    | ts.NullLiteral // | ts.UndefinedLiteral // `undefined` currently treated as a special constant, by JS impl.
    | ts.ArrayLiteralExpression
    | ts.ObjectLiteralExpression
    | TSFunctionLiteral

/**
 * Due to the special design of TypeScript compiler,
 * this project will extends the definition of `ts.FunctionExpression`
 *  in order to make program easy-to-understand.
 */
export type TSFunctionLiteral =
    | ts.FunctionExpression
    | ts.ArrowFunction

export type TSFunctionEssential = ts.Node & Pick<
    ts.FunctionExpression,
    "body" | "parameters"
>

/**
 * Due to the special design of TypeScript compiler,
 * this project will extends the definition of `ts.LiteralSyntaxKind`
 *  in order to make program easy-to-understand.
 * 
 * ```ts
 * type TSLiteralSyntaxKind =
 *  | ts.LiteralSyntaxKind
 *  | ts.SyntaxKind.TemplateExpression
 *  | ts.SyntaxKind.FunctionExpression
 *  | ts.SyntaxKind.NullKeyword
 * ```
 */
type TSLiteralSyntaxKind = (typeof supported_literal_syntax_kind)[number]

/**
 * Check if the node is literal, or literal-like expression
 * (including `ArrayLiteralExpression`, `ObjectLiteralExpression`,
 *  `FunctionExpression` and `ArrowFunction`).
 * 
 * ### Warning
 * 
 * To check the literal that defined by ts, use `ts.isLiteral` instead.
 */
export function isTSLiteral(node: ts.Node): node is TSLiteral
{
    return supported_literal_syntax_kind.includes(node.kind as TSLiteralSyntaxKind)
        || ts.isLiteralExpression(node)
        || ts.isArrayLiteralExpression(node)
        || ts.isObjectLiteralExpression(node)
        || isNullOrUndefined(node)
}