import ts from "typescript";

export abstract class TStoSCError extends Error { }

abstract class UnsupportedError extends TStoSCError
{
    protected readonly causing_file?: ts.SourceFile
    protected readonly causing_offset_start?: number
    protected readonly causing_offset_end?: number

    public tryGetErrorOrigin()
    {
        let result = ""
        if (this.causing_file != undefined)
        {
            if (this.causing_offset_start != undefined && this.causing_offset_end != undefined)
            {
                // Skip the space
                let real_start = this.causing_offset_start
                let real_end = this.causing_offset_end
                while (/\s/.test(this.causing_file.text[real_start]))
                {
                    real_start++
                    real_end++
                }
                const { line: pos_line, character: pos_col } =
                    this.causing_file.getLineAndCharacterOfPosition(real_start)

                let line_start = 0
                const line_start__offset = this.causing_file.getPositionOfLineAndCharacter(pos_line, 0)
                // Skip the leading space.
                while (/\s/.test(this.causing_file.text[line_start__offset + line_start])) { line_start++ }
                let line_end = line_start
                // Find line end.
                while (
                    (this.causing_file.text[line_start__offset + line_end] != "\n"
                        && this.causing_file.text[line_start__offset + line_end] != "\r")
                    && this.causing_file.end >= line_start__offset + line_end
                ) { line_end++ }
                // If the `real_end` is crossing lines, just set it to `line_start__offset + line_end`.
                if (this.causing_file.getLineAndCharacterOfPosition(real_end).line > pos_line)
                { real_end = line_start__offset + line_end }

                const example_line = this.causing_file.text.slice(line_start__offset + line_start, line_start__offset + line_end)

                result += `At file "${this.causing_file.fileName}:${pos_line + 1}:${pos_col + 1}".\n`
                    + `| ${pos_line + 1}    ` + example_line + "\n"
                    + "|     " + " ".repeat((pos_line + 1).toString().length + pos_col - line_start)
                    + "^".repeat(real_end - real_start)
            }
            else
            {
                result += `At file "${this.causing_file.fileName}".`
            }
        }

        return result
    }

    constructor(message: string, causing_file?: ts.SourceFile, causing_start?: number, causing_end?: number)
    {
        super(message)
        this.causing_file = causing_file
        this.causing_offset_start = causing_start
        this.causing_offset_end = causing_end
    }
}

export class UnsupportedTypeError extends UnsupportedError
{
    /**
     * Generate error message (by default, `description` is `"node"`):
     * 
     * ```ts
     * `The ${description} with syntax kind "${ts.SyntaxKind[n.kind]}" is not supported.`
     * ```
     */
    public static forNodeWithSyntaxKind(n: ts.Node, description: string = "node")
    {
        return new UnsupportedTypeError(
            `The ${description} with syntax kind "${ts.SyntaxKind[n.kind]}" is not supported.`,
            n.getSourceFile(), n.pos, n.end
        )
    }

    /**
     * Generate error message (by default, `description` is `"provided syntax"`):
     * 
     * ```ts
     * `The ${description} of syntax kind "${ts.SyntaxKind[k]}" is not supported.`
     * ```
     */
    public static ofSyntaxKind(k: ts.SyntaxKind, description: string = "provided syntax", n?: ts.Node)
    {
        return new UnsupportedTypeError(
            `The ${description} of syntax kind "${ts.SyntaxKind[k]}" is not supported.`,
            n?.getSourceFile(), n?.pos, n?.end
        )
    }

    constructor(message: string, causing_file?: ts.SourceFile, causing_start?: number, causing_end?: number)
    {
        super(message, causing_file, causing_start, causing_end)
    }
}

export class UnsupportedSyntaxError extends UnsupportedError { }

export class SourceFileNotFoundError extends TStoSCError
{
    public static forFile(name_or_path_as_hint: string)
    {
        return new SourceFileNotFoundError(
            `The source file "${name_or_path_as_hint}" cannot be found.`
        )
    }
}

export class RuntimeError extends TStoSCError { }

export class UserAbortionError extends RuntimeError
{
    /**
     * Generate error message (by default, `description` is `"user choose not to proceed"`):
     * 
     * ```ts
     * `Action aborted: ${reason}.`
     * ```
     */
    public static for(reason: string = "user choose not to proceed")
    {
        return new UserAbortionError(
            `Action aborted: ${reason}.`
        )
    }
}