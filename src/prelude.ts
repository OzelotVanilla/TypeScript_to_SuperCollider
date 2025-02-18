/**
 * Declaration file could be found in `global.d.ts`.
*/ /** */

import ansis from "ansis"

String.prototype.indent = function (level: number, char: string = "    ")
{
    if (this.length == 0 || level == 0) { return this + "" }

    const indentation = char.repeat(level)
    return this.split("\n").map(s => indentation + s).join("\n")
}

if (!("ansi_length" in String.prototype))
{
    Object.defineProperty(String.prototype, "ansi_length", {
        get: function () { return ansis.strip(this.toString()).length; }
    })
};

String.prototype.padANSIStart = function (max_length: number, char: string = " ")
{
    if (char.length > 1) { throw TypeError(`Padding char ("${char}") should be a char, not a string with length over 1.`) }
    const text = this.toString()
    const length = this.ansi_length
    if (length >= max_length) { return text }
    else { return `${char.repeat(max_length - length)}${text}` }
}

String.prototype.padANSIEnd = function (max_length: number, char: string = " ")
{
    if (char.length > 1) { throw TypeError(`Padding char ("${char}") should be a char, not a string with length over 1.`) }
    const text = this.toString()
    const length = this.ansi_length
    if (length >= max_length) { return text }
    else { return `${text}${char.repeat(max_length - length)}` }
};

Array.prototype.deduplicated = function ()
{
    return [...new Set(this)]
}

export const version = "0.0.1"