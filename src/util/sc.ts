import path from "path"

export function getDefaultUserExtensionDir()
{
    switch (process.platform)
    {
        case "darwin":
            return path.posix.resolve(process.env.HOME!, "Library/Application Support/SuperCollider/Extensions/")
        case "win32":
            return path.win32.resolve(process.env.USERPROFILE!, "AppData/Local/SuperCollider/Extensions/")
        // Should be linux
        default:
            return path.posix.resolve(process.env.HOME!, ".local/share/SuperCollider/Extensions/")
    }
}