TSTOSC__Number : TSTOSC__Object
{
    classvar <escvar_EPSILON,
             <escvar_MAX_SAFE_INTEGER, <escvar_MAX_VALUE, <escvar_MIN_SAFE_INTEGER, <escvar_MIN_VALUE,
             <escvar_NaN, <escvar_NEGATIVE_INFINITY, <escvar_POSITIVE_INFINITY ;
    var storing_number ;

    *initClass
    {
        escvar_EPSILON = 2 ** -52 ;
        escvar_MAX_SAFE_INTEGER = (2 ** 53) - 1 ; escvar_MAX_VALUE = 2 ** 1023 * (2 - escvar_EPSILON) ;
        escvar_MIN_SAFE_INTEGER = neg(2 ** 53 - 1) ; escvar_MIN_VALUE = 2 ** -1074 ;
        escvar_NaN = 0/0 ; escvar_NEGATIVE_INFINITY = -inf ; escvar_POSITIVE_INFINITY = inf ;
    }

    *new
    { |obj|
        ^super.new().initTSTOSC__Number(obj) ;
    }

    initTSTOSC__Number
    { |obj|
        storing_number = TSTOSC__Number.tstosc__parseNumber(obj) ;
        ^this ;
    }

    /* For static methods */

    *isFinite
    { |obj|
        if ( TSTOSC__Number.tstosc__alikeNumber(obj),
            { ^and(not(TSTOSC__Number.isNaN(obj)), and(obj.value != inf, obj.value != -inf)) ; },
            { ^false ; }
        ) ;
    }
    *isInteger
    { |obj|
        if ( TSTOSC__Number.tstosc__alikeNumber(obj), { ^ceil(obj.value) == floor(obj.value) ; }, { ^false ; } ) ;
    }
    *isNaN { |obj| if ( TSTOSC__Number.tstosc__alikeNumber(obj), { ^obj.value.isNaN() ; }, { ^false ; } ) ; }
    *isSafeInteger { |num| ^and(neg(2 ** 53 - 1) <= num, num <= (2 ** 53 - 1)) ; }
    *parseInt
    { |value, radix=10| var result = 0, arr ; value = TSTOSC__String.tstosc__coercion(value).toLower() ;
        // Only accept "0x" prefix.
        if ( value[0..1] == "0x", { value = value[2..] ; radix = 16 ; } ) ;
        // Read the string until impossible.
        (arr = value.ascii.collect({ |v|
            case (
                { and(48 <= v, v <= 57) }, { v - 48.0 ; },
                { and(97 <= v, v <= 122) }, { v - 87.0 ; },
                { inf ; }
            ) ;
        })).copyRange(0, arr.detectIndex(_ >= radix) - 1).reverse.do({ |d, i| result = result + ((10 ** i) * d) ; }) ;
        ^TSTOSC__Number.new(if( TSTOSC__Number.tstosc__isSafeInt(result), { result.asInteger() ; }, { result } )) ;
    }
    *parseFloat { |value| TSTOSC__Number.parseNumber(value).asFloat() ; }

    /* For SCLang */

    asString { ^storing_number.asString() ; }
    value { ^storing_number ; }

    /* For other polyfill class */

    /** for constructor */
    *tstosc__parseNumber
    { |obj|
        case (
            { TSTOSC__Number.tstosc__alikeNumber(obj) }, { ^obj.value ; },

            { TSTOSC__String.tstosc__alikeString(obj) },
            {
                var positive_sign = true, first = obj[0], rest, i = 0, before_dot, after_dot, temp ;
                obj = obj.stripWhiteSpace() ;
                // Test if whitespace-only
                if ( obj.size == 0, { ^0 ; } ) ;
                // Assigning "+" or "-" to "sign".
                if ( or(first == 43.asAscii, first == 45.asAscii),
                    { if ( first == 45.asAscii, { positive_sign = false ; } ) ; i = 1 ; }
                ) ;
                // Skip leading "0".
                while ( { obj[i] == "0" }, { i = i + 1 } ) ;
                rest = obj[i..] ;
                // Test if "Infinity".
                if ( rest == "Infinity", { if ( positive_sign, { ^inf ; }, { ^-inf ; } ) ; } ) ;
                // Check if "obj" is valid. If not then return "NaN".
                if ( not("^(0[box][\\da-f]+|\\d*)(\\.\\d+)?$".matchRegexp(rest)), { ^escvar_NaN ; } ) ;
                // If valid, see if it has "."
                temp = rest.split(/* char '.' */ 46.asAscii) ; before_dot = temp[0].toLower() ; after_dot = temp[1] ;
                // From now, "temp" is result.
                temp = if ( positive_sign, { 1 ; }, { -1 ; } ) * if ( after_dot == nil,
                    // Is integer number.
                    {
                        var radix, has_prefix = true ;
                        radix = switch ( before_dot[0..1], {"0x"},{16}, {"0b"},{2}, {"0o"},{8}, {has_prefix = false;10;} ) ;
                        if ( has_prefix, { before_dot = before_dot[2..] ; } ) ;
                        /* return (float) */ before_dot.ascii.reverse
                            .collect({ |v| v - if( 97 <= v, { 87.0 }, { 48.0 } ) ; })
                            .collect({ |d, i| if (d >= radix, { ^escvar_NaN ; } ) ; (10 ** i) * d ; }).sum() ;
                    },
                    // Is float number.
                    {
                        // If not in decimal, return NaN.
                        if ( not(and("^\\d*$".matchRegexp(before_dot), "^\\d*$".matchRegexp(after_dot))),
                            { ^escvar_NaN ; },
                            { rest.asFloat() ; }
                        ) ;
                    }
                ) ;
                // For int, if too big or too small, store as float.
                if ( and(after_dot == nil, TSTOSC__Number.tstosc__isSafeInt(temp)),
                    { ^temp.asInteger() ; },
                    { ^temp ; }
                ) ;
            },

            { obj.isKindOf(Boolean) }, { ^if ( obj, { ^1 ; }, { ^0 ; } ) ; },
            { obj == TSTOSC.undefined }, { ^escvar_NaN ; },
            { obj == TSTOSC.null }, { ^0 ; },
            // Otherwise:
            { Error.new("Does not support init Number using " ++ obj.class ++ ".").throw() ; }
        ) ;
    }

    *tstosc__alikeNumber { |obj| ^or(obj.isKindOf(TSTOSC__Number), obj.isKindOf(Number)) ; }
    *tstosc__isSafeInt { |num| ^and(neg(2 ** 32) <= num, num <= (2 ** 32 - 1)) ; }
    *tstosc__helper__digit_to_char_in_radix
    { |digit, radix|
        ^(if ( digit > 9, { /* char 'a' - 10 */ 87 }, { /* char '0' */ 48 } ) + digit).asAscii ;
    }

    /* For methods */

    /** TODO: Not exactly as JavaScript ! */
    toExponential
    { |fraction_digit=14| var result = storing_number.asStringPrec(fraction_digit) ;
        if( not("e[\\+\\-]\\d+$".matchRegexp(result)),
            { result = result ++ "e+0" ; } 
        ) ;
        ^result ;
    }

    /** TODO: Not exactly as JavaScript ! */
    toFixed
    { |digits=0| var result = this.toString().value, before_dot, after_dot, dot_index ;
        if ( not(TSTOSC__Number.isFinite(this)), { ^result ; } ) ;
        dot_index = result.find(".") ;
        if ( digits == 0, { ^result[0..(dot_index ? result.size)] ; } ) ;
        if ( dot_index == nil, { ^result ++ "." ++ "0".dup(digits).join() ; } ) ;
        before_dot = result[0..(dot_index-1)] ; after_dot = result[(dot_index+1)..].padRight(digits, "0") ;
        ^before_dot ++ "." ++ after_dot[0..(digits-1)]
    }

    /** TODO */
    toLocaleString { |locales=nil, options=nil| ^this.toString() ; }

    /** TODO: Not exactly as JavaScript ! */
    toPrecision { ^TSTOSC__String.new(storing_number.asStringPrec(_)) ; }

    toString
    { |radix=10| var before_dot, after_dot, result = "", remain ;
        if ( not(TSTOSC__Number.isFinite(this)), {
            case (
                { storing_number.isNaN() }, { ^"NaN" ; },
                { storing_number == inf }, { ^"Infinity" ; },
                { storing_number == -inf }, { ^"-Infinity" ; },
            ) ;
        }) ;
        if ( or(radix < 2, radix > 36),
            { Error.new("RangeError: radix should be from 2 to 36, inclusive").throw() ; }
        ) ;
        if ( not(TSTOSC__Number.isInteger(radix)), { radix = radix.value.asInteger() ; } ) ;
        if ( or(storing_number == 0, storing_number == -0), { ^"0" ; } ) ;
        before_dot = floor(abs(storing_number)).asInteger() ; after_dot = abs(storing_number) - before_dot ;
        // Convert "before_dot" to string.
        if ( before_dot != 0,
            { remain = before_dot ;
                while ( { remain > 0 }, {
                    result = TSTOSC__Number.tstosc__helper__digit_to_char_in_radix(remain % radix, radix) ++ result;
                    remain = (remain / radix).asInteger() ;
                }) ;
            },
            // "before_dot" is 0.
            { result = "0" ; }
        ) ;
        // Convert "after_dot" to string.
        if ( after_dot != 0, { var after_dot_result_length = 0, digit ; remain = after_dot ;
            result = result ++ "." ;
            while ({ and(remain != 0, after_dot_result_length <= 20) }, {
                remain = remain * radix ;
                digit = floor(remain).asInteger() ;
                result = result ++ TSTOSC__Number.tstosc__helper__digit_to_char_in_radix(digit, radix) ;
                after_dot_result_length = after_dot_result_length + 1 ;
                remain = remain - digit ;
            }) ;
        }) ;

        ^TSTOSC__String.new(if( storing_number < 0, { "-" ; }, { "" ; } ) ++ result) ;
    }

    /** for JavaScript compatibility */
    valueOf { ^this ; }

    /* for operator fallback */
    doesNotUnderstand 
    { |selector ... args|
        ^storing_number.performList(selector, args.collect(_.value)) ;
    }
}