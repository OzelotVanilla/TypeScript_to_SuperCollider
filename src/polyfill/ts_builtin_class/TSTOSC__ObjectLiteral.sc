/**
 * This class is only used for wrap object literal in converted TypeScript code.
 * 
 * For "Object" class itself, refer to "TSTOSC__Object".
 */
TSTOSC__ObjectLiteral : TSTOSC__Object
{
    var storing_dict;

    *new
    { |object_literal=nil|
        if ( (object_literal != nil) && not(object_literal.isKindOf(Dictionary)),
            { Exception.new(
                "TSTOSC__ObjectLiteral should be inited by \\\"Dictionary\\\", "
                ++ "not \\\"" ++ object_literal.class ++ "\\\"."
            ).throw(); },
            { }
        ) ;
        ^super.new.initTSTOSC__ObjectLiteral(object_literal)
    }

    initTSTOSC__ObjectLiteral
    { |object_literal|
        storing_dict = object_literal;
        ^this
    }

    at
    { |selector|
        if (storing_dict.includesKey(selector),
            {
                var val = storing_dict.at(selector);
                if (val.isKindOf(Function),
                    { ^{ |...a| val.valueArray([this] ++ a) ; } ; },
                    { ^val ; }
                ) ;
            },
            { ^nil ; }
        ) ;
    }
}