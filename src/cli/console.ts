import ansis from "ansis"
import wrapTextANSI, { Options as WrapANSIOption } from "wrap-ansi"
import { prompt } from "readline-sync"
import { TStoSCError, UnsupportedSyntaxError, UnsupportedTypeError } from "../util/error"

export const [console_height, console_width] = [process.stdout.rows, process.stdout.columns]

export function wrapText(text: string, column: number = console_width, option?: WrapANSIOption)
{
    return wrapTextANSI(text, column, option)
}

/**
 * Return `true` if considered OK to process.
 */
export function askToProceedOrAbort(hint: string, proceed_text: string = "y")
{
    return prompt({ prompt: hint }) == proceed_text
}

export function success(text: string)
{
    return ansis.hex("67a70c").open + text + ansis.hex("2e7e16").close
}

export function error(text: string)
{
    return ansis.hex("e9546b").open + text + ansis.hex("e9546b").close
}

export function warn(text: string)
{
    return ansis.hex("ff9740").open + text + ansis.hex("f56a29").close
}

export function cmd(text: string)
{
    return ansis.hex("2ca9e1").open + text + ansis.hex("2ca9e1").close
}

export function param(text: string)
{
    return ansis.hex("d9a62e").open + text + ansis.hex("d9a62e").close
}

export function fileArg(text: string)
{
    return ansis.hex("a69425").open + text + ansis.hex("a69425").close
}

export function bold(text: string)
{
    return ansis.bold.open + text + ansis.bold.close
}

export function italic(text: string)
{
    return ansis.italic.open + text + ansis.italic.close
}

export function dim(text: string)
{
    return ansis.dim.open + text + ansis.dim.close
}

export function printError(err: Error, indent_level: number = 0)
{
    console.log(error(err.message).indent(1 + indent_level))
    if (err instanceof TStoSCError)
    {
        switch (true)
        {
            case err instanceof UnsupportedSyntaxError: {
            } break

            case err instanceof UnsupportedTypeError: {
                console.log(error(wrapText(err.tryGetErrorOrigin()).indent(2 + indent_level)))
            } break
        }
    }
    else
    {
        console.log((error(err.toString()) + error(err.stack ?? "")).indent(indent_level))
    }
}