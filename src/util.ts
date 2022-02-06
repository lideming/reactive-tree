

export function arrayEquals(a: any[], b: any) {
    if (a === b) return true;
    if (!a || !b) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}

/** Not deep equals */
export function objectEquals(a: any, b: any) {
    return a === b
        || (a && b
            && arrayEquals(Object.keys(a), Object.keys(b))
            && arrayEquals(Object.values(a), Object.values(b)));
}


export function queueFunction(func: () => void) {
    queueMicrotask(func);
}