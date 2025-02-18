import ts from "typescript"
import { getDefaultUserExtensionDir } from "../../util/sc"
import { type UserTranspileIntention } from "../../cli/args"

/**
 * 
 * ### Warning
 * 
 * Do NOT try to add any getter/setter here.
 * Generator context uses spread syntax to copy, so setter and getter are not copied.
 * Since it is used as a data class (a plain object), maybe it should be better if it remains simple.
 */
export type GeneratorContext = {
    /** The compiler program of the TypeScript Compiler API. */
    readonly compiler_program: ts.Program
    /** The user option passed from command line. */
    readonly transpiler_option: TranspilerOption
    /** 
     * Level of indent. Used for generating space for SCLang (**not** indent level in TypeScript).
     * 
     * ### Guidelines for Indentation (advise from ChatGPT)
     * 
     * * Always Explicit: Add indentation explicitly at the root of each converter,
     *    only if `is_standalone_statement` is true.
     * * Child Responsibility: Nested converters should not add indentation;
     *    they assume the parent already handled it.
     */
    indent_level: number
    /**
     * If generating contents inside a class, this 
     */
    class_info: {
        /** Name of current class. */
        name: string
        /** Name of the super class. */
        super_class_name: string
    }
    /** 
     * Whether generating a SuperCollider's class method. 
     * Since in SCLang, method can have `^` as `return` in TypeScript. 
     */
    is_generating_method: boolean
    /**
     * Whether generating a SuperCollider's class constructor.
     * Since in SCLang, constructor must return the instance built.
     * 
     * Related `tstosc` tags: `tstosc__built_instance`.
     */
    is_generating_constructor: boolean
    /**
     * Whether the identifier is a class.
     */
    is_generating_class_name: boolean
    /**
     * Whether generating a property/method object literal in TypeScript.
     */
    is_generating_member_of_object_literal: boolean
    /**
     * Whether in a function body that contains an early-return.
     * Notice that this value is `false` when inside a method.
     */
    with_early_return: boolean
    /**
     * Whether a loop has `continue` or `break` statement.
     * 
     * `null` if current context is not in a loop body,
     * so no need to check.
     */
    with_loop_interrupt: boolean | null
    /**
     * The label of current statement.
     * Will be empty (`""`) if no available label.
     */
    statement_label: string
    /**
     * This will affect the generation of statement in label ending condition.
     * If current loop is a nested loop (inner loop), then use `loop_end.()` to exit, else `^nil`.
     */
    is_nested_loop: boolean
    /**
     * Semantic meaning of `break`.
     */
    break_means: "nothing" | "end_switch_case" | "stop_a_loop"
    /**
     * Semantic meaning of `super`.
     */
    super_means: "nothing" | "constructor" | "class_name" | "as_it_is"
    /**
     * This affects how `this` is converted:
     * * `"parameter"`: `tstosc__this_param`.
     * * `"built_instance"`: `tstosc__built_instance`
     * * `"itself"`: `this`.
     */
    this_coming_from: "nothing" | "object_literal_parameter" | "built_instance" | "itself"
    /**
     * A dictionary storing the `tstosc` generated temporary name for some expression,
     *  such as for postfix-self-increment (e.g. `a++`).
     * When transpiling, expression that stores in this dict, when condition fulfilled,
     *  should be replaced by the name stored in this dict (and/or with some additional process).
     * 
     * TODO: Should be cleared after leaving a scope.
     */
    expression_temporise_dict: Map<ts.Expression, string>
    /**
     * Whether stand-alone as a statement occupying one or more lines. Opposite to `at_value_position`.
     * When stand-alone, in most condition, it occupies the whole line, or multiple lines.
     * Indentation should be made at that time.
     * 
     * Will be `true` at the initial state of generating.
     */
    is_standalone_statement: boolean
    /** Create a new context with `indent_level` plus `level` (default `1`). */
    indent: (level?: number) => GeneratorContext
    /** Create a new context with `indent_level` minus `level` (default `1`). */
    outdent: (level?: number) => GeneratorContext
    /** 
     * Create a new context with 
     * `class_info: { name: info.name, super_class_name: returnUndefIfEmpty(info.super_class_name) ?? "Object" }`.
     */
    withClassInfo: (info: { name: string, super_class_name?: string }) => GeneratorContext
    /** Create a new context with `at_value_position = value ?? true`. */
    atValuePosition: (value?: boolean) => GeneratorContext
    /** Create a new context with `is_standalone_statement = value ?? true`. */
    isStandalongStatement: (value?: boolean) => GeneratorContext
    /** Create a new context with `is_generating_method = value ?? true`. */
    willGenerateMethod: (value?: boolean) => GeneratorContext
    /** Create a new context with `is_generating_constructor = value ?? true`. */
    willGenerateConstructor: (value?: boolean) => GeneratorContext
    /** Create a new context with `is_generating_class_name = value ?? true`. */
    willGenerateClassName: (value?: boolean) => GeneratorContext
    /** Create a new context with `is_generating_object_literal = value ?? true`. */
    willGenerateMemberOfObjectLiteral: (value?: boolean) => GeneratorContext
    /** Create a new context with `with_early_return = value ?? true`. */
    withEarlyReturn: (value?: boolean) => GeneratorContext
    /** Create a new context with `with_loop_interrupt = value ?? true`. */
    withLoopInterrupt: (value?: boolean) => GeneratorContext
    /** Create a new context with `statement_label = value`. */
    withStatementLabel: (value: string) => GeneratorContext
    /** Create a new context with `statement_label = ""`. */
    clearedStatementLabel: () => GeneratorContext
    /** Create a new context with `is_nested_loop = value ?? true`. */
    isNestedLoop: (value?: boolean) => GeneratorContext
    /** Create a new context with `break_means = value`. */
    makeBreakMeans: (value: GeneratorContext["break_means"]) => GeneratorContext
    /** Create a new context with `super_means = value`. */
    makeSuperMeans: (value: GeneratorContext["super_means"]) => GeneratorContext
    /** Create a new context with `this_coming_from = value`. */
    makeThisComingFrom: (value: GeneratorContext["this_coming_from"]) => GeneratorContext
} & ExceptionalSyntax

export type ExceptionalSyntax = {
    /**
     * Whether this file contains unhandled self-increment or self-decrement operator usage,
     *  such as `a++` or `--a`.
     * 
     * If wrap-content is generated, this should be set to `false`.
     */
    has_unhandled_self_indecr_operator: boolean
}

export type TranspilerOption = Omit<UserTranspileIntention, "type">

export const default_transpiler_option: TranspilerOption = {
    global: {
        output_dir: ".", user_extension_dir: getDefaultUserExtensionDir(), project_name: "tstosc",
        yes_to_all: false, flatten: false
    }, files: []
}

/**
 * ### Warning
 * 
 * Notice that default context's `compiler_program` is a empty program. 
 */
export const default_generator_context: GeneratorContext = {
    compiler_program: ts.createProgram({ rootNames: [], options: {} }),
    transpiler_option: default_transpiler_option,
    indent_level: 0,
    class_info: { name: "Error_NoClassSpecified", super_class_name: "Object" },
    is_generating_method: false,
    is_generating_constructor: false,
    is_generating_class_name: false,
    is_generating_member_of_object_literal: false,
    with_early_return: false,
    with_loop_interrupt: null,
    statement_label: "",
    is_nested_loop: false,
    break_means: "nothing",
    super_means: "nothing",
    this_coming_from: "nothing",
    has_unhandled_self_indecr_operator: false,
    expression_temporise_dict: new Map(),
    is_standalone_statement: true,
    indent: function (level: number = 1) { return ({ ...this, indent_level: this.indent_level + level }) },
    outdent: function (level: number = 1) { return ({ ...this, indent_level: Math.max(0, this.indent_level - level) }) },
    withClassInfo: function (info: { name: string, super_class_name?: string })
    {
        const super_class_name = info.super_class_name != undefined && info.super_class_name.length > 0
            ? info.super_class_name
            : "Object"

        return { ...this, class_info: { name: info.name, super_class_name } }
    },
    atValuePosition: function (value: boolean = true) { return ({ ...this, is_standalone_statement: !(value) }) },
    isStandalongStatement: function (value: boolean = true) { return ({ ...this, is_standalone_statement: value }) },
    willGenerateMethod: function (value: boolean = true) { return ({ ...this, is_generating_method: value }) },
    willGenerateConstructor: function (value: boolean = true) { return ({ ...this, is_generating_constructor: value }) },
    willGenerateClassName: function (value: boolean = true) { return ({ ...this, is_generating_class_name: value }) },
    willGenerateMemberOfObjectLiteral: function (value: boolean = true) { return ({ ...this, is_generating_member_of_object_literal: value }) },
    withEarlyReturn: function (value: boolean = true) { return ({ ...this, with_early_return: value }) },
    withLoopInterrupt: function (value: boolean = true) { return ({ ...this, with_loop_interrupt: value }) },
    withStatementLabel: function (value: string) { return ({ ...this, statement_label: value }) },
    clearedStatementLabel: function () { return ({ ...this, statement_label: "" }) },
    isNestedLoop: function (value: boolean = true) { return ({ ...this, is_nested_loop: value }) },
    makeBreakMeans: function (value: GeneratorContext["break_means"]) { return ({ ...this, break_means: value }) },
    makeSuperMeans: function (value: GeneratorContext["super_means"]) { return ({ ...this, super_means: value }) },
    makeThisComingFrom: function (value: GeneratorContext["this_coming_from"]) { return ({ ...this, this_coming_from: value }) },
}