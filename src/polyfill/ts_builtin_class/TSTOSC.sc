/** Namespace */
TSTOSC
{
    classvar <null, <undefined, <nan, infinity ;

    *initClass
    {
        null = TSTOSC__Null.new() ;
        undefined = nil ;
        nan = TSTOSC__Number.escvar_NaN ;
        infinity = TSTOSC__Number.escvar_POSITIVE_INFINITY ;
    }

    *isNullOrUndefined { |test| ^or( test.isKindOf(TSTOSC__Null), test == TSTOSC.undefined ) ; }
    *orElse { |test, default| if ( TSTOSC.isNullOrUndefined(test), { ^default ; }, { ^test ? default ; } ) ; }
    *lazyAnd { |...block| for (0, block.size-1, { |i| if ( not(block[i].()), { ^false ; } ; ) } ) ; ^true ; }
    *lazyOr { |...block| for (0, block.size-1, { |i| if ( block[i].(), { ^true ; } ; ) } ) ; ^false ; }
    *parseInt { |str, radix| ^TSTOSC__Number.parseInt(str, radix) ; }
    *parseFloat { |str| ^TSTOSC__Number.parseFloat(str) ; }
}