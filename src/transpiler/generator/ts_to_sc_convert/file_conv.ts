import ts from "typescript";
import { default_generator_context, ExceptionalSyntax, GeneratorContext } from "../context";
import { convertTSStatementToSC } from "./stmt_conv";
import { generateVarConstDeclarationAndDefinition, solveRecurBinding } from "../name_decl_def_hoist";
import { isSelfIndecrExpression } from "./expr_conv";
import { memorised } from "../../../util/util";
import { Result } from "../../../util/Result";
import { convertTSClassToSCWithClassName } from "./class_conv";

type FileConversionResult = {
    /** The source file's result, without class.  */
    file: string,
    /** The converted class from the source file. */
    class: string
}

export type convertTSSourceFileToSC_Option = {
    convert_file: boolean
    convert_class: boolean
}

export const default_convert_file_option: convertTSSourceFileToSC_Option = {
    convert_file: true,
    convert_class: true,
}

/**
 * ### Warning
 * 
 * This will also convert class extracted from this file.
 * Unless set `option_from_user.convert_class` to `false`.
 */
export function convertTSSourceFileToSC(
    source_file: ts.SourceFile,
    generator_context: GeneratorContext = default_generator_context,
    option_from_user: Partial<convertTSSourceFileToSC_Option> = default_convert_file_option
): Result<FileConversionResult, Error>
{
    const option = { ...default_convert_file_option, ...option_from_user }

    // Check if there is some additional preprocessing work.
    const preprocessing_pack = findPreprocessingNeededByCached(source_file)
    generator_context = { ...generator_context, ...preprocessing_pack.exceptional_syntax }

    // Source file's statement must be stand-alone.
    generator_context.is_standalone_statement = true

    let result: FileConversionResult = { file: "", class: "" };
    try
    {
        if (option.convert_file)
        {
            // Get all definition of name, and do hoisting.
            const def_decl_stmts = generateVarConstDeclarationAndDefinition(source_file)
            result.file = def_decl_stmts
                + (def_decl_stmts.length > 0 ? "\n" : "")
                // The `generateHelperEnvironment` generate necessary "\n" at end.
                + generateHelperEnvironment(preprocessing_pack.exceptional_syntax, generator_context)
                + source_file.statements
                    .map(s => convertTSStatementToSC(s, generator_context))
                    .filter(s => s.length > 0) // Notice that variable statement will be converted to `""` here.
                    .join("\n")
        }

        if (option.convert_class)
        {
            result.class = preprocessing_pack.class_definitions.map(
                ({ name, definition }) => convertTSClassToSCWithClassName(definition, name, generator_context)
            ).join("\n\n")
        }
    }
    catch (err)
    {
        return Result.createErr(err as Error)
    }

    return Result.createOk(result)
}

/**
 * A cached version of `findPreprocessingNeeded`.
 */
export const findPreprocessingNeededByCached = memorised(
    findPreprocessingNeeded,
    function makeKey(source_file) { return source_file.fileName }
)

/**
 * Search a file and return any option/task that needed pre-processing.
 */
export function findPreprocessingNeeded(source_file: ts.SourceFile): PreprocessingPack
{
    let exceptional_syntax: ExceptionalSyntax = {
        has_unhandled_self_indecr_operator: false
    }
    let class_definitions: PreprocessingPack["class_definitions"] = []

    function traverse(node: ts.Node)
    {
        let traverse_all_child = true
        // For `has_self_indecr_operator`.
        if ((!exceptional_syntax.has_unhandled_self_indecr_operator) && isSelfIndecrExpression(node))
        {
            exceptional_syntax.has_unhandled_self_indecr_operator = true
        }
        else if (ts.isClassDeclaration(node))
        {
            // If it is standalone class-declaration, simply push it into result.
            // TODO: handle if class name repeated.
            class_definitions.push({
                name: escapeToSCClassName(node.name?.text
                    ?? `${source_file.fileName.replace(/^[\.\/]|\.ts$/, "")}__default_export`),
                definition: node
            })
        }
        else if (ts.isClassExpression(node))
        {
            // If it is a class-expression, that is related to variable-binding,
            //  and need to solve which symbol is assigned.
            // First, get its `VariableDeclaration` parent.
            function getVariableDeclarationParent(n: ts.Node)
            {
                if (ts.isVariableDeclaration(n)) { return n }
                else { return getVariableDeclarationParent(n.parent) }
            }
            const { name: pattern, initializer: initialiser } = getVariableDeclarationParent(node)
            const def_decl_collection = solveRecurBinding(pattern, initialiser!)
            class_definitions.push(...def_decl_collection
                .filter((d): d is [string, ts.ClassExpression] => d[1] != undefined && ts.isClassExpression(d[1]))
                .map(([name, definition]) => ({ name, definition }))
            )
        }

        if (traverse_all_child) { node.forEachChild(traverse) }
    }
    traverse(source_file)

    return ({ exceptional_syntax, class_definitions })
}

export type PreprocessingPack = {
    /** Flags that used in generation. Needed by `generateHelperEnvironment`. */
    exceptional_syntax: ExceptionalSyntax
    /** Any definition of class that are written to SuperCollider's user extension file. */
    class_definitions: ({
        /** The actual name that refer to the class. */
        name: string,
        /** The difinition body of class */
        definition: ts.ClassLikeDeclaration
    })[]
}

/** Please ensure that `name` is not empty. */
function escapeToSCClassName(name: string)
{
    if (name.length == 0) { throw TypeError(`The class name to escape is empty.`) }
    name = name.replace(/[^\w]/g, "_")
    return name[0].toUpperCase() + name.slice(1)
}

/**
 * Generate global helper functions like `~tstosc__pre_incr`.
 */
function generateHelperEnvironment(
    exceptional_syntax: ExceptionalSyntax,
    generator_context: GeneratorContext
)
{
    let result = []

    if (exceptional_syntax.has_unhandled_self_indecr_operator)
    {
        result.push(...[
            "~tstosc__pre_incr = {|r|r.value=r.value+1;r.value} ;",
            "~tstosc__post_incr = {|r|var t=r.value;r.value=r.value+1;t} ;",
            "~tstosc__pre_decr = {|r|r.value=r.value-1;r.value} ;",
            "~tstosc__post_decr = {|r|var t=r.value;r.value=r.value-1;t} ;"
        ])
    }

    return result.length > 0
        ? "/* Helper Environment */\n" + result.join("\n") + "\n\n"
        : ""
}