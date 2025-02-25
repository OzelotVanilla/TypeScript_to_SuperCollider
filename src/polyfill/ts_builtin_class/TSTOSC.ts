export const tstosc_namespace__source_code = `
/** Namespace */
TSTOSC
{
    classvar <null, <undefined ;

    *initClass
    {
        null = TSTOSC__Null.new() ;
        undefined = nil ;
    }

    *isNullOrUndefined { |test| ^or( test.isKindOf(TSTOSC__Null), test == TSTOSC.undefined ) ; }
    *orElse { |test, default| if ( TSTOSC.isNullOrUndefined(test), { ^default ; }, { ^test ? default ; } ) ; }
}
`.trim();