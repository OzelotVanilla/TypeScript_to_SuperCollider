export const isValidPath__posix_default_option: isValidPath_PosixOption = {
    platform: "posix"
}

export const isValidPath__windows_default_option: isValidPath_WindowsOption = {
    platform: "windows",
    length_limit: 260,
    is_forward_slash_valid_separator: true
}

/**
 * Test if the given string is a valid path.
 * 
 * Reference:
 * * https://learn.microsoft.com/en-us/dotnet/standard/io/file-path-formats
 * * https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file
 * * https://learn.microsoft.com/en-us/windows/win32/fileio/maximum-file-path-limitation
 * 
 * @param s Any string that might be a path.
 */
export function isValidPath(s: string, option: isValidPath_Option = {})
{
    if (s.length == 0) { return false }
    option.type ??= "dir"
    option.platform ??= process.platform == "win32"
        ? "windows"
        : "posix"

    switch (option.platform)
    {
        case "posix": {
            option = { ...isValidPath__posix_default_option, ...option }
            return checkPOSIXPathType(
                s, option as isValidPath_Option & isValidPath_PosixOption
            ) != POSIXPathType.invalid
        }

        case "windows": {
            option = { ...isValidPath__windows_default_option, ...option }
            return checkWindowsPathType(
                s, option as isValidPath_Option & isValidPath_WindowsOption
            ) != WindowsPathType.invalid
        }

        default:
            throw TypeError(`Unknown platform "${(option as isValidPath_Option).platform}".`)
    }
}

/**
 * Test if the given string is a valid path in Windows system.
 * Notice that too long path is considered invalid, unless set in `option`.
 * 
 * Reference:
 * * https://learn.microsoft.com/en-us/dotnet/standard/io/file-path-formats
 * * https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file
 * * https://learn.microsoft.com/en-us/windows/win32/fileio/maximum-file-path-limitation
 * 
 * @param s Any string that might be a path.
 */
export function isValidWindowsPath(s: string, option: isValidPath_Option & isValidPath_WindowsOption)
{
    return isValidPath(s, { ...option, platform: "windows" })
}

export type isValidPath_Option = {
    type?: "dir" | "file"
    platform?: "posix" | "windows"
} & Partial<(isValidPath_PosixOption | isValidPath_WindowsOption)>

type isValidPath_PosixOption = {
    platform: "posix"
    length_limit?: number
}

type isValidPath_WindowsOption = {
    platform: "windows"
    /**
     * Notice that the limit check might fail,
     *  because `\\?\` prefix has chance to be extended to a longer string.
     * 
     * @reference https://learn.microsoft.com/en-us/windows/win32/fileio/maximum-file-path-limitation
     */
    length_limit?: undefined | 260 | 32767 | number
    is_forward_slash_valid_separator?: boolean
}

export function checkPOSIXPathType(s: string, option: isValidPath_PosixOption): POSIXPathType
{
    if (s.length == 0 || s.length > (option.length_limit ?? Number.POSITIVE_INFINITY))
    { return POSIXPathType.invalid }

    const name_invalid_regex = /\n\0/
    function isValidNameSlashNamePath(name: string)
    {
        const name_group = name.split("/")
        for (const f of name_group.slice(0, -1))
        {
            if (name_invalid_regex.test(f)) { return false }
        }
        if (/\n/.test(name_group.at(-1)!)) { return false }

        return true
    }
    function returnIfValidNameSlashNamePath(name: string, type_when_valid: POSIXPathType)
    {
        return isValidNameSlashNamePath(name) ? type_when_valid : POSIXPathType.invalid
    }

    if (s[0] == "/")
    {
        return returnIfValidNameSlashNamePath(s.slice(1), POSIXPathType.absolute_path)
    }

    if (s[0] == "~" && s[1] == "/")
    {
        return returnIfValidNameSlashNamePath(s.slice(2), POSIXPathType.home_directory_relative_path)
    }

    return returnIfValidNameSlashNamePath(s, POSIXPathType.working_directory_relative_path)
}

export enum POSIXPathType
{
    /** Path like `/tmp/a/b`. */
    absolute_path,
    /** Path like `a/b`, `./a/b` or `../a/b`. */
    working_directory_relative_path,
    /** Path like `~/a`. */
    home_directory_relative_path,
    /** Represent a path failed to parse. */
    invalid
}

/**
 * @param s Path string to check.
 * @reference https://learn.microsoft.com/en-us/dotnet/standard/io/file-path-formats#identify-the-path
 */
export function checkWindowsPathType(s: string, option: isValidPath_WindowsOption): WindowsPathType
{
    if (s.length == 0 || s.length > (option.length_limit ?? Number.POSITIVE_INFINITY))
    { return WindowsPathType.invalid }

    const name_invalid_regex = /[<>:"/|?*\x01-\x1f]/
    const isSepChar = option.is_forward_slash_valid_separator
        ? (c: string) => (c == "\\" || c == "/")
        : (c: string) => (c == "\\")
    const sep_char_regex = option.is_forward_slash_valid_separator
        ? /[\\/]/
        : /[\\]/
    function isInvalidName(name: string) { return name_invalid_regex.test(name) }
    function isValidNameSlashNamePath(name: string)
    {
        for (const f of name.split(sep_char_regex))
        {
            if (isInvalidName(f)) { return false }
        }

        return true
    }
    function returnIfValidNameSlashNamePath(name: string, type_when_valid: WindowsPathType)
    {
        return isValidNameSlashNamePath(name) ? type_when_valid : WindowsPathType.invalid
    }
    function isAlphabet(c: string)
    {
        return ("a" < c && c < "z") || ("A" < c && c < "Z")
    }

    if (s[0] == "\\")
    {
        // s starts with `\`.
        if (s[1] == "\\")
        {
            return (s[2] == "." || s[2] == "?") && s[3] == "\\"
                // `s` starts with `\\.\` or `\\?\`.
                ? returnIfValidNameSlashNamePath(s.slice(4), WindowsPathType.device_path)
                // `s` starts with `\\`.
                : returnIfValidNameSlashNamePath(s.slice(2), WindowsPathType.unc_path)
        }
        // s starts with `\`.
        return returnIfValidNameSlashNamePath(s.slice(1), WindowsPathType.root_relative_path)
    }

    if (isAlphabet(s[0]) && s[1] == ":")
    {
        // `s` is `A:`, while `A` could be any English alphabet.
        return isSepChar(s[2])
            // `s` is like `A:\` or `A:/` (depends on `option.is_forward_slash_valid_separator`).
            ? returnIfValidNameSlashNamePath(s.slice(3), WindowsPathType.dos_path)
            : returnIfValidNameSlashNamePath(s.slice(2), WindowsPathType.drive_relative_path)
    }

    if (!isInvalidName(s[0]))
    {
        // `s` might be like `path\file.txt` or `CON`.
        return /^(CON|PRN|AUX|NUL|LPT[1-9]|COM[1-9])$/i.test(s)
            ? WindowsPathType.legacy_device // If test pass, then a legacy device.
            : returnIfValidNameSlashNamePath(s, WindowsPathType.working_directory_relative_path)
    }

    return WindowsPathType.invalid
}

export enum WindowsPathType
{
    /** Path like `\\.\CON` or `\\?\C:\path\file.txt`. */
    device_path,
    /** Path like `\\server\shared.txt`. Start with two `\`, but not followed by `.` or `?`. */
    unc_path,
    /** Path like `C:\Windows\test.txt`. Start with drive name. */
    dos_path,
    /** Path like `CON`, `COM`, or `LPT1`. */
    legacy_device,
    /** Path like `\path\file.txt` (that might be `C:\path\file.txt`), relative to current drive's root. */
    root_relative_path,
    /** Path like `D:path\file.txt`, relative to current working directory, but in another specified drive. */
    drive_relative_path,
    /** Path like `path\file.txt`, `.\path\file.txt`, or `..\test.txt`. */
    working_directory_relative_path,
    /** Represent a path failed to parse. */
    invalid,
    /** Path like `C:\Windows\test.txt`. Start with drive name. */
    trivial_path = dos_path,
}