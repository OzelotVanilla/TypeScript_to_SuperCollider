export class Result<OkType, ErrType>
{
    private whether_ok: boolean
    private value: OkType | ErrType

    public static createOk<ValueType, ErrType = never>(value: ValueType): Result<ValueType, ErrType>
    {
        return new Result(true, value)
    }

    public static createErr<ValueType, OkType = never>(value: ValueType): Result<OkType, ValueType>
    {
        return new Result(false, value)
    }

    public static fromOk<ValueType>(result: Result<ValueType, unknown>)
    {
        if (result.isErr()) { throw TypeError(`The result is Err.`) }

        return result as Result<ValueType, never>
    }

    public static fromErr<ValueType>(result: Result<unknown, ValueType>)
    {
        if (result.isOk()) { throw TypeError(`The result is Ok.`) }

        return result as Result<never, ValueType>
    }

    public isOk(): this is Result<OkType, never> { return this.whether_ok }

    public isErr(): this is Result<never, ErrType> { return !this.whether_ok }

    public unwrapOk(): OkType
    {
        if (this.isErr()) { throw TypeError(`The result is Err. Error is:\n${JSON.stringify(this.unwrapErr())}`) }

        return this.value as OkType
    }

    public unwrapErr(): ErrType
    {
        if (this.isOk()) { throw TypeError(`The result is Ok. Value is:\n${JSON.stringify(this.unwrapOk())}`) }

        return this.value as ErrType
    }

    constructor(whether_ok: true, value: OkType)
    constructor(whether_ok: false, value: ErrType)
    constructor(whether_ok: boolean, value: OkType | ErrType)
    {
        this.whether_ok = whether_ok
        this.value = value
    }
}