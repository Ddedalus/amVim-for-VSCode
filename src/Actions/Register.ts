import {window, Position, Range} from 'vscode';
import {StaticReflect} from '../LanguageExtensions/StaticReflect';
import {SymbolMetadata} from '../Symbols/Metadata';
import {ActionMoveCursor} from './MoveCursor';
import {ActionSelection} from './Selection';
import {Motion} from '../Motions/Motion';
import {MotionCharacter} from '../Motions/Character';
import {MotionDirection} from '../Motions/Direction';
import {MotionLine} from '../Motions/Line';
import {TextObject} from '../TextObjects/TextObject';
import {UtilRange} from '../Utils/Range';
import {UtilText} from '../Utils/Text';

export class Register {
    readonly text: string;
    readonly isLinewise: boolean;

    private _lineCount: number | undefined = undefined;
    public get lineCount(): number {
        if (this._lineCount === undefined) {
            this._lineCount = UtilText.getLineCount(this.text);
        }
        return this._lineCount;
    }

    constructor(args: {
        text: string,
        isLinewise?: boolean
    }) {
        this.text = args.text;
        this.isLinewise = args.isLinewise === undefined ? false : args.isLinewise;
    }
}

export class ActionRegister {

    static readonly defaultRegister = "p";
    private static registers = new Map<string, Register>();

    static GetStash(args: {register:string}): Register {
        console.log("Get stash");
        const reg = ActionRegister.registers.get(args.register);
        if(! reg) return new Register({text: ""});
        console.log("Register " + args.register + ": " + reg.text);
        return reg;
    }

    static yankRanges(args: {
        ranges: Range[],
        register?: string,
        isLinewise: boolean,
    }): Thenable<boolean> {
        const activeTextEditor = window.activeTextEditor;

        if (! activeTextEditor) {
            return Promise.resolve(false);
        }

        const document = activeTextEditor.document;

        if (args.isLinewise) {
            args.ranges = args.ranges.map(range => UtilRange.toLinewise(range, document));
        }

        args.ranges = UtilRange.unionOverlaps(args.ranges);

        const text = args.ranges.map(range => {
            return document.getText(document.validateRange(range));
        }).join('');

        args.register = args.register === undefined
                                ? ActionRegister.defaultRegister
                                : args.register;
        // ActionRegister.registers.delete(args.register)
        ActionRegister.registers.set(args.register, new Register({
            text: text,
            isLinewise: args.isLinewise
        }));

        return Promise.resolve(true);
    }

    static yankByMotions(args: {
        motions: Motion[],
        register?: string,
        isChangeAction?: boolean,
    }): Thenable<boolean> {
        args.isChangeAction = args.isChangeAction === undefined ? false : args.isChangeAction;

        const activeTextEditor = window.activeTextEditor;

        if (! activeTextEditor) {
            return Promise.resolve(false);
        }

        const isLinewise = args.motions.some(motion => motion.isLinewise);

        const ranges = activeTextEditor.selections.map(selection => {
            const start = selection.active;
            const end = args.motions.reduce((position, motion) => {
                return motion.apply(position, {
                    isInclusive: true,
                    shouldCrossLines: false,
                    isChangeAction: args.isChangeAction,
                });
            }, start);
            return new Range(start, end);
        });

        return ActionRegister.yankRanges({
            ranges: ranges,
            register: args.register,
            isLinewise: isLinewise,
        });
    }

    static yankByTextObject(args: {textObject: TextObject, register?: string}): Thenable<boolean> {
        const activeTextEditor = window.activeTextEditor;

        if (! activeTextEditor) {
            return Promise.resolve(false);
        }

        const document = activeTextEditor.document;

        let ranges: Range[] = [];

        activeTextEditor.selections.forEach(selection => {
            const match = args.textObject.apply(selection.active);
            if (match) {
                ranges.push(match);
            }
        });

        // `ranges` is already line-wise so yankRanges is not suitable.

        ranges = UtilRange.unionOverlaps(ranges);

        const text = ranges.map(range => {
            return document.getText(document.validateRange(range));
        }).join('');

        args.register = args.register === undefined
        ? ActionRegister.defaultRegister
        : args.register;
        ActionRegister.registers.set(args.register, new Register({
            text: text,
            isLinewise: args.textObject.isLinewise,
        }));

        return Promise.resolve(true);
    }

    static yankSelections(args: {isLinewise?: boolean, register?: string}): Thenable<boolean> {
        args.isLinewise = args.isLinewise === undefined ? false : args.isLinewise;

        const activeTextEditor = window.activeTextEditor;

        if (! activeTextEditor) {
            return Promise.resolve(false);
        }

        return ActionRegister.yankRanges({
            ranges: activeTextEditor.selections,
            isLinewise: args.isLinewise,
        });
    }

    static yankLines(args: {n?: number, register?: string}): Thenable<boolean> {
        args.n = args.n === undefined ? 1 : args.n;

        const activeTextEditor = window.activeTextEditor;

        if (! activeTextEditor) {
            return Promise.resolve(false);
        }

        const ranges = args.n === 1
            ? activeTextEditor.selections
            : activeTextEditor.selections.map(selection => selection.with({
                end: selection.end.translate(args.n! - 1),
            }));

        return ActionRegister.yankRanges({
            ranges: ranges,
            register: args.register,
            isLinewise: true,
        });
    }

    @StaticReflect.metadata(SymbolMetadata.Action.isChange, true)
    static putAfter(args: {n?: number, register?: string}): Thenable<boolean> {
        args.n = args.n === undefined ? 1 : args.n;
        args.register = args.register === undefined
        ? ActionRegister.defaultRegister
        : args.register;

        if (! ActionRegister.registers.has(args.register)) {
            return Promise.resolve(false);
        }

        const activeTextEditor = window.activeTextEditor;

        if (! activeTextEditor) {
            return Promise.resolve(false);
        }

        const stash = ActionRegister.registers.get(args.register);
        if(! stash)
            return Promise.resolve(false);

        const putPositions = activeTextEditor.selections.map(selection => {
            return stash.isLinewise
                ? new Position(selection.active.line + 1, 0)
                : selection.active.translate(0, +1);
        });

        const textToPut = stash.text.repeat(args.n);

        return ActionSelection.shrinkToActives()
            .then(() => {
                return activeTextEditor.edit((editBuilder) => {
                    putPositions.forEach(position => {
                        editBuilder.insert(position, textToPut);
                    });
                });
            })
            .then(() => {
                if (stash.isLinewise) {
                    return ActionMoveCursor.byMotions({motions: [
                        MotionCharacter.down(),
                        MotionLine.firstNonBlank(),
                    ]});
                }
                else if (stash.lineCount > 1) {
                    return ActionMoveCursor.byMotions({motions: [
                        MotionCharacter.right(),
                    ]});
                }
                else {
                    const characters = textToPut.length;
                    return ActionMoveCursor.byMotions({motions: [
                        MotionCharacter.right({n: characters}),
                    ]});
                }
            });
    }

    @StaticReflect.metadata(SymbolMetadata.Action.isChange, true)
    static putBefore(args: {n?: number, register?: string}): Thenable<boolean> {
        args.n = args.n === undefined ? 1 : args.n;
        args.register = args.register === undefined
        ? ActionRegister.defaultRegister
        : args.register;

        if (! ActionRegister.registers.has(args.register)) {
            return Promise.resolve(false);
        }

        const activeTextEditor = window.activeTextEditor;

        if (! activeTextEditor) {
            return Promise.resolve(false);
        }

        const stash = ActionRegister.registers.get(args.register);
        if(! stash)
            return Promise.resolve(false);

        const putPositions = activeTextEditor.selections.map(selection => {
            return stash.isLinewise
                ? selection.active.with(undefined, 0)
                : selection.active;
        });

        const textToPut = stash.text.repeat(args.n);

        return ActionSelection.shrinkToActives()
            .then(() => {
                return activeTextEditor.edit((editBuilder) => {
                    putPositions.forEach(position => {
                        editBuilder.insert(position, textToPut);
                    });
                });
            })
            .then(() => {
                if (stash.isLinewise) {
                    return ActionMoveCursor.byMotions({motions: [
                        MotionCharacter.up({n: UtilText.getLineCount(textToPut) - 1}),
                        MotionLine.firstNonBlank(),
                    ]});
                }
                else if (stash.lineCount > 1) {
                    return ActionMoveCursor.byMotions({motions: [
                        MotionDirection.prev({n: textToPut.length - args.n!}),
                    ]});
                }
                else {
                    return ActionMoveCursor.byMotions({motions: [
                        MotionCharacter.left(),
                    ]});
                }
            });
    }

}
