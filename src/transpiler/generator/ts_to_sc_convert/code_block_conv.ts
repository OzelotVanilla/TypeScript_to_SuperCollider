import ts from "typescript";
import { generateVarConstDeclarationAndDefinition } from "../name_decl_def_hoist";
import { convertTSStatementToSC } from "./stmt_conv";
import { default_generator_context, GeneratorContext } from "../context";

/**
 * ### Generate Context Relationship
 * 
 * * `statement_label`: Handled and wrapped here, if there is a label.
 * * `is_generating_constructor`: Whether add trailing `^tstosc__built_instance` for constructor.
 * 
 * ### Warning
 * 
 * This function does **not** add wrapping-brace.
 * 
 * @param block A code block that could be part of function, or just a stand-alone scope.
 */
export function convertTSCodeBlockToSC(
    block: ts.BlockLike,
    generator_context: GeneratorContext = default_generator_context
)
{
    const { indent_level, is_standalone_statement, statement_label } = generator_context
    const generator_context_new = generator_context.clearedStatementLabel()
    // Put all variable declaration before statements.
    const name_decl_def_hoist = generateVarConstDeclarationAndDefinition(
        block, generator_context_new
    ).indent(is_standalone_statement ? indent_level : 0)
    const sep = name_decl_def_hoist.length > 0 ? "\n" : ""
    const stmts_without_decl_def = block.statements.filter(
        s => !(ts.isDeclarationStatement(s))
    )

    // Check if this block is for things like function (excluding method, because SCLang method has `^`), and have a early-return.
    const is_early_return = generator_context_new.with_early_return
        || (!generator_context_new.is_generating_method && hasEarlyReturnIn(block.statements))
    const stmts_in_sc = [
        ...stmts_without_decl_def.map(
            s => convertTSStatementToSC(s, generator_context_new.withEarlyReturn(is_early_return))
        )
    ].filter(s => s.trim().length > 0).join("\n")

    let result = `${name_decl_def_hoist}${sep}${stmts_in_sc}`

    // Wrap if there is label.
    if (statement_label != "") { result = `block { |tstosc__label__${statement_label}|\n${result.indent(1)}\n} ;` }

    return result
}

/**
 * ### Warning
 * 
 * As a compiler, this function will even consider **dead-code-causing** single `return` as early-return.
 * 
 * ### Description
 * 
 * Check if giving statements contains a early-return such as:
 * ```ts
 * function f()
 * {
 *     if (some_cond) { return 1 } // <--- Like this.
 * 
 *     if (some_other_cond_0) { doSomething() } 
 *     else if (some_other_cond_1) { return 2 } // <--- Also this.
 *     else
 *     {
 *         if (some_other_cond_3) { return 3 }  // <--- And this.
 *     }                        
 * 
 *     doSomething()
 *     return 0
 * }
 * ```
 * 
 * ### Logic:
 * 
 * 1. Go through the statements and find out if there is flow-control statement.
 *  * If so, recursively check if there is a return statement inside `then` and `else` part.
 *  * If not, then no early-return found.
 * 
 * @param at_outest_level If the statement checking is at the outest level of function.
 *  This will affect the final logic on checking if it is a early-return:
 *  * If outest level, the `return` should not be the last statement.
 *  * If already checking the last statement, the nested block's `return` is not early return.
 */
export function hasEarlyReturnIn(stmts: ReadonlyArray<ts.Statement>, at_outest_level: boolean = true): boolean
{
    function hasEarlyReturnInBlockOrOfStatement(s: ts.Block | ts.Statement, at_outest_level: boolean = true)
    {
        return ts.isBlock(s)
            ? hasEarlyReturnIn(s.statements, at_outest_level)
            : ts.isReturnStatement(s)
    }

    const early_return_alike__index = stmts.findIndex(
        (s, index) =>
            // If is flow-control, need to check all types of them:
            // `if` statement.
            (ts.isIfStatement(s) && (
                // If `then` part only contains one return statement, or a block.
                hasEarlyReturnInBlockOrOfStatement(s.thenStatement, index == stmts.length - 1)
                // Also take a look at `else` part, which might be `undefined`.
                || (s.elseStatement != undefined
                    && hasEarlyReturnInBlockOrOfStatement(s.elseStatement, index == stmts.length - 1)
                )
            ))
            // `for` and `while` statement.
            || (
                (ts.isForStatement(s) || ts.isWhileStatement(s))
                && hasEarlyReturnInBlockOrOfStatement(s.statement, index == stmts.length - 1)
            )
            // `switch` statement
            || (
                ts.isSwitchStatement(s)
                && s.caseBlock.clauses.some(c => c.statements.some(n => ts.isReturnStatement(n)))
            )
            // `try` statement
            || (
                ts.isTryStatement(s)
                && (
                    hasEarlyReturnIn(s.tryBlock.statements, index == stmts.length - 1)
                    || (s.catchClause != undefined
                        && hasEarlyReturnIn(s.catchClause.block.statements, index == stmts.length - 1))
                    || (s.finallyBlock != undefined
                        && hasEarlyReturnIn(s.finallyBlock.statements, index == stmts.length - 1))
                )
            )
            // If is a single statement, just check if it is `return` or not.
            || ts.isReturnStatement(s)
    )

    return at_outest_level
        // Check if that statement is in the middle of a function; if so, then `stmts` has early-return.
        ? early_return_alike__index >= 0 && early_return_alike__index < stmts.length - 1
        // If the statement being checked is nested in the function, it must be a early-return.
        : early_return_alike__index >= 0
}

/**
 * ### Warning
 * 
 * This function assume that all nested statements are wrapped in outer `block`,
 *  and their `return x` are also converted to `return_with.value(x)`.
 * 
 * ### Description
 * 
 * Convert TypeScript's `if` statement to the form like this:
 * ```ts
 * function f()
 * {
 *     if (some_cond) { return 1 } // <--- Like this.
 * 
 *     if (some_other_cond_0) { doSomething() } 
 *     else if (some_other_cond_1) { return 2 } // <--- Also this.
 *     else
 *     {
 *         if (some_other_cond_3) { return 3 }  // <--- And this.
 *     }                        
 * 
 *     doSomething()
 *     return 0
 * }
 * ```
 * 
 * to:
 * 
 * ```sclang
 * var f = {
 *     block { |return_with|
 *         var some_cond=true, some_other_cond_0=false, some_other_cond_1=false, some_other_cond_3=false;
 *         if(some_cond,
 *             { return_with.value(1) },
 *             { }
 *         );
 * 
 *         if(some_other_cond_0,
 *             { doSomething(); },
 *             {
 *                  if (some_other_cond_1,
 *                      { return_with.value(2) },
 *                      { if(some_other_cond_3, { return_with.value(3) }, { }); }
 *                  );
 *             }
 *         );
 * 
 *         doSomething();
 *         return_with.value(0)
 *     }
 * }
 * ```
 * 
 * ### Generate Context Relationship
 * 
 * * `indent_level`:
 *   By default, each statement handle the indentation.
 *   As an exception here, since the return value contains
 */
export function convertTSCodeBlockWithEarlyReturnToSC(
    stmts: ReadonlyArray<ts.Statement>,
    generator_context: GeneratorContext = default_generator_context
): string
{
    return "block { |return_with|\n".indent(generator_context.indent_level)
        + stmts.map(
            s => convertTSStatementToSC(s, generator_context.indent().isStandalongStatement().withEarlyReturn())
        ).filter(s => s.length > 0).join(" ;\n") + "\n"
        + "} ;".indent(generator_context.indent_level)
}

export function isTSFlowControlStatement(stmt: ts.Statement)
{
    return ts.isIfStatement(stmt)
        || ts.isSwitchStatement(stmt)
        || ts.isIterationStatement(stmt, true)
        || ts.isTryStatement(stmt)
}