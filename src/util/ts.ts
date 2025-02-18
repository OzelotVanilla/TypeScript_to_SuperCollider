import ts from "typescript"

const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed, omitTrailingSemicolon: true })
const fake_source_file = ts.createSourceFile("fake_source_file__tryFindSourceFile.ts", "", ts.ScriptTarget.Latest)

function tryFindSourceFile(node: ts.Node): ts.SourceFile
{
    if (ts.isSourceFile(node)) { return node }
    if (node.parent != undefined && node.parent != null) { return tryFindSourceFile(node.parent) }

    return fake_source_file
}

/**
 * ### Warning
 * 
 * This function is problematic. If the node contains thees node together:
 * * node with a `parent` that is finally a `ts.SourceFile` (node from compiled text)
 * * node without a parent (node created by `ts.factory` in code)
 * 
 * The node will not be correctly printed.
 */
export function convertToTSExpression(node: ts.Node)
{
    return printer.printNode(ts.EmitHint.Unspecified, node, tryFindSourceFile(node))
}

export function printTSExpression(...node: ts.Node[])
{
    console.log(
        ...node.map(n => convertToTSExpression(n))
    )
}

export function getTypeOfTSNode(program: ts.Program, node: ts.Node)
{
    return program.getTypeChecker().getTypeAtLocation(node)
}