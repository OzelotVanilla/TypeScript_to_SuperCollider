export const null__class_source_code = `
TSTOSC__Null
{
    classvar singleton_value = nil ;
    /** Singleton */
    *new
    {
        ^singleton_value ?? { singleton_value = super.new().initTSTOSC__Null() ; } ;
    }
    asString { ^"null" ; }
    initTSTOSC__Null { ^this ; }
}
`.trim();