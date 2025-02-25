import ts from "typescript";
import { convertToSCSymbol, convertTSLiteralToSC, isTSLiteral } from "./literal_conv";
import { RuntimeError, UnsupportedTypeError } from "../../../util/error";
import { default_generator_context, GeneratorContext } from "../context";
import { convertTSIdentifierToSC, escapeForSCVarIfNeeded, isJavaScriptBuiltinClass } from "./identifier_conv";

export const supported_expression_syntax_kind = [
    ts.SyntaxKind.ArrayLiteralExpression, // Considered and processed as literal.
    ts.SyntaxKind.ObjectLiteralExpression, // Considered and processed as literal.
    ts.SyntaxKind.PropertyAccessExpression,
    ts.SyntaxKind.ElementAccessExpression,
    ts.SyntaxKind.CallExpression,
    ts.SyntaxKind.NewExpression,
    ts.SyntaxKind.TaggedTemplateExpression,
    ts.SyntaxKind.TypeAssertionExpression,
    ts.SyntaxKind.ParenthesizedExpression,
    ts.SyntaxKind.FunctionExpression, // Considered and processed as literal.
    ts.SyntaxKind.ArrowFunction, // Considered and processed as literal.
    // ts.SyntaxKind.DeleteExpression, // Low impl possibility.
    // ts.SyntaxKind.TypeOfExpression, // TODO.
    // ts.SyntaxKind.VoidExpression, // Meaningless when writing program for SuperCollider.
    // ts.SyntaxKind.AwaitExpression, // Might be impl.
    ts.SyntaxKind.PrefixUnaryExpression,
    ts.SyntaxKind.PostfixUnaryExpression,
    ts.SyntaxKind.BinaryExpression,
    ts.SyntaxKind.ConditionalExpression,
    ts.SyntaxKind.TemplateExpression, // Considered and processed as literal.
    // ts.SyntaxKind.YieldExpression, // Might be supported in the future.
    ts.SyntaxKind.SpreadElement,
    ts.SyntaxKind.ClassExpression,
    ts.SyntaxKind.OmittedExpression,
    ts.SyntaxKind.ExpressionWithTypeArguments,
    ts.SyntaxKind.AsExpression,
    ts.SyntaxKind.NonNullExpression,
    ts.SyntaxKind.MetaProperty,
    // ts.SyntaxKind.SyntheticExpression, // Internal, not possible to be seen in AST.
    ts.SyntaxKind.SatisfiesExpression,
] as const

/**
 * ### Generate Context Relationship
 * * `is_generating_constructor`: Controls how `this` and `super` are transpiled.
 * 
 * ### Warning
 * 
 * * No `;` is attached.  
 * * Notice that at most situation, `convertTSExpressionToSC` does not indent result.
 *  See `convertTSStatementToSC` for indentation rule.
 * * If converting an expression with self-indecr operator, this function generates multiple lines of statement,
 *    with the last statements being a global variable refering to the value of original expression.
 */
export function convertTSExpressionToSC(
    expr: ts.Expression,
    generator_context: GeneratorContext = default_generator_context
): string
{
    // Early returns:
    if (isTSLiteral(expr)) { return convertTSLiteralToSC(expr, generator_context) }
    if (ts.isIdentifier(expr)) { return convertTSIdentifierToSC(expr, generator_context) }

    // If `has_self_indecr_operator` is `true`, means not handled yet.
    // If is `false`, means no need to process, or pre-process already done.
    if (generator_context.has_unhandled_self_indecr_operator)
    {
        // TODO: Complex expression with multiple self-indecr operator.
        const expr_to_wrap = tryFindSelfIndecrOperator(expr)
        if (expr_to_wrap.length > 0)
        {
            let count = 0
            function getName(e: ts.Expression)
            {
                const id = e.getText().replace(/[^\w]/g, "_")
                return "~tstosc__temp__" + (id.length == 0 ? count++ : id)
            }

            const expr_and_names = expr_to_wrap.map(e => [e, getName(e)] as [SelfIndecrTarget, string])
            const name_of_expr = `~tstosc__temp_result__${count++}`

            // Update the `expression_temporise_dict`.
            expr_and_names.forEach(([e, n]) => generator_context.expression_temporise_dict.set(e, n))

            const result = [
                // This generate things like `~tstosc__temp_a = Ref.new(a) ;`.
                expr_and_names
                    .map(([e, n]) => `${n} = \`(${convertTSExpressionToSC(e, generator_context)}) ;`)
                    .deduplicated()
                    .join("\n"),
                name_of_expr + " = " + convertTSExpressionToSC(expr, {
                    ...generator_context,
                    has_unhandled_self_indecr_operator: false
                }) + " ;",
                expr_and_names
                    .map(([e, n]) => `${convertTSExpressionToSC(e, generator_context)} = ${n}.value ;`)
                    .deduplicated()
                    .join("\n"),
                name_of_expr
            ].join("\n")

            // Clear useless expression.
            expr_and_names.forEach(([e, _]) => generator_context.expression_temporise_dict.delete(e))

            return result
        }
    }

    switch (expr.kind)
    {
        case ts.SyntaxKind.PropertyAccessExpression:
            return convertTSPropertyAccessExpressionToSC(expr as ts.PropertyAccessExpression, generator_context)

        case ts.SyntaxKind.ElementAccessExpression:
            return convertTSElementAccessExpressionToSC(expr as ts.ElementAccessExpression, generator_context)

        case ts.SyntaxKind.CallExpression:
            return convertTSCallExpressionToSC(expr as ts.CallExpression, generator_context)

        case ts.SyntaxKind.NewExpression:
            return convertTSNewExpressionToSC(expr as ts.NewExpression, generator_context)

        case ts.SyntaxKind.TaggedTemplateExpression:
            return convertTSTaggedTemplateExpressionToSC(expr as ts.TaggedTemplateExpression, generator_context)

        case ts.SyntaxKind.ParenthesizedExpression:
            return "(" + convertTSExpressionToSC((expr as ts.ParenthesizedExpression).expression, generator_context) + ")"

        case ts.SyntaxKind.PrefixUnaryExpression:
            return translateTSPrefixUnaryExpressionToSC(expr as ts.PrefixUnaryExpression, generator_context)

        case ts.SyntaxKind.PostfixUnaryExpression:
            return translateTSPostfixUnaryExpressionToSC(expr as ts.PostfixUnaryExpression, generator_context)

        case ts.SyntaxKind.BinaryExpression:
            return convertTSBinaryExpressionToSC(expr as ts.BinaryExpression, generator_context)

        case ts.SyntaxKind.ConditionalExpression:
            return convertTSConditionalExpressionToSC(expr as ts.ConditionalExpression, generator_context)

        case ts.SyntaxKind.ThisKeyword: {
            switch (generator_context.this_coming_from)
            {
                case "object_literal_parameter":
                    return "tstosc__this_param"

                case "built_instance":
                    return "tstosc__built_instance"

                case "itself":
                    return "this"

                case "nothing":
                default:
                    throw TypeError("`this` here is not associated with outside.")
            }
        }

        case ts.SyntaxKind.SuperKeyword: {
            switch (generator_context.super_means)
            {
                // If in a constructor, the first super call should be turn into `super.new`.
                case "constructor": return "super.new"

                // If in a static method, calling `super` is equal to use super class's name.
                case "class_name": return generator_context.class_info.super_class_name

                // If it means same as `this` (in this condition, `super` is interchangable with `this`).
                case "as_it_is": return "super"

                case "nothing":
                default:
                    throw TypeError("`super` here is not associated with a class method/constructor.")
            }
        }

        case ts.SyntaxKind.ClassExpression:
        // The `...` in `[1, 2, ...[3, 4]]`.
        case ts.SyntaxKind.SpreadElement: // Handled in array transforming.
        // The missing part like `let [a0, , a2] = [0, 1, 2]`, the place that should be `a1`.
        case ts.SyntaxKind.OmittedExpression:
            // Usually it should not be appear here.
            return ""

        // Since sclang does not have static-typing, ignore these statement.
        case ts.SyntaxKind.TypeAssertionExpression:
        case ts.SyntaxKind.ExpressionWithTypeArguments: // Like `<string>` in `Array<string>`.
        case ts.SyntaxKind.AsExpression:
        case ts.SyntaxKind.NonNullExpression:
        case ts.SyntaxKind.SatisfiesExpression:
            return convertTSExpressionToSC((expr as ts.AsExpression).expression, generator_context)

        case ts.SyntaxKind.TypeOfExpression: // TODO: Will be implemented soon.
        case ts.SyntaxKind.AwaitExpression: // Might be supported in the future.
        case ts.SyntaxKind.YieldExpression: // Might be supported in the future.
        case ts.SyntaxKind.MetaProperty: // Low possibility to be implemented...
        case ts.SyntaxKind.DeleteExpression: // Low possibility to be implemented...
        default:
            throw UnsupportedTypeError.forNodeWithSyntaxKind(expr, "expression")
    }
}

export type SelfIndecrExpression =
    (ts.PrefixUnaryExpression | ts.PostfixUnaryExpression) & {
        operator: ts.SyntaxKind.PlusPlusToken | ts.SyntaxKind.MinusMinusToken
    }

export type SelfIndecrTarget =
    | ts.Identifier
    | ts.PropertyAccessExpression
    | ts.ElementAccessExpression
//  // Handled in `tryFindSelfIndecrOperator` to avoid generate `()` for temp variable.
//  | ts.ParenthesizedExpression 

export function isSelfIndecrExpression(e: ts.Node): e is SelfIndecrExpression
{
    return (ts.isPrefixUnaryExpression(e) || ts.isPostfixUnaryExpression(e))
        && (e.operator == ts.SyntaxKind.PlusPlusToken || e.operator == ts.SyntaxKind.MinusMinusToken)
}

export function hasSelfIndecrExpression(e: ts.Node): boolean
{
    if (ts.isExpression(e) && isSelfIndecrExpression(e))
    {
        return true
    }
    else
    {
        return e.forEachChild(hasSelfIndecrExpression) ?? false
    }
}

/**
 * Find all identifier that uses self-indecr operator.
 */
export function tryFindSelfIndecrOperator(e: ts.Node): SelfIndecrTarget[]
{
    let result: SelfIndecrTarget[] = []

    function traverse(node: ts.Node)
    {
        // For `has_self_indecr_operator`.
        if (ts.isExpression(node) && isSelfIndecrExpression(node))
        {
            result.push(
                ts.isParenthesizedExpression(node.operand)
                    ? node.operand.expression as SelfIndecrTarget
                    : node.operand as SelfIndecrTarget
            )
        }

        node.forEachChild(traverse)
    }
    traverse(e)

    return result
}

export function isStoringObjectLiteral(
    node: ts.Node,
    generator_context: GeneratorContext
)
{
    if (node.kind == ts.SyntaxKind.ThisKeyword || node.kind == ts.SyntaxKind.SuperKeyword) { return false }
    if (ts.isIdentifier(node) && node.text.startsWith("tstosc_dvar_")) { return true }

    const node_type = generator_context.compiler_program.getTypeChecker().getTypeAtLocation(node)
    return "symbol" in node_type
        && (node_type.symbol.escapedName == "__object"
            || (node_type.symbol.flags & ts.SymbolFlags.ObjectLiteral) != 0)
}

/**
 * ### Processing Logic
 * 
 * * If left side of expression is an object literal, it will be translated to `TSTOSC_ObjectLiteral` in SCLang.
 *   So, using `[]` to index.
 * * Otherwise, just use `.`.
 */
export function convertTSPropertyAccessExpressionToSC(
    e: ts.PropertyAccessExpression,
    generator_context: GeneratorContext = default_generator_context
)
{
    return isStoringObjectLiteral(e.expression, generator_context) || generator_context.this_coming_from == "object_literal_parameter"
        ? `${convertTSExpressionToSC(e.expression, generator_context)}["${escapeForSCVarIfNeeded(e.name.text)}"]`
        : `${convertTSExpressionToSC(e.expression, generator_context)}.${escapeForSCVarIfNeeded(e.name.text)}`
}

export function convertTSElementAccessExpressionToSC(
    e: ts.ElementAccessExpression,
    generator_context: GeneratorContext = default_generator_context
)
{
    return (
        convertTSExpressionToSC(e.expression, generator_context)
        + "["
        + convertTSExpressionToSC(e.argumentExpression, generator_context)
        + "]"
    )
}

export function isMethod(
    node: ts.Node,
    generator_context: GeneratorContext
)
{
    if (ts.isPropertyAccessExpression(node))
    {
        // If left side of a property-access expression is an object literal,
        //  `node` will not be considered method due to polyfill implementation of object literal in SCLang.
        return !isStoringObjectLiteral(node.expression, generator_context)
    }
    else
    {
        const node_type = generator_context.compiler_program.getTypeChecker().getTypeAtLocation(node)
        return "symbol" in node_type
            && (node_type.symbol.flags & ts.SymbolFlags.Method) != 0
    }
}

export function convertTSCallExpressionToSC(
    e: ts.CallExpression,
    generator_context: GeneratorContext = default_generator_context
)
{
    /** If the left side is `super`, and it means this class's super-class's constructor semantically. */
    const is_left_side_a_constructor_super = e.expression.kind == ts.SyntaxKind.SuperKeyword && generator_context.is_generating_constructor

    const left_side = is_left_side_a_constructor_super
        ? convertTSExpressionToSC(e.expression, generator_context.makeSuperMeans("constructor"))
        : convertTSExpressionToSC(e.expression, generator_context)

    // SCLang need a `.` (`.value`) for calling functions, but not method.
    const dot_or_not = (isMethod(e.expression, generator_context) || is_left_side_a_constructor_super)
        ? ""
        : "."

    const result = left_side
        + dot_or_not
        + "(" + e.arguments.map(a => convertTSExpressionToSC(a, generator_context)).join(", ") + ")"

    return is_left_side_a_constructor_super
        ? "(tstosc__built_instance = " + result + ")"
        : result
}

export function convertTSNewExpressionToSC(
    e: ts.NewExpression,
    generator_context: GeneratorContext = default_generator_context
)
{
    let class_name: string = ts.isIdentifier(e.expression) && isJavaScriptBuiltinClass(e.expression, generator_context)
        ? "TSTOSC__" + e.expression.text
        : convertTSExpressionToSC(e.expression, generator_context.willGenerateClassName())

    return class_name
        + ".new" + "("
        + (e.arguments?.map(a => convertTSExpressionToSC(a, generator_context)).join(", ") ?? "")
        + ")"
}

export function convertTSTaggedTemplateExpressionToSC(
    e: ts.TaggedTemplateExpression,
    generator_context: GeneratorContext = default_generator_context
)
{
    const { template, tag } = e
    if (ts.isNoSubstitutionTemplateLiteral(template))
    {
        return convertTSCallExpressionToSC(ts.factory.createCallExpression(
            tag,
            /* type_arguments */ undefined,
            [
                // The tag-function's first argument is the plain-text in the template.
                ts.factory.createArrayLiteralExpression([ts.factory.createStringLiteral(template.text)])
            ]
        ), generator_context)
    }
    else
    {
        return convertTSCallExpressionToSC(ts.factory.createCallExpression(
            tag,
            /* type_arguments */ undefined,
            [
                // The tag-function's first argument is the plain-text in the template.
                ts.factory.createArrayLiteralExpression([
                    template.head, ...template.templateSpans.map(s => s.literal)
                ].map(s => ts.factory.createStringLiteral(s.text))),

                // The following argument is the template's `${}` expression part.
                ...template.templateSpans.map(s => s.expression)
            ]
        ), generator_context)
    }
}

function returnOrThrowIfNotInTemporiseDict(e: ts.Expression, generator_context: GeneratorContext)
{
    const temp_name = generator_context.expression_temporise_dict.get(e)
    if (temp_name == undefined)
    {
        throw new RuntimeError(
            `Expression ("${e.getText()}") should be in expression_temporise_dict, ` +
            `but not found.`
        )
    }

    return temp_name
}

/**
 * Handle things like `+a`, `!a`, or `++a`.
 * 
 * If exist unary self increment/decrement expression,
 *  global variables such as `~tstosc__pre_incr` will be generated beforehand.
 */
export function translateTSPrefixUnaryExpressionToSC(
    e: ts.PrefixUnaryExpression,
    generator_context: GeneratorContext = default_generator_context
)
{
    switch (e.operator)
    {
        case ts.SyntaxKind.MinusToken:
            return "-" + convertTSExpressionToSC(e.operand, generator_context)

        case ts.SyntaxKind.ExclamationToken:
            return "not(" + convertTSExpressionToSC(e.operand, generator_context) + ")"

        case ts.SyntaxKind.PlusPlusToken:
            return "~tstosc__pre_incr.(" + returnOrThrowIfNotInTemporiseDict(e.operand, generator_context) + ")"

        case ts.SyntaxKind.MinusMinusToken:
            return "~tstosc__pre_decr.(" + returnOrThrowIfNotInTemporiseDict(e.operand, generator_context) + ")"

        case ts.SyntaxKind.TildeToken:
            return "bitNot(" + convertTSExpressionToSC(e.operand, generator_context) + ")"

        case ts.SyntaxKind.PlusToken:
            // If it is on a expression, then almost no meaning.
            // TODO: disallow `+` as number converting such as `+"1"`.
            // generator_context.compiler_program.getTypeChecker().getTypeAtLocation(e.operand)
            return convertTSExpressionToSC(e.operand, generator_context)

        default:
            throw UnsupportedTypeError.ofSyntaxKind(
                (e as ts.PrefixUnaryExpression).operator, "unary prefix operator", e
            )
    }
}

/**
 * Handle things like `a++` and `a--`.
 * 
 * If exist unary self increment/decrement expression,
 *  global variables such as `~tstosc__pre_incr` will be generated beforehand.
 */
export function translateTSPostfixUnaryExpressionToSC(
    e: ts.PostfixUnaryExpression,
    generator_context: GeneratorContext = default_generator_context
)
{
    switch (e.operator)
    {
        case ts.SyntaxKind.PlusPlusToken:
            return "~tstosc__post_incr.(" + returnOrThrowIfNotInTemporiseDict(e.operand, generator_context) + ")"

        case ts.SyntaxKind.MinusMinusToken:
            return "~tstosc__post_decr.(" + returnOrThrowIfNotInTemporiseDict(e.operand, generator_context) + ")"

        default:
            throw UnsupportedTypeError.ofSyntaxKind(
                (e as ts.PostfixUnaryExpression).operator, "unary postfix operator", e
            )
    }
}

export function convertTSConditionalExpressionToSC(
    e: ts.ConditionalExpression,
    generator_context: GeneratorContext = default_generator_context
)
{
    return "if("
        + convertTSExpressionToSC(e.condition, generator_context.atValuePosition()) + ", "
        + convertTSExpressionToSC(e.whenTrue, generator_context.atValuePosition()) + ", "
        + convertTSExpressionToSC(e.whenFalse, generator_context.atValuePosition())
        + ")"
}

/**
 * Stores binary operator that could be simply converted to infix expression in SCLang.
 * 
 * Example: `[ts.SyntaxKind.PlusToken, "+"]`: `1 + 2` -> `1 + 2`.
 */
const ts_infix_becoming_binary_operator_to_sc_dict = new Map([
    [ts.SyntaxKind.PlusToken, "+"], [ts.SyntaxKind.MinusToken, "-"],
    [ts.SyntaxKind.AsteriskToken, "*"], [ts.SyntaxKind.SlashToken, "/"],
    [ts.SyntaxKind.PercentToken, "%"], [ts.SyntaxKind.AsteriskAsteriskToken, "**"],
    [ts.SyntaxKind.EqualsToken, "="],
    [ts.SyntaxKind.EqualsEqualsToken, "=="], [ts.SyntaxKind.ExclamationEqualsToken, "!="],
    [ts.SyntaxKind.EqualsEqualsEqualsToken, "=="],
    [ts.SyntaxKind.LessThanToken, "<"], [ts.SyntaxKind.GreaterThanToken, ">"],
    [ts.SyntaxKind.LessThanEqualsToken, "<="], [ts.SyntaxKind.GreaterThanEqualsToken, ">="],
    [ts.SyntaxKind.AmpersandAmpersandToken, "&&"], [ts.SyntaxKind.BarBarToken, "||"],
])

/**
 * Stores operators (**not binary operator only**)
 *  that could be simply converted to prefix function-call-alike expression in SCLang.
 * 
 * Example: 
 * * `[ts.SyntaxKind.TildeToken, "bitNot"]`: `~1` -> `bitNot(1)`.
 * * `[ts.SyntaxKind.BarToken, "bitOr"]`: `1 | 2` -> `bitOr(1, 2)`.
 */
const ts_function_call_becoming_operator_to_sc_dict = new Map([
    // Unary
    [ts.SyntaxKind.TildeToken, "bitNot"],
    [ts.SyntaxKind.ExclamationToken, "not"],

    // Binary
    [ts.SyntaxKind.AmpersandToken, "bitAnd"], [ts.SyntaxKind.BarToken, "bitOr"], [ts.SyntaxKind.CaretToken, "bitXor"],
    [ts.SyntaxKind.LessThanLessThanToken, "leftShift"], [ts.SyntaxKind.GreaterThanGreaterThanToken, "rightShift"],
    [ts.SyntaxKind.GreaterThanGreaterThanGreaterThanToken, "unsignedRightShift"],
    [ts.SyntaxKind.QuestionQuestionToken, "TSTOSC.orElse"]
])

/**
 * Get the original form of the short-hand assignment operator such as `+=`.
 * 
 * Making the pair between `PlusEqualsToken` (`+=`) to `PlusToken` (`+`).
 */
const ts_shorthand_assignment_operator_to_ts_operator_dict: Map<ts.SyntaxKind, ts.BinaryOperator> = new Map([
    // Arithmetic
    [ts.SyntaxKind.PlusEqualsToken, ts.SyntaxKind.PlusToken],
    [ts.SyntaxKind.MinusEqualsToken, ts.SyntaxKind.MinusToken],
    [ts.SyntaxKind.AsteriskEqualsToken, ts.SyntaxKind.AsteriskToken],
    [ts.SyntaxKind.SlashEqualsToken, ts.SyntaxKind.SlashToken],
    [ts.SyntaxKind.PercentEqualsToken, ts.SyntaxKind.PercentToken],
    [ts.SyntaxKind.AsteriskAsteriskEqualsToken, ts.SyntaxKind.AsteriskAsteriskToken],

    // Bitwise
    [ts.SyntaxKind.AmpersandEqualsToken, ts.SyntaxKind.AmpersandToken],
    [ts.SyntaxKind.BarEqualsToken, ts.SyntaxKind.BarToken],
    [ts.SyntaxKind.CaretEqualsToken, ts.SyntaxKind.CaretToken],
    [ts.SyntaxKind.LessThanLessThanEqualsToken, ts.SyntaxKind.LessThanLessThanToken],
    [ts.SyntaxKind.GreaterThanGreaterThanEqualsToken, ts.SyntaxKind.GreaterThanGreaterThanToken],
    [ts.SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken, ts.SyntaxKind.GreaterThanGreaterThanGreaterThanToken]
])

export function convertTSBinaryExpressionToSC(
    e: ts.BinaryExpression,
    generator_context: GeneratorContext = default_generator_context
)
{
    const [left_expr, op_syntax_kind, right_expr] = [e.left, e.operatorToken.kind, e.right]

    // If is infix-becoming operator (`1 + 2`):
    {
        const op_conved = ts_infix_becoming_binary_operator_to_sc_dict.get(op_syntax_kind)
        if (op_conved != undefined)
        {
            return (
                convertTSExpressionToSC(e.left, generator_context.atValuePosition())
                + " "
                + op_conved
                + " "
                + convertTSExpressionToSC(e.right, generator_context.atValuePosition())
            )
        }
    }

    // If is function-call-becoming operator (`bitAnd(1, 2)`):
    {
        const op_conved = ts_function_call_becoming_operator_to_sc_dict.get(op_syntax_kind)
        if (op_conved != undefined)
        {
            return (
                op_conved + "("
                + convertTSExpressionToSC(left_expr, generator_context.atValuePosition())
                + ", "
                + convertTSExpressionToSC(right_expr, generator_context.atValuePosition())
                + ")"
            )//.indent(is_standalone_statement ? indent_level : 0)
        }
    }

    // If is short-hand assignment operator:
    {
        // Delegate to self again.
        const ts_op_conved = ts_shorthand_assignment_operator_to_ts_operator_dict.get(op_syntax_kind)
        if (ts_op_conved != undefined)
        {
            return convertTSExpressionToSC(ts.factory.createAssignment(
                // Make convert such as `a += 1` to `a = a + 1`.
                left_expr,
                ts.factory.createBinaryExpression(left_expr, ts_op_conved, right_expr)
            ), generator_context) // Do not create indent or modify context here, since delegated.
        }
    }

    switch (op_syntax_kind)
    {
        case ts.SyntaxKind.InstanceOfKeyword:
            return convertTSExpressionToSC(left_expr, generator_context.atValuePosition())
                + ".isKindOf" + "(" +
                (right_expr as ts.Identifier).text
                + ")"

        case ts.SyntaxKind.InKeyword:
            return (right_expr as ts.Identifier).text
                + ".respondsTo" + "("
                + convertToSCSymbol(left_expr as ts.Identifier)
                + ")"

        default:
            throw UnsupportedTypeError.forNodeWithSyntaxKind(e.operatorToken, "operator")
    }
}