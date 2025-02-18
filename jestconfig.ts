import { createDefaultPreset, JestConfigWithTsJest } from "ts-jest"

const config: JestConfigWithTsJest = {
    ...createDefaultPreset(),
    "transform": {
        "^.+\\.tsx?$": ["ts-jest", {
            tsconfig: {
                module: "esnext",
                target: "esnext"
            }
        }]
    },
    "testRegex": "/test/.*\\.(test|spec)\\.(jsx?|tsx?)$",
    "moduleFileExtensions": ["ts", "tsx", "js", "jsx", "json", "node"]
}

export default config