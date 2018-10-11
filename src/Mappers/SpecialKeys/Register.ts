import {RecursiveMap, MatchResultKind} from '../Generic';
import {SpecialKeyCommon, SpecialKeyMatchResult} from './Common';

export class SpecialKeyRegister implements SpecialKeyCommon {

    indicator = '{reg}';
    regex = /[a-zA-Z0-9]/;

    unmapConflicts(node: RecursiveMap, keyToMap: string): void {
        delete node[this.indicator];

        if (keyToMap === this.indicator) {
            node = {};
        }
    }

    matchSpecial(
        inputs: string[],
        additionalArgs: {[register: string]: any},
        lastSpecialKeyMatch?: SpecialKeyMatchResult,
    ): SpecialKeyMatchResult | null {
        if (! this.regex.test(inputs[0])) {
            return null;
        }

        additionalArgs.register = inputs[0];

        return {
            specialKey: this,
            kind: MatchResultKind.FOUND,
            matchedCount: 1,
        };
    }

}
