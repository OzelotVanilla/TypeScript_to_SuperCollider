import ts from "typescript"
import { Result } from "../../util/Result"
import { type UserTranspileIntention } from "../../cli/args"

/**
 * For read the TypeScript code, and turn it into AST.
 */
export class Analyser
{
    public static readonly default_compiler_option: ts.CompilerOptions = {
        noEmit: true,
        lib: ["lib.esnext.full.d.ts"], target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext,
        esModuleInterop: true, moduleResolution: ts.ModuleResolutionKind.Bundler,
    }

    private static readonly default_compiler_host: ts.CompilerHost = ts.createCompilerHost(
        Analyser.default_compiler_option,
        true // Not forget to let it set parent node.
    )

    public static readonly virtual_file_name = "virtual_file__do_not_really_exist.ts"

    public static readonly default_constructor_args: Analyser_Args = {
        root_files_path: []
    }

    private program: ts.Program

    constructor(args: Analyser_Args = Analyser.default_constructor_args)
    {
        const root_files_path = "root_files_path" in args
            ? args.root_files_path
            : args.files.map(f => f.input_path)

        this.program = ts.createProgram({
            rootNames: root_files_path,
            options: Analyser.default_compiler_option,
            host: Analyser.default_compiler_host
        })
    }

    /**
     * The most important feature of `Analyser`.
     * 
     * This function returns the configured `ts.Program` which handles all inputed files.
     */
    public getCompilerProgram()
    {
        return this.program
    }

    /**
     * Get the Abstract Syntax Tree (AST, with type `ts.SourceFile`) of a TypeScript file.
     * 
     * @param path If relative, the `.` stands for the working directory when `tstosc` starts.
     *  Be careful that the file you want to get AST from, must be **in** the `root_files_path`,
     *   or **being referenced** by the files in the `root_files_path`.
     */
    public getASTOfFile(file_path: string)
    {
        return this.program.getSourceFile(file_path)
    }

    public static buildASTFromCode(source_code: string): Result<ts.SourceFile, BuildASTFailError>
    {
        const ts_source_file = ts.createSourceFile(
            Analyser.virtual_file_name,
            source_code,
            ts.ScriptTarget.Latest,
            true, // From ChatGPT: Set to `true` to enable syntax tree preservation
        )

        // Check if the input file is a valid TypeScript file (that is, can be compiled).
        {
            const possible_errors = Analyser.preCheckErrorsBeforeBuildAST({ ts_source_file })
            if (possible_errors.length > 0)
            {
                return Result.createErr({
                    error_type: BuildASTFailErrorType.input_is_not_valid_ts,
                    details: possible_errors
                })
            }
        }

        // Try to build the AST. See if there is syntax that is unsupported.
        // this.traverseTSNode(ts_source_file, console.log)

        return Result.createOk(ts_source_file)
    }

    public static preCheckErrorsBeforeBuildAST({
        ts_source_file
    }: preCheckBeforeBuildAST_Params): TypeScriptError[]
    {
        const host: ts.CompilerHost = {
            ...Analyser.default_compiler_host,
            getSourceFile: (file_name, language_version) =>
            {
                // Because the virtual file does not really exist, need to return it manually.
                if (file_name == ts_source_file.fileName) { return ts_source_file; }
                // If not virtual file, use default solution.
                else { return Analyser.default_compiler_host.getSourceFile(file_name, language_version) }
            },
            getDefaultLibFileName: () => ts.getDefaultLibFileName(Analyser.default_compiler_option)
        }

        return ts.getPreEmitDiagnostics(
            ts.createProgram({ rootNames: [ts_source_file.fileName], options: Analyser.default_compiler_option, host })
        ).map(
            function (d): TypeScriptError
            {
                const error_message = ts.flattenDiagnosticMessageText(d.messageText, "\n")

                // This is for errors found in input file.
                if (d.file != undefined && d.start != undefined)
                {
                    const { line, character } = ts.getLineAndCharacterOfPosition(d.file, d.start)
                    return {
                        is_compiler_error: false,
                        position_line: line + 1, position_column: character + 1, message: error_message
                    }
                }
                // When these are `undefined`, global environment error is given.
                else 
                {
                    return { is_compiler_error: true, message: error_message }
                }
            }
        )
    }

    public checkIfExistsUnsupportSyntax()
    {
        // Check if the AST contains unsupported syntax.
    }

    public traverseTSNode(ts_node: ts.SourceFile | ts.Node, action: (n: ts.Node) => any)
    {
        action(ts_node)
        ts.forEachChild(ts_node, action)
    }
}

type Analyser_Args = {
    root_files_path: string[]
} | {
    global: UserTranspileIntention["global"]
    files: UserTranspileIntention["files"]
}

type preCheckBeforeBuildAST_Params = {
    ts_source_file: ts.SourceFile
}

export enum BuildASTFailErrorType
{
    input_is_not_valid_ts = "input_is_not_valid_ts",
    input_contains_unsupported_syntax = "input_contains_unsupported_syntax"
}

type BuildASTFailError = {
    error_type: BuildASTFailErrorType.input_is_not_valid_ts
    details: TypeScriptError[]
} | {
    error_type: BuildASTFailErrorType.input_contains_unsupported_syntax
}

type TypeScriptError = ({
    is_compiler_error: true
} | {
    is_compiler_error: false
    position_line: number
    position_column: number
}) & {
    message: string
}

/**
 * Use default option to get an AST from source code.
 */
export function getASTFromCode(source_code: string)
{
    return Analyser.buildASTFromCode(source_code)
}