import ts from "typescript"
import { createHash } from "crypto"

/**
 * @param n Number to be shown in binary form.
 * @returns Binary expression of `n` in string, starting with `0b`.
 */
export function bin(n: number) { return `0b${n.toString(2)}` }

export enum ZipOption
{
    /** Take the shortest length of two arrays. */
    minimal_zip = "minimal_zip",
    /** Based on the length of accepting side (`a1`). */
    accepting_side_length = "accepting_side_length",
    /** Based on the length of donating side (`a2`). */
    donating_side_length = "donating_side_length"
}

/**
 * 
 * @param a1 The array accepting incoming element.
 * @param a2 The array donating element.
 * @returns The zipped array, length based on accepting side.
 */
export function zip<A1ElemType, A2ElemType>
    (a1: ArrayLike<A1ElemType>, a2: ArrayLike<A2ElemType>): [A1ElemType, A2ElemType | undefined][]
/**
* 
* @param a1 The array accepting incoming element.
* @param a2 The array donating element.
* @returns The zipped array.
*/
export function zip<A1ElemType, A2ElemType>
    (a1: ArrayLike<A1ElemType>, a2: ArrayLike<A2ElemType>, option: ZipOption.accepting_side_length):
    [A1ElemType, A2ElemType | undefined][]
/**
* 
* @param a1 The array accepting incoming element.
* @param a2 The array donating element.
* @returns The zipped array.
*/
export function zip<A1ElemType, A2ElemType>
    (a1: ArrayLike<A1ElemType>, a2: ArrayLike<A2ElemType>, option: ZipOption.donating_side_length):
    [A1ElemType | undefined, A2ElemType][]
/**
 * 
 * @param a1 The array accepting incoming element.
 * @param a2 The array donating element.
 * @returns The zipped array.
 */
export function zip<A1ElemType, A2ElemType>
    (a1: ArrayLike<A1ElemType>, a2: ArrayLike<A2ElemType>, option: ZipOption.minimal_zip):
    [A1ElemType, A2ElemType][]
/**
 * 
 * @param a1 The array accepting incoming element.
 * @param a2 The array donating element.
 * @returns The zipped array.
 */
export function zip<A1ElemType, A2ElemType>
    (a1: ArrayLike<A1ElemType>, a2: ArrayLike<A2ElemType>, option: ZipOption = ZipOption.accepting_side_length)
{
    const counter_limit =
        option == ZipOption.accepting_side_length
            ? a1.length
            : option == ZipOption.donating_side_length
                ? a2.length // The last situation is `option == ZipOption.minimal_zip`.
                : Math.min(a1.length, a2.length)

    let result: [A1ElemType | undefined, A2ElemType | undefined][] = new Array(counter_limit)
    for (let i = 0; i < counter_limit; i++) { result[i] = [a1[i], a2[i]] }
    return result
}

export function bifilter<ElemType, SubElemType extends ElemType>(
    arr: ArrayLike<ElemType>,
    predicate: (element: ElemType, index: number, arr: ArrayLike<ElemType>) => element is SubElemType
): [SubElemType[], ElemType[]]
export function bifilter<ElemType, SubElemType extends ElemType>(
    arr: ArrayLike<ElemType>,
    predicate: (element: ElemType, index: number, arr: ArrayLike<ElemType>) => unknown
): [ElemType[], ElemType[]]
export function bifilter<ElemType, SubElemType extends ElemType>(
    arr: ArrayLike<ElemType>,
    predicate: (element: ElemType, index: number, arr: ArrayLike<ElemType>) => any
)
{
    [].filter
    let quals: SubElemType[] = []
    let fails: ElemType[] = []

    for (let i = 0; i < arr.length; i++)
    {
        const e = arr[i]
        if (predicate(e, i, arr)) { quals.push(e as SubElemType) }
        else { fails.push(e) }
    }

    return [quals, fails]
}

export /* wrapper */ function memorised<FunctionType extends (...args: any[]) => any>(
    f: FunctionType,
    makeKey: (...args: Parameters<FunctionType>) => any = (...a) => a
): (...args: Parameters<FunctionType>) => ReturnType<FunctionType>
{
    let cache = new Map<Parameters<FunctionType>, ReturnType<FunctionType>>()

    return function (...args: Parameters<FunctionType>)
    {
        const key = makeKey(...args)
        if (!cache.has(key)) { cache.set(key, f(...args)) }
        return cache.get(key)!
    }
}

export function hash(e: ts.Node): string
{
    return createHash("md5")
        .update(`${e.getSourceFile()?.fileName ?? ""}${e.kind}${e.pos}${e.end}`)
        .digest("hex").toString()
}

export function isArrayLike(obj: Object): obj is ArrayLike<any>
export function isArrayLike<EleType>(obj: Array<EleType>): obj is EleType[]
export function isArrayLike<EleType>(obj: ReadonlyArray<EleType>): obj is EleType[]
export function isArrayLike<EleType>(obj: ArrayLike<EleType>): obj is ArrayLike<EleType>
/**
 * 
 * @reference https://stackoverflow.com/a/24048615
 */
export function isArrayLike<EleType>(obj: Object | Array<EleType> | ReadonlyArray<EleType>): obj is ArrayLike<EleType>
{
    return Array.isArray(obj)
        || (
            obj != null && obj != undefined
            && typeof obj == "object"
            && "length" in obj && typeof obj.length == "number"
            && (
                obj.length == 0
                || (obj.length > 0 && (obj.length - 1) in obj)
            )
        )
}