import {Command} from './Modes/Mode';
import {SpecialKeyCommon} from './SpecialKeys/Common';

export interface Map {
    keys: string;
    command: Command;
    args?: {};
}

export interface RecursiveMap {
    [key: string]: RecursiveMap | Map;
}

export enum MatchResultType {FAILED, WAITING, FOUND};

export class Mapper {

    protected static saparator: string = ' ';
    protected specialKeys: SpecialKeyCommon[];

    private root: RecursiveMap = {};

    constructor(specialKeys: SpecialKeyCommon[] = []) {
        this.specialKeys = specialKeys;
    }

    private static isMap(node: RecursiveMap | Map): boolean {
        return node && typeof (node as Map).command === 'function';
    }

    map(joinedKeys: string, command: Command, args?: {}): void {
        let node: RecursiveMap | Map = this.root;
        const keys = joinedKeys.split(Mapper.saparator);

        keys.forEach((key, index) => {
            this.specialKeys.forEach(specialKey => {
                specialKey.unmapConflicts(node as RecursiveMap, key);
            })

            if (Mapper.isMap(node[key])) {
                delete node[key];
            }

            if (index === keys.length - 1) {
                node[key] = {
                    keys: joinedKeys,
                    command,
                    args: args || {},
                };
            }
            else {
                node[key] = node[key] || {};
                node = node[key];
            }
        });
    }

    unmap(joinedKeys: string): void {
        let node: RecursiveMap | Map = this.root;

        const keys = joinedKeys.split(Mapper.saparator);
        const lastKey = keys.pop();

        keys.every(key => {
            node = node[key];
            return node ? true : false;
        });

        if (node) {
            delete node[lastKey];
        }
    }

    match(inputs: string[]): {type: MatchResultType, map?: Map} {
        let node: RecursiveMap | Map = this.root;
        let additionalArgs = {};

        let matched = false;

        for (var index = 0; index < inputs.length; index++) {
            const input = inputs[index];

            if (node[input]) {
                node = node[input];
                matched = true;
                continue;
            }

            var matchedCount: number;
            const specialKeyMatched = this.specialKeys.some(specialKey => {
                if (! node[specialKey.indicator]) {
                    return false;
                }

                const match = specialKey.match(inputs.slice(index));
                if (match) {
                    matchedCount = match[0];

                    node = node[specialKey.indicator];
                    Object.getOwnPropertyNames(match[1]).forEach(key => {
                        additionalArgs[key] = match[1][key];
                    });

                    return true;
                }

                return false;
            });

            if (specialKeyMatched) {
                index += matchedCount - 1;
                matched = true;
                continue;
            }

            if (! matched) {
                break;
            }
        }

        if (! matched) {
            return {type: MatchResultType.FAILED};
        }
        else if (Mapper.isMap(node)) {
            const map = node as Map;

            Object.getOwnPropertyNames(additionalArgs).forEach(key => {
                map.args[key] = additionalArgs[key];
            })

            return {type: MatchResultType.FOUND, map};
        }
        else {
            return {type: MatchResultType.WAITING};
        }
    }

}
