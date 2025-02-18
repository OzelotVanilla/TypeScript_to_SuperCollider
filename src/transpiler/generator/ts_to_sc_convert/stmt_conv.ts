import ts from "typescript";
import { default_generator_context, GeneratorContext } from "../context";
import { convertTSExpressionToSC, escapeForSCVarIfNeeded, isSelfIndecrExpression } from "./expr_conv";
import { convertTSCodeBlockToSC } from "./code_block_conv";
import { convertTSFunctionToSC } from "./literal_conv";
import { UnsupportedTypeError } from "../../../util/error";
import { DefDeclCollection, getDefDeclOutput, isAfterwhileInitInitialiser, isLetDeclarationList, solveRecurBinding } from "../name_decl_def_hoist";
import { hash, isArrayLike } from "../../../util/util";
import { getTypeOfTSNode } from "../../../util/ts";

export const supported_statement_syntax_kind = [
    ts.SyntaxKind.VariableStatement,
    ts.SyntaxKind.ExpressionStatement,
    ts.SyntaxKind.IfStatement,
    ts.SyntaxKind.DoStatement,
    ts.SyntaxKind.WhileStatement,
    ts.SyntaxKind.ForStatement,
    ts.SyntaxKind.ForInStatement,
    ts.SyntaxKind.ForOfStatement,
    ts.SyntaxKind.ContinueStatement,
    ts.SyntaxKind.BreakStatement,
    ts.SyntaxKind.ReturnStatement,
    // Not recommended and Not supported in this project: ts.SyntaxKind.WithStatement,
    ts.SyntaxKind.SwitchStatement,
    ts.SyntaxKind.LabeledStatement,
    ts.SyntaxKind.ThrowStatement,
    ts.SyntaxKind.TryStatement,
    // Might be implemented in the future: ts.SyntaxKind.DebuggerStatement,
    ts.SyntaxKind.EmptyStatement
] as const

/**
  * ### Generate Context Relationship
  * 
  * * `block_with_early_return = true`:
  *   Convert all return statement from `return x` to `return_with.value(x)`
  * * `indent_level`:
  *   By default, each statement handle the indentation.
  *   Literal, expression, or code block, they **should not** create indentation,
  *    unless they are returning lines of code using string constant.
  * * `statement_label`: Delegate to convert-functions, if there is a label.
  *    **Should** be cleared after processing.
  */
export function convertTSStatementToSC(
    stmt: ts.Statement,
    generator_context: GeneratorContext = default_generator_context
): string
{
    const { indent_level, is_standalone_statement } = generator_context

    switch (stmt.kind)
    {
        // `import` statement.
        // TODO: If there is any need to process this kind of statement.
        case ts.SyntaxKind.ImportDeclaration:
            return ""

        // Convert only after-while-initialiser. See function `isAfterwhileInitInitialiser`.
        case ts.SyntaxKind.VariableStatement:
            return restyleTSVariableStatementToSC(stmt as ts.VariableStatement, generator_context)
                .indent(is_standalone_statement ? indent_level : 0)

        // Might be code block used as scope in `statements`.
        case ts.SyntaxKind.Block:
            return convertTSCodeBlockToSC(stmt as ts.Block, generator_context)

        case ts.SyntaxKind.FunctionDeclaration:
            return converTSFunctionDeclarationToSC(stmt as ts.FunctionDeclaration, generator_context)

        case ts.SyntaxKind.ExpressionStatement:
            return convertTSExpressionToSC(
                (stmt as ts.ExpressionStatement).expression,
                generator_context.isStandalongStatement()
            ).indent(is_standalone_statement ? indent_level : 0) + " ;"

        case ts.SyntaxKind.IfStatement:
            return convertTSIfStatementToSC(stmt as ts.IfStatement, generator_context)
                .indent(is_standalone_statement ? indent_level : 0)

        case ts.SyntaxKind.DoStatement:
            return convertTSDoStatementToSC(stmt as ts.DoStatement, generator_context)
                .indent(is_standalone_statement ? indent_level : 0)

        case ts.SyntaxKind.LabeledStatement:
            // Let inner statement handle the indentation.
            return convertTSLabeledStatementToSC(stmt as ts.LabeledStatement, generator_context)

        case ts.SyntaxKind.WhileStatement:
            return convertTSWhileStatementToSC(stmt as ts.WhileStatement, generator_context)
                .indent(is_standalone_statement ? indent_level : 0)

        case ts.SyntaxKind.ForStatement:
            return convertTSForStatementToSC(stmt as ts.ForStatement, generator_context)
                .indent(is_standalone_statement ? indent_level : 0)

        case ts.SyntaxKind.ForInStatement:
            return convertTSForInStatementToSC(stmt as ts.ForInStatement, generator_context)
                .indent(is_standalone_statement ? indent_level : 0)

        case ts.SyntaxKind.ForOfStatement:
            return convertTSForOfStatementToSC(stmt as ts.ForOfStatement, generator_context)
                .indent(is_standalone_statement ? indent_level : 0)

        case ts.SyntaxKind.ContinueStatement:
            return translateTSContinueStatementToSC(stmt as ts.ContinueStatement, generator_context)
                .indent(is_standalone_statement ? indent_level : 0)

        case ts.SyntaxKind.BreakStatement:
            return translateTSBreakStatementToSC(stmt as ts.BreakStatement, generator_context)
                .indent(is_standalone_statement ? indent_level : 0)

        case ts.SyntaxKind.ReturnStatement:
            return translateTSReturnStatementToSC(stmt as ts.ReturnStatement, generator_context)
                .indent(is_standalone_statement ? indent_level : 0)

        case ts.SyntaxKind.SwitchStatement:
            return convertTSSwitchStatementToSC(stmt as ts.SwitchStatement, generator_context)
                .indent(is_standalone_statement ? indent_level : 0)

        case ts.SyntaxKind.ThrowStatement:
            return convertTSThrowStatementToSC(stmt as ts.ThrowStatement, generator_context)
                .indent(is_standalone_statement ? indent_level : 0)

        case ts.SyntaxKind.TryStatement:
            return convertTSTryStatementToSC(stmt as ts.TryStatement, generator_context)
                .indent(is_standalone_statement ? indent_level : 0)

        // Solved by class definition generation (to User Extension Dir).
        case ts.SyntaxKind.ClassDeclaration:
        // SCLang does not check type.
        case ts.SyntaxKind.InterfaceDeclaration:
        case ts.SyntaxKind.TypeAliasDeclaration:
        // No need to transpile.
        case ts.SyntaxKind.EmptyStatement:
            return ""

        case ts.SyntaxKind.WithStatement:
        case ts.SyntaxKind.DebuggerStatement:
        default:
            throw UnsupportedTypeError.forNodeWithSyntaxKind(stmt, "statement")
    }
}

/**
 * If this variable declaration contains after-while-initialiser (e.g., expression with self-indecr operator),
 *  then convert. With ` ;` appended.
 * 
 * Otherwise, return an empty string.
 */
export function restyleTSVariableStatementToSC(
    s: ts.VariableStatement,
    generator_context: GeneratorContext = default_generator_context,
    force_conversion: boolean = false
)
{
    let collection: DefDeclCollection = []

    for (const d of s.declarationList.declarations)
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

    const hint = isLetDeclarationList(s.declarationList)
        ? "let"
        : "const"

    return collection
        .filter(
            (p): p is [string, ts.Expression] =>
                p[1] != undefined && (force_conversion || isAfterwhileInitInitialiser(p[1]))
        )
        .map(([n, v]) =>
        {
            const converted_stmts = convertTSExpressionToSC(v, generator_context).split(";\n")
            const conv_stmt_until_last = converted_stmts.slice(0, -1).join(";\n")
            return conv_stmt_until_last + (conv_stmt_until_last.length > 0 ? ";\n" : "")
                + `/* ${hint} */ ${n} = ${converted_stmts.at(-1)} ;`
        })
        .join("\n")
}

/**
 * If function has a name, then already hoisted.
 */
export function converTSFunctionDeclarationToSC(
    s: ts.FunctionDeclaration,
    generator_context: GeneratorContext = default_generator_context
)
{
    if (s.name == undefined || s.body == undefined) { return "" }
    else
    {
        type FuncDeclEssential = Exclude<ts.FunctionExpression, ts.PrimaryExpression>
        return `${s.name.text} = `
            + convertTSFunctionToSC(s as FuncDeclEssential, generator_context.atValuePosition())
            + " ;"
    }
}

export function convertTSLabeledStatementToSC(
    s: ts.LabeledStatement,
    generator_context: GeneratorContext = default_generator_context
)
{
    return convertTSStatementToSC(s.statement, generator_context.withStatementLabel(s.label.text))
}

function convertIncrementor(
    incrementor: ts.Expression,
    generator_context: GeneratorContext
)
{
    if (isSelfIndecrExpression(incrementor))
    {
        const operator = incrementor.operator == ts.SyntaxKind.PlusPlusToken ? "+" : "-"
        const target = convertTSExpressionToSC(incrementor.operand, generator_context.atValuePosition())
        return `/* increment */\n${target} = ${target} ${operator} 1 `
    }
    else
    {
        return convertTSExpressionToSC(incrementor, generator_context.isStandalongStatement())
    }
}

/**
 * In case of `continue` or `break`:
 * 
 * If found a `continue` or `break` in code, the result is wrapped.
 * 
 * ### Generate Context Relationship
 * 
 * * `statement_label`: If a loop body is passed, it will be wrapped if `statement_label` exists.
 */
function convertControlFlowBody(
    b: ts.Block | ts.Statement | ArrayLike<ts.Statement> | undefined,
    generator_context: GeneratorContext,
    incrementor?: ts.Expression,
    is_a_loop: boolean = false
)
{
    if (b == undefined) { return "{ }" }

    const { statement_label, is_nested_loop } = generator_context

    // Clear the label information for nested loops (if exists), and set to nested loop.
    let generator_context_new = generator_context.withStatementLabel("").isNestedLoop().clearedStatementLabel()

    // Check if there is loop-interrupt statement, if needed.
    if (generator_context_new.with_loop_interrupt == null)
    {
        if (isArrayLike(b))
        {
            generator_context_new.with_loop_interrupt = false
            for (let i = 0; i < b.length; i++)
            {
                if (ts.isBreakOrContinueStatement(b[i]))
                {
                    generator_context_new.with_loop_interrupt = true
                    break
                }
            }
        }
        else
        {
            generator_context_new.with_loop_interrupt = ts.isBlock(b)
                ? b.forEachChild(
                    function traverse(n: ts.Node): boolean
                    {
                        if (ts.isBreakOrContinueStatement(n)) { return true }
                        else { return n.forEachChild(traverse) ?? false }
                    }
                ) ?? false
                : ts.isBreakOrContinueStatement(b)
        }
    }

    let result: string = ""
    if (isArrayLike(b))
    {
        let converted = []
        for (let i = 0; i < b.length; i++) { converted.push(convertTSStatementToSC(b[i], generator_context_new)) }
        result = converted.join("\n")
    }
    else if (ts.isBlock(b))
    {
        result = convertTSCodeBlockToSC(b, generator_context_new)
    }
    else if (!ts.isEmptyStatement(b)) // If empty, do nothing, just let `result` still be `""`.
    {
        // At this condition, will be `{ stmt }`. Should not indent here.
        result = convertTSStatementToSC(b, generator_context_new.isStandalongStatement(false))
    }

    // Wrap for labels, be prepared if inner statements uses `break label` for a early stop.
    // If it is a loop, wrap for loop-interrupt if need. Notice that label can appears here.
    if (generator_context_new.with_loop_interrupt && is_a_loop)
    {
        result = "/* loop body */\nvar tstosc__loop_should_break = block { |loop_end|\n"
            + (
                // If there is also a label, put it before all statement.
                (statement_label != ""
                    ? `var /* label */ tstosc__label__${statement_label} = loop_end ;\n`
                    : "")
                + result + "\n"
                + "/* Dafault value for tstosc__loop_should_break */\n"
                + "false ;"
            ).indent(1)
            + "\n} ;\n"
            + "/* Loop-Should-Break Checkpoint */\n"
            + `if (tstosc__loop_should_break) { ${is_nested_loop ? "loop_end.value(true) ;" : "^nil ;"} } ;`
    }

    // Incrementor is never affected by loop-interrupt. Append it at last.
    result += incrementor != undefined
        ? "\n" + convertIncrementor(incrementor, generator_context_new) + " ;"
        : ""

    const stmt_len = result.split("\n").length
    // Wrap the results according to line number
    if (stmt_len > 1) { return "{\n" + result.indent(stmt_len > 1 ? 1 : 0) + "\n}" }
    else if (stmt_len == 1) { return "{ " + result + " }" }
    else { return "{ }" }
}

/**
 * 
 * ### Generate Context Relationship
 * 
 * * `statement_label`: Handled and wrapped here, if there is a label.
 */
export function convertTSIfStatementToSC(
    s: ts.IfStatement,
    generator_context: GeneratorContext = default_generator_context
)
{
    const { is_standalone_statement, indent_level, statement_label } = generator_context
    const generator_context_new = generator_context.clearedStatementLabel()
    const sep = is_standalone_statement ? "\n" : " "

    let result = "if("
        + (is_standalone_statement ? "\n" : "")
        + convertTSExpressionToSC(s.expression, generator_context_new,).indent(indent_level + 1) + "," + sep
        + convertControlFlowBody(s.thenStatement, generator_context_new).indent(indent_level + 1) + "," + sep
        + convertControlFlowBody(s.elseStatement, generator_context_new).indent(indent_level + 1)
        + (is_standalone_statement ? "\n)" : ")")
        + " ;"

    // Wrap for possible label.
    result = wrapIfLabelExist(result, statement_label)

    return result
}

export function convertTSDoStatementToSC(
    s: ts.DoStatement,
    generator_context: GeneratorContext = default_generator_context
)
{
    const iter_body_name = "~tstosc__do_body__" + hash(s.statement).slice(0, 8)
    const iter_body_run = iter_body_name + ".()"

    return iter_body_name
        + ` = ${convertControlFlowBody(s.statement, generator_context.makeBreakMeans("stop_a_loop"), undefined, true)} ;\n`
        + iter_body_run + " ;\n"
        + `while({ ${convertTSExpressionToSC(s.expression, generator_context)} }, { ${iter_body_run} }) ;`
}

export function convertTSWhileStatementToSC(
    s: ts.WhileStatement,
    generator_context: GeneratorContext = default_generator_context
)
{
    const { is_standalone_statement, indent_level } = generator_context
    const raw_condition = convertTSExpressionToSC(s.expression, generator_context)
    const condition = raw_condition.includes("\n")
        ? "{\n" + raw_condition.indent(1) + "\n}"
        : "{ " + raw_condition + " },"
    const body = convertControlFlowBody(s.statement, generator_context.makeBreakMeans("stop_a_loop"), undefined, true)

    return "while("
        + (is_standalone_statement ? "\n" : "")
        + condition.indent(indent_level + 1)
        + (is_standalone_statement ? "\n" : " ")
        + body.indent(indent_level + 1)
        + (is_standalone_statement ? "\n)" : ")")
        + " ;"
}

export function convertTSForStatementToSC(
    s: ts.ForStatement,
    generator_context: GeneratorContext = default_generator_context
)
{
    const { is_standalone_statement, indent_level } = generator_context
    const generator_context_new = generator_context.makeBreakMeans("stop_a_loop")
    const sep = is_standalone_statement ? "\n" : " "
    function convertForInitialiser(init_part: ts.ForStatement["initializer"])
    {
        if (init_part == undefined) { return "" }

        if (ts.isVariableDeclarationList(init_part))
        {
            return restyleTSVariableStatementToSC(
                ts.factory.createVariableStatement(undefined, init_part), generator_context_new,
                true // Forcing the conversion. 
            )
        }
        else if (ts.isExpression(init_part))
        {
            return convertTSExpressionToSC(init_part, generator_context_new)
        }
        else
        {
            throw UnsupportedTypeError.forNodeWithSyntaxKind(init_part, "for statement initialiser")
        }
    }
    function convertForCondition(cond: ts.ForStatement["condition"])
    {
        if (cond == undefined) { return "" }
        else { return `{ ${convertTSExpressionToSC(cond, generator_context_new)} }` }
    }

    const init_part = convertForInitialiser(s.initializer)

    return init_part + (init_part.length > 0 ? "\n" : "")
        + "while("
        + (is_standalone_statement ? "\n    " : "")
        + convertForCondition(s.condition) + "," + sep
        + convertControlFlowBody(s.statement, generator_context_new, s.incrementor, true).indent(indent_level + 1)
        + (is_standalone_statement ? "\n)" : ")")
        + " ;"
}

/**
 * 
 * ### Generate Context Relationship
 * 
 * * `statement_label`: Delegate to `convertControlFlowBody`, if there is a label.
 */
function convertTSForInOrForOfStatement__Impl(s: ts.ForInStatement, kind: "for-in", generator_context?: GeneratorContext): string
/**
 * 
 * ### Generate Context Relationship
 * 
 * * `statement_label`: Delegate to `convertControlFlowBody`, if there is a label.
 */
function convertTSForInOrForOfStatement__Impl(s: ts.ForOfStatement, kind: "for-of", generator_context?: GeneratorContext): string
function convertTSForInOrForOfStatement__Impl(
    s: ts.ForInStatement | ts.ForOfStatement,
    kind: "for-in" | "for-of",
    generator_context: GeneratorContext = default_generator_context
)
{
    const body = convertControlFlowBody(
        s.statement, generator_context.outdent(), /* incrementor */ undefined, /* is_a_loop */ true
    ).replace(/^{\s?|\s?}$/g, "")
    const is_multi_line_body = body.includes("\n")
    const sep = is_multi_line_body ? "\n" : " "
    const is_complex_initialiser = !(ts.isVariableDeclarationList(s.initializer) && ts.isIdentifier(
        s.initializer.declarations[0].name
    )) && !ts.isIdentifier(s.initializer)
    const initialiser_arg = is_complex_initialiser
        ? "tstosc__loopvar"
        : escapeForSCVarIfNeeded(((ts.isVariableDeclarationList(s.initializer)
            ? s.initializer.declarations[0].name
            : s.initializer) as ts.Identifier
        ).text)
    const loopvar_pattern_solving = is_complex_initialiser
        ? getDefDeclOutput("loopvar", solveRecurBinding(
            (s.initializer as ts.VariableDeclarationList).declarations[0].name,
            ({
                ...ts.factory.createIdentifier("tstosc__loopvar"),
                kind: ts.SyntaxKind.Identifier, text: "tstosc__loopvar",
                forEachChild: () => undefined
            })
        ))
        : ""

    return convertTSExpressionToSC(s.expression, generator_context.clearedStatementLabel()) + ".do" + sep
        + (kind == "for-in"
            ? "{ /* for-in */ |tstosc__drop_arg, " + initialiser_arg + "|" + sep
            : "{ /* for-of */ |" + initialiser_arg + ", tstosc__drop_arg|" + sep
        )
        + (loopvar_pattern_solving != "" ? loopvar_pattern_solving.indent(1) + sep : "")
        + body.indent(is_multi_line_body ? 1 : 0) + sep
        + "}"
}

/**
 * 
 * ### Generate Context Relationship
 * 
 * * `statement_label`: Delegate to `convertControlFlowBody`, if there is a label.
 */
export function convertTSForInStatementToSC(
    s: ts.ForInStatement,
    generator_context: GeneratorContext = default_generator_context
)
{
    return convertTSForInOrForOfStatement__Impl(s, "for-in", generator_context)
}

/**
 * 
 * ### Generate Context Relationship
 * 
 * * `statement_label`: Delegate to `convertControlFlowBody`, if there is a label.
 */
export function convertTSForOfStatementToSC(
    s: ts.ForOfStatement,
    generator_context: GeneratorContext = default_generator_context
)
{
    return convertTSForInOrForOfStatement__Impl(s, "for-of", generator_context)
}

/**
 * Continue-statement-including block, will be wrapped by SuperCollider's `block`,
 *  in order to simulate this syntax.
 */
export function translateTSContinueStatementToSC(
    s: ts.ContinueStatement,
    generator_context: GeneratorContext = default_generator_context
)
{
    return "/* continue */ "
        + (s.label != undefined ? `tstosc__label__${s.label.text}` : "loop_end")
        + ".value(false) ;"
}

export function translateTSBreakStatementToSC(
    s: ts.BreakStatement,
    generator_context: GeneratorContext = default_generator_context
)
{
    const break_means = s.label == undefined
        ? generator_context.break_means
        : "end_label"

    switch (break_means)
    {
        // But if the `break` comes with a label, that means breaking
        case "end_label":
        case "stop_a_loop":
            return "/* break */ "
                + (s.label != undefined ? `tstosc__label__${s.label.text}` : "loop_end")
                + ".value(true) ;"

        // A early break of a switch's case.
        case "end_switch_case":
            return "/* break */ tstosc__switch_break.value(nil) ;"

        case "nothing": throw TypeError("`break` here is not associated with switch/loop.")
    }
}

/**
 * May refer to `return_with` defined outside.
 */
export function translateTSReturnStatementToSC(
    s: ts.ReturnStatement,
    generator_context: GeneratorContext = default_generator_context
)
{
    const return_expr = s.expression != undefined
        ? convertTSExpressionToSC(s.expression, generator_context.atValuePosition())
        : "nil /* no-expr return */"

    if (generator_context.is_generating_method)
    {
        return "^" + return_expr
    }
    else
    {
        return (generator_context.with_early_return
            ? `return_with.value(${return_expr})`
            : return_expr)
            + " ;"
    }
}

type CaseClausePack = ({
    c: ts.SwitchStatement["caseBlock"]["clauses"][number]
    /* Check if there is a `break` statement that ends case earlier. */
    has_early_break: boolean
    has_trailing_break: boolean
    is_fallthrough: boolean
    is_case_clause: boolean
    condition_value: string
    fallthrough_jump_value: null | string
})[]

/**
 * 
 * ### Generate Context Relationship
 * 
 * * `statement_label`: Handled and wrapped here, if there is a label.
 */
export function convertTSSwitchStatementToSC(
    s: ts.SwitchStatement,
    generator_context: GeneratorContext = default_generator_context
)
{
    const { statement_label } = generator_context
    const generator_context_new = generator_context.makeBreakMeans("end_switch_case").clearedStatementLabel()
    // First, go through each case-clause, to find if there are special needs to be handled.
    const case_clause_pack: CaseClausePack = s.caseBlock.clauses.map(
        function (c)
        {
            const break_stmt_index = c.statements.findIndex(s =>
                // TODO: still problematic.
                ts.isBreakStatement(s)
                || s.forEachChild(
                    function findEarlyBreak(n): boolean
                    {
                        if (ts.isBreakStatement(s)) { return true }
                        else { return n.forEachChild(findEarlyBreak) ?? false }
                    }
                )
            )
            const has_early_break = break_stmt_index >= 0 && break_stmt_index < c.statements.length - 1
            const is_case_clause = ts.isCaseClause(c)
            const last_stmt = c.statements.at(-1)
            const has_trailing_break = last_stmt != undefined && ts.isBreakStatement(last_stmt) && last_stmt.label == undefined
            const is_fallthrough = is_case_clause && !has_early_break && !has_trailing_break && c.statements.length == 0

            return ({
                c,
                /* Check if there is a `break` statement that ends case earlier. */
                has_early_break,
                has_trailing_break,
                is_fallthrough,
                is_case_clause,
                condition_value: is_case_clause
                    ? convertTSExpressionToSC(c.expression, generator_context_new)
                    : "/* otherwise */ 0/0", // Since `NaN` does not equal to itself. Useful for fallthrough to `default`.
                fallthrough_jump_value: null
            }) as CaseClausePack[number]
        }
    ).reduceRight(
        function (accu, curr)
        {
            if (curr.is_case_clause && curr.is_fallthrough)
            {
                const prev = accu.at(-1)
                curr.fallthrough_jump_value = prev == undefined
                    // Without `default` case.
                    ? curr.condition_value
                    // Is previous a fallthough ? If not, take its value as jump-value.
                    : prev.is_fallthrough ? prev.fallthrough_jump_value : prev.condition_value
            }

            accu.push(curr)
            return accu
        },
        [] as CaseClausePack
    ).reverse()

    function convertCase(
        {
            c, has_early_break, has_trailing_break, is_case_clause, condition_value,
            is_fallthrough, fallthrough_jump_value
        }: CaseClausePack[number],
        index: number,
        clauses_pack_array: CaseClausePack
    )
    {
        // const is_case_clause = ts.isCaseClause(c)
        const hint = is_case_clause ? "/* case */ " : "/* otherwise */ "
        const cond = is_case_clause
            ? "{ " + condition_value + " },"
            : ""

        const body_raw = is_fallthrough
            // `default` also go to here
            ? `{ /* fallthough */ thisFunction.value(${fallthrough_jump_value}); }`
            : convertControlFlowBody(has_trailing_break ? c.statements.slice(0, -1) : c.statements, generator_context_new)
        const body = has_early_break
            ? `{ block { |tstosc__switch_break|\n${body_raw.replace(/^{\s|\s}$/g, "")}\n} }`
            : body_raw
        const sep = body.includes("\n") ? "\n" : " "

        return (hint + cond + sep + body).indent(1)
    }

    const value_to_test = convertTSExpressionToSC(s.expression, generator_context_new)
    const converted_clauses = case_clause_pack.map((c, index, arr) => convertCase(c, index, arr)).join(",\n")
    let result = ""

    // Wrap if there is any fallthrough.
    if (case_clause_pack.some(p => p.is_fallthrough))
    {
        result = `{ |tstosc__test_value| /* switch(${value_to_test}) */\n`
            + ("switch( tstosc__test_value,\n"
                + converted_clauses
                + "\n) ;").indent(1)
            + `\n}.value(${value_to_test}) ;`
    }
    else
    {
        result = "switch( " + value_to_test + ",\n"
            + converted_clauses
            + "\n) ;"
    }

    // Wrap for possible label.
    result = wrapIfLabelExist(result, statement_label)

    return result
}

function wrapIfLabelExist(converted: string, label?: string)
{
    if (label == "" || label == undefined) { return converted }
    else
    {
        return `block { |tstosc__label__${label}|\n${converted.indent(1)}\n} ;`
    }
}

export function convertTSThrowStatementToSC(
    s: ts.ThrowStatement,
    generator_context: GeneratorContext = default_generator_context
)
{
    // First, check the types of expression that is being thrown.
    const expr_type = getTypeOfTSNode(generator_context.compiler_program, s.expression)

    if ((expr_type.getBaseTypes()?.map(t => t.symbol.name).includes("Error") ?? false)
        || expr_type.symbol.name == "Error")
    {
        return `${convertTSExpressionToSC(s.expression, generator_context)}.throw() ;`
    }
    else
    {
        return `Error(${convertTSExpressionToSC(s.expression, generator_context)}).throw() ;`
    }
}

/**
 * 
 * ### Generate Context Relationship
 * 
 * * `statement_label`: Handled and wrapped here, if there is a label.
 */
export function convertTSTryStatementToSC(
    s: ts.TryStatement,
    generator_context: GeneratorContext = default_generator_context
)
{
    const { statement_label } = generator_context
    const generator_context_new = generator_context.clearedStatementLabel()

    const try_block = convertControlFlowBody(s.tryBlock, generator_context_new)
    const has_catch_block = s.catchClause != undefined
    const has_catch_var = s.catchClause?.variableDeclaration != undefined
    const is_catch_var_identifier = has_catch_var && ts.isIdentifier(s.catchClause.variableDeclaration.name)
    const catch_block_raw = has_catch_block ? convertControlFlowBody(s.catchClause.block, generator_context_new) : ""
    const catch_var = has_catch_block && has_catch_var
        ? is_catch_var_identifier
            ? escapeForSCVarIfNeeded(s.catchClause.variableDeclaration.name.text)
            : "tstosc__catchvar"
        : ""
    const catch_var_solving_part = has_catch_block && has_catch_var && !is_catch_var_identifier
        ? "\n" + getDefDeclOutput("catchvar", solveRecurBinding(
            s.catchClause.variableDeclaration.name,
            ({
                ...ts.factory.createIdentifier("tstosc__catchvar"),
                kind: ts.SyntaxKind.Identifier, text: "tstosc__catchvar",
                forEachChild: () => undefined
            })), generator_context_new)
        : ""
    const catch_block = has_catch_block
        ? catch_block_raw.replace(/^{/g, `{ |${catch_var}|${catch_var_solving_part}`)
        : ""

    let result = "try" + (try_block.includes("\n") ? "\n" : " ")
        + try_block + "\n/* catch */" + (catch_block.includes("\n") ? "\n" : " ")
        + (has_catch_block ? catch_block : " { }")

    if (s.finallyBlock != undefined)
    {
        const finally_block = convertTSCodeBlockToSC(s.finallyBlock, generator_context_new)
        result = "protect\n{"
            + result.indent(1)
            + "}\n/* finally */\n{"
            + finally_block.indent(1)
            + "} ;"
    }

    // Wrap if label exists.
    result = wrapIfLabelExist(result, statement_label)

    return result
}