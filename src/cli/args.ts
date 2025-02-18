import { isValidPath } from "../util/path"
import { error, warn } from "./console"
import { getDefaultUserExtensionDir } from "../util/sc"
import path from "path"
import fs from "fs"

/**
 * When encounter these args, stop parsing remaining, and use it as the intention of user.
 */
export const priority_of_stop_early_global_option = [
    "help", "h",
    "version", "v"
] as const

export const non_arg_accepting_global_option = [
    ...priority_of_stop_early_global_option,
    "yes-to-all", "y"
] as const

/**
 * The argument shape parsed by `minimist`.
 */
export type CLIGlobalArgs = CLIGlobalEarlyStopArgs & {
    /** No arg parsed here. */
    "_": string[]
    /** The output dir of the files. If not specified, `cwd`. */
    "d"?: string
    /** The output dir of the files. If not specified, `cwd`. */
    "out-dir"?: string,
    /** Do not keep directory structure, put all files in `out-dir`; by default, false. */
    "flatten"?: true
    /** The path for storing class file, should be the path in `Platform.userExtensionDir` in SuperCollider. */
    "u"?: string
    /** The path for storing class file, should be the path in `Platform.userExtensionDir` in SuperCollider. */
    "user-extension-dir"?: string
    /** Project name, used to differentiate from other folders in `user-extension-dir`. By default `tstosc`. */
    "p"?: string
    /** Project name, used to differentiate from other folders in `user-extension-dir`. By default `tstosc`. */
    "project-name"?: string,
    /** Whether ignore all warning (with type "y" to proceed) produced by `tstosc`. */
    "y"?: true
    /** Whether ignore all warning (with type "y" to proceed) produced by `tstosc`. */
    "yes-to-all"?: true
}

export type CLIGlobalEarlyStopArgs = {
    /** Whether user asked for quick helping doc. */
    "h"?: string
    /** Whether user asked for quick helping doc. */
    "help"?: string
    /** Show the version of current used `tstosc`. */
    "v"?: true
    /** Show the version of current used `tstosc`. */
    "version"?: true
}

export type CLIPositionalArgs = {
    /** File going to be transpiled by `tstosc`. */
    "_": string
    "o"?: string
    "out"?: string
    "d"?: string
    "out-dir"?: string
}

/**
 * Pre-process the argument, cut it into these groups:
 * * Global argument (`return[0]`)
 * * Files to process (`return[1]` and more, if exist).
 * 
 * @returns Groups of argument
 */
export function seperateArgs(origin_arg: string[]): [string[], string[][]]
{
    if (origin_arg.length == 0) { return [[], []] }

    // TODO: global args can also accept non-option args.
    let result: (string[])[] = []
    let group = []
    let should_detect_file_arg = false

    // Cut at each non-optional arg.
    for (let current_index = 0; current_index < origin_arg.length; current_index++)
    {
        const current_element = origin_arg[current_index]
        const is_current_element_file_arg = !current_element.startsWith("-")

        // If should detect non-option, and current is non-option, group previous result, start new grouping.
        if (should_detect_file_arg && is_current_element_file_arg)
        {
            result.push(group)
            group = []
        }

        group.push(current_element)

        // Current element is file-alike (non-option), set `detect` true.
        // Current element is option, then check if `non_arg_accepting_global_option` contains this arg.
        // * Is Non accepting: set `detect` true.
        // * Is Accepting arg: the following might be a description to this option, set `detect` false.
        should_detect_file_arg = is_current_element_file_arg || non_arg_accepting_global_option.includes(
            current_element.replace(/^--?/, "") as (typeof non_arg_accepting_global_option)[number]
        )
    }
    // Do not forget to push the remaining group into result.
    result.push(group)

    // If there exists no global arg:
    if (!(result[0][0] ?? "").startsWith("-")) { return [[], result] }
    // Or there is:
    else { return [result[0], result.slice(1)] }
}


export type UserIntention =
    | UserTranspileIntention
    | UserQueryIntention
    | UserNoIntetion
    | UserIntentionUnknownOrError

export type UserTranspileIntention = {
    type: "transpile"
    global: {
        /**
         * The global (fallback) setting for directory of the output file (in absolute path).
         * If not specified, will be current work directory. 
         */
        output_dir: string
        /**
         * Should be the path of `Platform.userExtensionDir` in SuperCollider.
         */
        user_extension_dir: string
        /**
         * The sub-folder name under `Platform.userExtensionDir` in SuperCollider,
         *  used to differentiate with others.
         * By default, `tstosc`.
         */
        project_name: string
        /**
         * Ignoring all warning and answer "y" to proceed.
         */
        yes_to_all: boolean,
        /**
         * Flatten the files to global output dir.
         */
        flatten: boolean
    }
    files: ({
        /**
         * The received path to the input file, might be absolute or relative depending on user input.
         */
        input_path: string
        /**
         * The name of the output file.
         * If not specified at positional args, then the input file's name with `scd` extension.
         */
        output_name: string
        /**
         * The directory of the output file (in absolute path).
         * If not specified at positional args, then the directory set by global option.
         * If global is also not set, use current work directory. 
         */
        output_dir: string
    })[]
}

export type UserQueryIntention = {
    /** User does not want to transpile (using only global arg). */
    type: "query_info"
} & ({
    command: "help",
    arg: string
} | {
    command: "version",
    arg: true
})

export type UserNoIntetion = {
    type: "no_intention"
}

export type UserIntentionUnknownOrError = {
    type: "unknown_or_error",
    hint?: string
}

export function parseArgs(global_arg: CLIGlobalArgs, positional_args: CLIPositionalArgs[]): UserIntention
{
    // console.log("Global args:", global_arg, "\nPositional:")
    // console.log(positional_args)

    // First, handle that user does not want to transpile anything.
    const global_arg_key = Object.keys(global_arg)
    // If global var contains stop-early args ("query_info").
    {
        const early_stop_index = priority_of_stop_early_global_option.findIndex(a => global_arg_key.includes(a))
        if (early_stop_index >= 0)
        {
            const command = priority_of_stop_early_global_option[early_stop_index]
            return ({
                type: "query_info",
                command, arg: (global_arg as CLIGlobalEarlyStopArgs)[command]!
            }) as UserQueryIntention
        }
    }
    // If not "query_info" and user does not pass file to transpile.
    if (global_arg_key.length <= 1 && positional_args.length == 0) { return ({ type: "no_intention" }) }

    // Second, handle that user want to transpile.
    // Check if empty detail passed to args:
    {
        for (const arg of (["out-dir", "user-extension-dir", "project-name"] satisfies (keyof CLIGlobalArgs)[]))
        {
            if (global_arg[arg] != undefined && global_arg[arg].length == 0)
            {
                return ({ type: "unknown_or_error", hint: error(`Error: Please specify a path for "${arg}".`) })
            }
        }
    }

    const global__output_dir = path.resolve(global_arg["out-dir"] ?? process.cwd())
    if (!isValidPath(global__output_dir))
    {
        return ({
            type: "unknown_or_error", hint: error(
                `Error: Global option "--out-dir" ("-d") is not valid path: "${global__output_dir}".`
            )
        })
    }
    const global__user_extension_dir = path.resolve(global_arg["user-extension-dir"] ?? getDefaultUserExtensionDir())
    if (!isValidPath(global__user_extension_dir))
    {
        return ({
            type: "unknown_or_error", hint: error(
                `Error: Global option "--user-extension-dir" ("-u") is not valid path: "${global__user_extension_dir}".`
            )
        })
    }
    const global__project_name = global_arg["project-name"] ?? "user_project"
    // Check if inputted file not exist:
    {
        const non_exist_files = positional_args.filter(a => !fs.existsSync(a["_"]))
        if (non_exist_files.length > 0)
        {
            return ({
                type: "unknown_or_error",
                hint: error(`Error: Input file not exist: "${non_exist_files.map(f => f["_"]).join(", ")}".`)
            })
        }
    }
    let result: UserTranspileIntention = ({
        type: "transpile",
        global: {
            output_dir: global__output_dir,
            user_extension_dir: global__user_extension_dir,
            project_name: global__project_name,
            yes_to_all: global_arg["yes-to-all"] ?? false,
            flatten: global_arg["flatten"] ?? false
        },
        files: positional_args.map(
            a =>
            {
                const input_path = a["_"]
                return ({
                    input_path,
                    output_name: a["out"] ?? `${path.basename(a["_"], ".ts")}.scd`,
                    output_dir: global_arg["flatten"]
                        ? path.resolve(a["out-dir"] ?? global__output_dir)
                        : path.resolve(a["out-dir"]
                            ?? path.join(global__output_dir, path.relative(process.cwd(), path.dirname(input_path)))
                        )
                }) satisfies UserTranspileIntention["files"][number]
            }
        )
    })
    if (result.files.length == 0)
    {
        return ({
            type: "unknown_or_error", hint: warn("Warn: No files are specified to be transpiled.")
        })
    }

    return result
}