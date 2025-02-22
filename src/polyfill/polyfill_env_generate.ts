import fs from "fs"
import path from "path"
import { object__class_source_code } from "./ts_builtin_class/TSTOSC__Object"
import { array__class_source_code } from "./ts_builtin_class/TSTOSC__Array"
import { object_literal__class_source_code } from "./ts_builtin_class/TSTOSC__ObjectLiteral"

export const polyfill_entry = new Map<string, string>([
    ["TSTOSC__Object", object__class_source_code],
    ["TSTOSC__Array", array__class_source_code],
    ["TSTOSC__ObjectLiteral", object_literal__class_source_code],
])

export function generateTStoSCRuntimeEnvIfNecessary(helper_file_path: string)
{
    if (fs.existsSync(helper_file_path)) { fs.rmSync(helper_file_path, { recursive: true }) }
    fs.mkdirSync(helper_file_path, { recursive: true })

    // Polyfill Class.
    const helper_class_folder_path = path.resolve(helper_file_path, "class")
    fs.mkdirSync(helper_class_folder_path)
    for (const [class_name, source_code] of polyfill_entry.entries())
    {
        const file_path = path.resolve(helper_class_folder_path, class_name + ".sc")
        fs.writeFileSync(file_path, source_code)
    }
}