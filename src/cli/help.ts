import ansis from "ansis"
import { bold, cmd, console_width, dim, error, fileArg, italic, param, wrapText } from "./console"
import { bifilter } from "../util/util"
const lang_flag = Intl.DateTimeFormat().resolvedOptions().locale

const space_number_between_option_and_brief = 2

/**
 * @param about Should be the full name of the argument, **not** abbrivation.
 */
export function showHelp(about: string = "")
{
    function getHelp()
    {
        switch (lang_flag.split(/[-_]/)[0])
        {
            case "en":
                return getEnHelpText(about)

            default:
                return getHelpTextDefaultLanguage(about)
        }
    }

    console.log(getHelp())
}

export function showBriefHelp()
{
    console.log(getBriefHelp())
}

function getBriefHelp()
{
    switch (lang_flag.split(/[-_]/)[0])
    {
        case "en":
            return getEnBriefHelpText()

        default:
            return getBriefHelpTextDefaultLanguage()
    }
}

const getHelpTextDefaultLanguage = getEnHelpText
const getBriefHelpTextDefaultLanguage = getEnBriefHelpText

type HelpTextDict = Map<string, {
    description: string
    brief?: string
    alias: string[]
    example?: string[]
    /** Whether current help is for the arg as a global option. */
    is_global: boolean
}>

function getEnFullHelpTextFrom(help_text_dict: HelpTextDict)
{
    const description_of_tstosc = "" +
        bold("What is `tstosc` ?") + "\n" +
        "A transpiler that translate TypeScipt to SuperCollider's builtin language \"SCLang\"." + "\n" +
        "\n"

    const caution_for_arg_order = "" +
        bold("Caution for Argument's Order") + "\n" +
        "`tstosc` has " + italic("global option") + " and " + italic("positional option") + ". "
        + "Global option comes after `tstosc`, and before the first file name/path argument. "
        + "Positional option comes after file name/path, and being effective only on it. "
        + "Here is the example on that:" + "\n" + [
            cmd("tstosc"), param("--global-option"), fileArg("a.ts"), param("--for-a-ts"),
            fileArg("b.ts"), param("--for-b-ts")
        ].join(" ") + "\n\n"

    const how_to_see_detail_of_option = "" +
        bold("For Detailed Help on Option") + "\n" +
        "Please run `" + [cmd("tstosc"), param("-h"), fileArg("option-to-search")].join(" ") + "`, "
        + "do not add dashes before the option that you want to search." + "\n\n"

    /** [Option, Brief] */
    const [option_and_brief__global, option_and_brief__positional] = bifilter([...help_text_dict.keys()].map(
        a =>
        {
            const info = help_text_dict.get(a)!
            return [
                param(`--${a}`) + dim(", ")
                + info.alias.map(a => param(a.length > 1 ? `--${a}` : `-${a}`)).join(", "),
                info.brief ?? info.description,
                info.is_global
            ] as [string, string, boolean]
        }
    ), /** Divide by whether `is_global` is true. */ e => e[2])

    const option_line_max_len = Math.max(
        Math.max(...[...option_and_brief__global, ...option_and_brief__positional].map(e => e[0].ansi_length)),
        30 // At least give 30 to column size, to make it look better.
    )
    const brief_max_len = console_width - option_line_max_len - space_number_between_option_and_brief
    function createOptionHelpTextList(option_and_brief: [string, string, boolean][])
    {
        return option_and_brief.map(
            ([option, brief]) =>
            {
                const cut_brief = wrapText(brief, brief_max_len).split("\n")
                const remaining_brief = cut_brief.slice(1)
                return (
                    // First line.
                    option.padANSIStart(option_line_max_len)
                    + " ".repeat(space_number_between_option_and_brief)
                    + cut_brief[0] + (
                        // Second and following line, if exists.
                        remaining_brief.length > 0
                            ? "\n" + remaining_brief
                                .map(b => " ".repeat(option_line_max_len + space_number_between_option_and_brief) + b)
                                .join("\n")
                            : ""
                    )
                )
            }
        ).join("\n")
    }
    const list_of_global_options_help_text =
        wrapText(bold("List of Global Option")) + "\n"
        + createOptionHelpTextList(option_and_brief__global) + "\n"
    const list_of_positional_options_help_text =
        wrapText(bold("List of Positional Option")) + "\n"
        + createOptionHelpTextList(option_and_brief__positional) + "\n"

    return wrapText(description_of_tstosc) +
        wrapText(caution_for_arg_order) +
        wrapText(how_to_see_detail_of_option) +
        list_of_global_options_help_text + "\n" + list_of_positional_options_help_text // Already wrapped.
}

function findByAlias(help_text_dict: HelpTextDict, alias: string)
{
    for (const value of help_text_dict.values())
    {
        if (value.alias.includes(alias)) { return value }
    }
}

function getSpecifiedHelpTextFrom(help_text_dict: HelpTextDict, about: string)
{
    const info = help_text_dict.get(about) ?? findByAlias(help_text_dict, about)
    if (info == undefined) { return error(`Error: Option "${about}" does not exist.`) }

    return "" +
        bold(`--${about}`) + ", " + info.alias.map(a => bold(a.length > 1 ? `--${a}` : `-${a}`)).join(", ") + "\n" +
        info.description
}

type ValueOf<DictType> = DictType extends Map<any, infer ValueType> ? ValueType : never

function getEnHelpText(about: string = "")
{
    const help_text_dict: HelpTextDict = new Map([
        ["version", {
            is_global: true,
            alias: ["v"],
            description:
                "Print the current version of tstosc.",
        }],
        ["help", {
            is_global: true,
            alias: ["h"],
            description:
                "Print help text (can specify the command to query)."
        }],
        ["out-dir", {
            is_global: true,
            alias: ["d"],
            description:
                "The output dir of the files. If not specified, `cwd`."
        }]
    ] as const satisfies [string, ValueOf<HelpTextDict>][])

    return about == ""
        ? getEnFullHelpTextFrom(help_text_dict)
        : getSpecifiedHelpTextFrom(help_text_dict, about)
}

function getEnBriefHelpText()
{
    return ""
        + ansis.bold.open + "Basic Usage" + ansis.reset.close + "\n"
        + "Simply put the TypeScript file name/path after this command, like this:\n"
        + cmd("tstosc") + " " + fileArg("program.ts") + "\n"
        + ("A SCLang file " + fileArg("program.scd")
            + " will be generated at current working directory.\n\n"
        )
        + ansis.bold.open + "Detailed Options" + ansis.reset.close + "\n"
        + ("Please run \`"
            + cmd("tstosc") + " " + param("--help")
            + "\` for more information."
        )
}