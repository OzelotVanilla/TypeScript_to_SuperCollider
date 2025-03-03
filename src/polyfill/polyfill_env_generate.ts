import fs from "fs"
import path from "path"

export function generateTStoSCRuntimeEnvIfNecessary(helper_file_path: string)
{
    if (fs.existsSync(helper_file_path)) { fs.rmSync(helper_file_path, { recursive: true }) }
    fs.mkdirSync(helper_file_path, { recursive: true })

    // Polyfill Class.
    const polyfill_src_file_path = path.resolve(import.meta.dirname, "ts_builtin_class")
    const helper_class_folder_path = path.resolve(helper_file_path, "class")
    fs.mkdirSync(helper_class_folder_path)
    fs.readdirSync(polyfill_src_file_path)
        .filter(file_name => file_name.endsWith(".sc"))
        .forEach(
            file_name => fs.copyFileSync(
                path.resolve(polyfill_src_file_path, file_name),
                path.resolve(helper_class_folder_path, file_name)
            )
        )
}