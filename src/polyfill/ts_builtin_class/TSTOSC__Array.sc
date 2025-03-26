TSTOSC__Array : TSTOSC__Object
{
    var storing_array ;
    normIndex { |i| if( i >= 0, { ^i }, { ^this.length + i } ) ; }

    /* For constructor-releated */

    *new
    { |...params| var first = params[0], second = params[1], array_literal=[] ;
        if ( and(TSTOSC__Number.tstosc__alikeNumber(first), second == nil),
            // Only give array space.
            { array_literal.grow(first) ; ^super.new.initTSTOSC__Array(array_literal) ; },
            // Collect all items.
            { ^TSTOSC__Array.of(params) ; }
        ) ;
    }

    initTSTOSC__Array
    { |sclang_array|
        storing_array = sclang_array ;
        ^this ;
    }

    *from
    { |array_like, mapper=nil, this_arg=nil| mapper = mapper ? { |e| e ; } ;
        if ( this_arg == nil,
            {
                if ( mapper == nil,
                    { ^super.new.initTSTOSC__Array(array_like.value) ; },
                    {
                        ^super.new.initTSTOSC__Array(switch (array_like.class,
                            { Array },         { array_like.collect(mapper.(_, _, array_like)) ; },
                            { TSTOSC__Array }, { ^array_like.map(mapper) ; },
                            { Error.new("\"Array.from\" cannot use " ++ array_like.class ++ " to initialise.").throw() ; }
                        ) ) ;
                    }
                ) ;
            },
            { this_arg.map(mapper) }
        ) ;
    }

    *of { |...items| ^super.new.initTSTOSC__Array(items) ; }

    /* For SCLang */

    asString { ^"TSTOSC__Array([" ++ storing_array.collect(_.asString()).join(", ") ++ "])" ; }
    value { ^storing_array ; }

    /* For other polyfill class */

    *tstosc__alikeArray { |obj| ^or(TSTOSC__Array.isArray(obj), obj.isKindOf(Array)) ; }

    /* For methods */

    *isArray { |obj| ^obj.isKindOf(TSTOSC__Array) ; }

    at { |index| ^storing_array[this.normIndex(index)] ; }

    concat { |...array_or_values| ^TSTOSC__Array.from(storing_array ++ array_or_values.insert(0, []).reduce(_ ++ _)) ; }

    /** mutating */
    copyWithin
    { |target, start, end=nil| var slice, i = 0 ;
        target = this.normIndex(target) ; start = this.normIndex(start) ; end = this.normIndex(end ? storing_array.size) ;
        slice = storing_array[start..end-1] ;
        while (
            { (i < slice.size) && (target + i < storing_array.size) },
            { storing_array.put(target + i, slice[i]) ; i = i + 1 }
        ) ;
        ^this ;
    }

    entries { ^TSTOSC__Array.from(storing_array.collect({ |item, index| TSTOSC__Array.from([index, item]) ; })) ; }

    every { |checker| ^storing_array.every({ |item, index| checker.(item, index, this) ; }) ; }

    /** mutating, do not use ".putSeries" since it will fill last element even "start" is out-of-range. */
    fill
    { |value, start=0, end=nil| var i ;
        i = start = this.normIndex(start) ; end = min(this.normIndex(end ? storing_array.size), storing_array.size) ;
        while ( { i < end ; }, { storing_array.put(i, value) ; i = i + 1 } ) ;
        ^this ;
    }

    filter { |checker| ^TSTOSC__Array.from(storing_array.select({ |item, index| checker.(item, index, this) ; })) ; }

    find { |checker| ^storing_array.detect({ |item, index| checker.(item, index, this) ; }) ; }

    findIndex { |checker| ^storing_array.detectIndex({ |item, index| checker.(item, index, this) ; }) ; }

    findLast
    { |checker| var i = this.length - 1 ;
        while ({ i >= 0}, { if(checker.(this[i], i, this), { ^this[i] }, {}) ; i = i - 1 ; }) ;
        ^nil ;
    }

    findLastIndex
    { |checker|
        var i = this.length - 1 ;
        while ({ i >= 0}, { if(checker.(this[i], i, this), { ^i }, {}) ; i = i - 1 ; }) ;
        ^-1 ;
    }

    flat { |depth=1| ^TSTOSC__Array.from(storing_array.flatten(depth)) ; }

    flatMap { |mapper| ^TSTOSC__Array.from(storing_array.collect({ |item, index| mapper.(item, index, this) ; }).flatten(1)) ; }

    forEach { |iter| storing_array.do({ |item, index| iter.(item, index, this) ; }) ; ^nil ; }

    includes
    { |search_value, from_index=0| var i = 0 ; from_index = min(this.normIndex(from_index), storing_array.size - 1) ;
        while(
            { from_index + i < storing_array.size},
            { if( storing_array[from_index + i] == search_value, { ^true ; } ) ; i = i + 1 ; }
        ) ;
        ^false ;
    }

    indexOf
    { |search_element, from_index=0| var i = 0 ; from_index = min(this.normIndex(from_index), storing_array.size - 1) ;
        while(
            { from_index + i < storing_array.size},
            { if( storing_array[from_index + i] == search_element, { ^from_index + i ; } ) ; i = i + 1 ; }
        ) ;
        ^-1 ;
    }

    join { |by=","| ^storing_array.join(by) ; }

    keys { ^TSTOSC__Array.from(Array.iota(storing_array.size)) ; }

    lastIndexOf
    { |search_element, from_index=nil| var i = 0 ; from_index = min(this.normIndex(from_index), storing_array.size - 1) ;
        while(
            { from_index - i >= 0},
            { if( storing_array[from_index - i] == search_element, { ^from_index - i ; } ) ; i = i + 1 ; }
        ) ;
        ^-1 ;
    }

    map { |mapper| ^TSTOSC__Array.from(storing_array.collect({ |item, index| mapper.(item, index, this) ; })) ; }
    
    pop { ^storing_array.pop() ;}

    push { |value| storing_array.add(value) ; ^storing_array.size ; }

    reduce
    { |reducer, init_value=nil| var index = -1 ;
        ^(if ( init_value != nil, { [init_value] ++ storing_array }, { storing_array } ))
             .reduce({ |accu, curr| index = index + 1 ; reducer.(accu, curr, index, this) ; }) ;
    }

    reduceRight
    { |reducer, init_value=nil| var index = storing_array.size - 1, accu ;
        accu = if ( (init_value != nil) && (storing_array[index] != nil),
            { reducer.(init_value, storing_array[index], index, this) ; },
            { storing_array[index] ; }
        ) ;
        index = index - 1 ;
        while( { index >= 0 }, { accu = reducer.(accu, storing_array[index], index, this) ; index = index - 1 ; }  ) ;
        ^accu ;
    }

    /** mutating */
    reverse { storing_array = storing_array.reverse() }
    
    /** mutating */
    shift { var result = storing_array[0] ; storing_array.removeAt(0) ; ^result ; }

    slice 
    { |start, end=nil| start = this.normIndex(start) ; end = this.normIndex(end ? storing_array.size) ;
        ^TSTOSC__Array.from(storing_array.copyRange(start, end)) ;
    }
    
    some { |checker| ^storing_array.any({ |item, index| checker.(item, index, this) ; }) ; }

    /** mutating */
    sort
    { |compare_func=nil|
        storing_array = if ( compare_func == nil,
            // To follow the logic in JavaScript (although that is weird).
            { storing_array.collect(_.asString).sort() ; },
            // If have compare func, turn negative and zero value to "true", and positive to "false".
            { storing_array.sort({ |a, b| compare_func.(a, b) <= 0 ; }) ; }
        ) ;
        ^this ;
    }

    /** mutating */
    splice
    { |...params| var start = params[0], delete_count = params[1], i = 0, deleted_element = [], end, items = params[2..] ;
        if ( start == nil, { ^TSTOSC__Array.from([]); } ) ; start = this.normIndex(start) ;
        delete_count = delete_count ? inf ; end = min(start + delete_count, storing_array.size).asInteger ;
        // "delete_count" might be negative.
        if ( end > start, { deleted_element = storing_array.copyRange(start, end-1) ; } ) ;
        storing_array =
            if ( start > 0, { storing_array[0..start-1] ; }, { [] ; } )
            ++ items
            ++ if ( storing_array.size > end, { storing_array[end..storing_array.size-1] ; }, { [] ; } )  ;
        ^deleted_element ;
    }

    toLocaleString
    { |locales=nil, options=nil|
        ^TSTOSC__Array.from(storing_array.collect(
            { |e, i, a| if (e.respondsTo(\toLocaleString), { e.toLocaleString(locales, options) ; }, { e.asString() ; } ) ; }
        )) ;
    }

    toReversed { ^TSTOSC__Array.from(storing_array[0..].reverse()) ; }

    toSorted { |compare_func=nil| ^TSTOSC__Array.from(storing_array[0..]).sort(compare_func) ; }

    toSpliced { |...items| var r = TSTOSC__Array.from(storing_array[0..]) ; r.splice(items) ; ^r ; }
    
    toString { ^storing_array.join(",") ; }

    unshift { |...items| storing_array.grow(items.size) ; storing_array = items ++ storing_array ; ^storing_array.size ; }

    values { ^TSTOSC__Array.from(storing_array) ; }

    with
    { |index, value| var a ; index = this.normIndex(index) ;
        if ( index < storing_array.size,
            { a = storing_array[0..] ; a[index] = value ; },
            { Error.new("Range Error: index " ++ index ++ " out-of-range (size: " ++ storing_array.size ++ ").").throw() ; }
        ) ;
        ^TSTOSC__Array.from(a) ;
    }

    /* For properties */

    length { ^TSTOSC__Number.new(this.tstosc__length) ; }
    tstosc__length { ^storing_array.size ; }
}