import ts from "typescript"
import { writeFileSync } from "fs"
import path, { join as joinPath } from "path"
import { convertTSSourceFileToSC, convertTSSourceFileToSC_Option, default_convert_file_option } from "./ts_to_sc_convert/file_conv"
import { default_generator_context, default_transpiler_option, GeneratorContext, TranspilerOption } from "./context"
import { SourceFileNotFoundError } from "../../util/error"
import { Result } from "../../util/Result"

export class Generator
{
    private program: ts.Program
    private context: GeneratorContext

    constructor({
        compiler_program, context = default_generator_context, transpiler_option = default_transpiler_option
    }: Generator_Args)
    {
        this.program = compiler_program
        this.context = { ...context, compiler_program, transpiler_option }
    }

    /**
     * Generate the SCLang result of inputted files.
     * 
     * For now, all the files recorded in compiler program's `root_files_path` (`rootNames`)
     *  will be generated.
     * 
     * @param output_path By default, current work directory.
     */
    public generateAll(output_path: string = "."): Result<null, Error>
    {
        let outputed_file_name_index_dict = new Map<string, number>()

        for (const f_name of this.program.getRootFileNames())
        {
            let output_index = outputed_file_name_index_dict.get(f_name) ?? -1
            const output_full_path = joinPath(
                output_path,
                output_index >= 0 ? `${f_name}_${++output_index}` : f_name
            ).replace(/\.ts$/g, ".scd")

            const result = this.generateFile({
                name: f_name, output_path: output_full_path
            })
            if (result.isErr()) { return result }

            outputed_file_name_index_dict.set(f_name, output_index)
        }

        return Result.createOk(null)
    }

    /**
     * 
     * @throws `SourceFileNotFoundError` if the `name` cannot be used to get source file.
     */
    public generateFile({
        name,
        output_path = path.join(path.dirname(name), path.basename(name).replace(/\.ts$/g, ".scd")),
        convertTSSourceFileToSC_option = default_convert_file_option
    }: Generator_generateFile_Args): Result<null, Error>
    {
        const source_file = this.program.getSourceFile(name)
        if (source_file == undefined) { return Result.createErr(SourceFileNotFoundError.forFile(name)) }

        const converted = convertTSSourceFileToSC(source_file, this.context, convertTSSourceFileToSC_option)
        if (converted.isOk())
        {
            writeFileSync(output_path, converted.unwrapOk().file)
            return Result.createOk(null)
        }
        else
        {
            return Result.fromErr(converted)
        }
    }

    public getContext() { return { ...this.context } }
}

type Generator_Args = {
    compiler_program: ts.Program
    context?: GeneratorContext
    transpiler_option?: TranspilerOption
}

export type FileToWrite = {
    path: string
    content: string
}

type Generator_generateFile_Args = {
    /** The name (a path to file want to be transpiled) that passed to `rootNames` when creating `ts.Program`. */
    name: string
    /**
     * The path of the generated output file.
     * If omitted, will be a path to a `.scd` file with same name in same directory.
     */
    output_path?: string
    convertTSSourceFileToSC_option?: Partial<convertTSSourceFileToSC_Option>
}