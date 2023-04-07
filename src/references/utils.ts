import {Range, TextDocument} from "vscode";

// copied from https://github.com/microsoft/vscode/blob/2e34c9a884d0da9728d36b0eb5708a6d9d377328/extensions/references-view/src/utils.ts#L32
export function getPreviewChunks(doc: TextDocument, range: Range, beforeLen: number = 8, trim: boolean = true) {
    const previewStart = range.start.with({ character: Math.max(0, range.start.character - beforeLen) });
    const wordRange = doc.getWordRangeAtPosition(previewStart);
    let before = doc.getText(new Range(wordRange ? wordRange.start : previewStart, range.start));
    const inside = doc.getText(range);
    const previewEnd = range.end.translate(0, 331);
    let after = doc.getText(new Range(range.end, previewEnd));
    if (trim) {
        before = before.replace(/^\s*/g, '');
        after = after.replace(/\s*$/g, '');
    }
    return { before, inside, after };
}