#!/usr/bin/env node

/**
 * This file is for the command line tools.
 * It should be a script file and not exporting anything.
 */

import "../prelude.js"
import minimist from "minimist"
import { CLIGlobalArgs, CLIPositionalArgs, seperateArgs, parseArgs } from "./args"
import { version } from "../prelude"
import { showBriefHelp, showHelp } from "./help"
import { askToProceedOrAbort as askIfOkToProceed, dim, error, printError, success, warn } from "./console"
import path from "path"
import fs from "fs"
import { convertTSSourceFileToSC, findPreprocessingNeededByCached } from "../transpiler/generator/ts_to_sc_convert/file_conv"
import { generateTStoSCRuntimeEnvIfNecessary } from "../polyfill/polyfill_env_generate"
const [cli_global_argv, cli_positional_argvs] = seperateArgs(process.argv.slice(2))
const global_arg: CLIGlobalArgs = minimist(cli_global_argv, {
    alias: {
        "version": ["v"],
        "help": ["h"],
        "out-dir": ["d"],
        "flatten": [],
        "user-extension-dir": ["u"],
        "project-name": ["p"],
        "yes-to-all": ["y"]
    } satisfies { [key in keyof CLIGlobalArgs]?: (keyof CLIGlobalArgs)[] },
    string: [
        "help", "out-dir", "user-extension-dir", "project-name"
    ] satisfies (keyof CLIGlobalArgs)[]
});
const positional_args: CLIPositionalArgs[] = cli_positional_argvs.map(group => minimist(group, {
    alias: {
        "out-dir": ["d"],
        "out": ["o"]
    } satisfies { [key in keyof CLIPositionalArgs]?: (keyof CLIPositionalArgs)[] },
})).map(o => ({ ...o, "_": o["_"][0] ?? "" }))

/**
 * Main function of this script.
 * Called at the end of this script, with all error catched and printed.
 */
async function main()
{
    const parsed_intention = parseArgs(global_arg, positional_args)
    // console.log(parsed_intention)
    switch (parsed_intention.type)
    {
        case "transpile": {
            const { yes_to_all } = parsed_intention.global
            const { user_extension_dir, project_name } = parsed_intention.global
            /** `path.resolve(user_extension_dir, project_name)`. */
            // Generate helper class.
            const tstosc_helper_file_path = path.resolve(user_extension_dir, "tstosc__store")
            const project_extension_path = path.resolve(user_extension_dir, project_name)
            // Check if `tstosc_helper_class_path` is same as `project_extension_path`.
            if (tstosc_helper_file_path == project_extension_path)
            {
                console.log(error(
                    `Error: User Extension Dir cannot be set to "${tstosc_helper_file_path}".\n` +
                    `This is the directory for TStoSC to store its helper file (e.g., polyfill classes), but not for user's class.\n` +
                    `You may avoid this by setting another project name by global option "--project-name" ("-p").\n\n` +
                    `Aborted: Not OK to over-write files in User Extension Dir.`
                ))
                return
            }
            else { generateTStoSCRuntimeEnvIfNecessary(tstosc_helper_file_path) }
            // Check if OK to over-write User Extension Dir.
            {
                if (!yes_to_all && fs.existsSync(project_extension_path) && !askIfOkToProceed(warn(
                    `Warn: User Extension Dir "${project_extension_path}" already exists.\n` +
                    `You can set a project name by global option "--project-name" ("-p") `
                    + `to avoid unintended file lost.\n` +
                    `It is OK to clear-then-write to that dir ? (type "y" to proceed): `
                )))
                {
                    console.log(error(`Aborted: Not OK to over-write files in User Extension Dir.`))
                    return
                }
                console.log(`Hint: You can use "--yes-to-all" ("-y") option to answer all warnings with yes.`)
            }
            // Use dinamic import because `typescript` consumes too much time to import.
            const { Analyser, Generator } = await import("../transpiler/exports.js")
            const analyser = new Analyser(parsed_intention)
            const generator = new Generator({ compiler_program: analyser.getCompilerProgram() })

            // Generation of classes to User Extension Dir.
            if (fs.existsSync(project_extension_path)) { fs.rmSync(project_extension_path, { recursive: true }) }
            const compiler_program = analyser.getCompilerProgram()
            const class_conversion_packs = compiler_program.getRootFileNames().reduce(
                (result, file_name) =>
                {
                    const source_file = compiler_program.getSourceFile(file_name)!
                    const defs = findPreprocessingNeededByCached(source_file).class_definitions
                    if (defs.length > 0)
                    {
                        result.push({
                            file_name: source_file.fileName, file: source_file,
                            class_count: defs.length
                        })
                    }

                    return result
                },
                // Avoid to import `typescript` in the top of file, because that is slow.
                [] as ({
                    file_name: string, file: Parameters<(typeof convertTSSourceFileToSC)>[0],
                    class_count: number
                })[]
            )
            if (class_conversion_packs.length > 0)
            {
                console.log(success(`Generated classes: in "${project_extension_path}".`))
                const class_path = path.resolve(project_extension_path, "classes")
                fs.mkdirSync(class_path, { recursive: true })
                for (const p of class_conversion_packs)
                {
                    const to_write__file_base_name = path.relative(process.cwd(), p.file_name)
                        .replace(/\.ts$/, "")
                        .replace(/[^\w]/g, "_")
                        + ".sc"
                    const to_write__file_path = path.resolve(class_path, to_write__file_base_name)
                    const class_conv = convertTSSourceFileToSC(p.file, generator.getContext(), { convert_file: false })
                    if (class_conv.isErr())
                    {
                        console.log(error("Error when generating classes: ").indent(1))
                        printError(class_conv.unwrapErr(), 1)
                        console.log(error(`Fail to generate class in "${to_write__file_base_name}", see error above.`.indent(1)))
                    }
                    else
                    {
                        fs.writeFileSync(to_write__file_path, class_conv.unwrapOk().class)
                        console.log(success(`${p.class_count} class in "${to_write__file_base_name}".`.indent(1)))
                    }
                }
            }
            else { console.log(dim(success("No class generated."))) }

            // Transpilation of file.
            console.log(success(`Generated files:`)) // `parsed_intention.files` checked to not be empty.
            const generated_path = new Set<string>()
            for (const f of parsed_intention.files)
            {
                let output_path = path.join(f.output_dir, f.output_name)
                if (generated_path.has(output_path))
                {
                    // Need to generate a surrogate name.
                    output_path = path.join(
                        f.output_dir,
                        `${f.input_path.replace(/[^\w]/g, "_")}.scd`
                    )
                }
                const result = generator.generateFile({
                    name: f.input_path, output_path, convertTSSourceFileToSC_option: { convert_class: false }
                })
                if (result.isErr())
                {
                    console.log(error("Error when generating files: ").indent(1))
                    printError(result.unwrapErr(), 1)
                }
                else
                {
                    generated_path.add(output_path)
                    console.log(success(
                        `"${f.input_path}"\n---> "${path.relative(process.cwd(), output_path)}" ("${output_path}")`
                    ).indent(1))
                }
            }
        } break

        case "query_info": {
            switch (parsed_intention.command)
            {
                case "help": return showHelp(parsed_intention.arg)
                case "version": return showVersion()
            }
        } // break // Already breaked by `return`.

        case "no_intention": {
            showNameAndVersion()
            showBriefHelp()
        } break

        case "unknown_or_error": {
            if (parsed_intention.hint != undefined) { console.log(parsed_intention.hint) }
            return 1
        }

        default:
    }
}

function showNameAndVersion()
{
    console.log(
        "TStoSC" +
        ": Transpile TypeScript to SuperCollider's SCLang. " +
        "Version " + version + ".\n"
    )
}

function showVersion()
{
    console.log(`v${version}`)
}

main()