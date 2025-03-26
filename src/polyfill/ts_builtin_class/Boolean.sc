/**
 * Since Boolean in JavaScript is not too different from SuperCollider,
 *  this file decides to extends SCLang's `Boolean` for these JavaScript methods.
 */
+Boolean
{
    toString { ^this.asString() ; }
    valueOf { ^this.value ; }
}