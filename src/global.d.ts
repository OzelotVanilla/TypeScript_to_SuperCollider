declare interface String
{
    /**
     * Create a new string with indentation.
     * If the string contains multiple lines, then each line will be indented.
     * If the string is empty, **do nothing**.
     * 
     * By default, the indentation is made by 4 spaces as 1 level.
     */
    indent: (level: number, char?: string) => string

    /** 
     * Get the length of a string without calculating the occupation of ANSI escape sequence.
     */
    get ansi_length(): number

    /**
     * Pad the left side of string (that might contains ANSI escape sequence) to given `max_length`,
     *  using repearing of `char`.
     * 
     * @param char Must be single character.
     */
    padANSIStart: (max_length: number, char?: string) => string

    /**
     * Pad the right side of string (that might contains ANSI escape sequence) to given `max_length`,
     *  using repearing of `char`.
     * 
     * @param char Must be single character.
     */
    padANSIEnd: (max_length: number, char?: string) => string
}

declare interface Array<T>
{
    /** Return an array without duplicated elements. */
    deduplicated: () => T[]
}