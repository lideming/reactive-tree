import { arrayEquals, queueFunction } from "./util";


export function useState<T>(initValue: T) {
    const instance = currentContext.instance;
    if (!instance) throw new Error("hooks must be called in a component");
    let hookState: HookInType<"state">;
    if (currentContext.firstRender) {
        hookState = { type: 'state', value: initValue };
        instance.hooks.push(hookState);
    } else {
        hookState = currentContext.getHookState("state");
    }
    const setter = (newValue: T) => {
        hookState.value = newValue;
        instance.onStateChanged();
    };
    return [hookState.value, setter] as const;
}

export function useMemo<T>(func: () => T, deps: any[]) {
    const instance = currentContext.instance;
    if (!instance) throw new Error("hooks must be called in a component");
    let hookState: HookInType<"memo">;
    if (currentContext.firstRender) {
        hookState = { type: 'memo', value: func(), deps };
        instance.hooks.push(hookState);
    } else {
        hookState = currentContext.getHookState("memo");
        const depsChanged = !arrayEquals(deps, hookState.deps);
        hookState.deps = deps;
        if (depsChanged) {
            hookState.value = func();
        }
    }
    return hookState.value;
}

export type EffectFunction = () => (void | EffectCleanupFunction);
export type EffectCleanupFunction = () => void;

export function useEffect(func: EffectFunction, deps?: any[]) {
    if (!currentContext.instance) throw new Error("hooks must be called in a component");
    let hookState: HookInType<"effect">;
    let runEffect = false;
    if (currentContext.firstRender) {
        hookState = { type: 'effect', function: func, deps: deps, cleanup: undefined };
        currentContext.instance.hooks.push(hookState);
        runEffect = true;
    } else {
        hookState = currentContext.getHookState("effect");
        // Check deps and decide whether to rerun the effect
        const oldDeps = hookState.deps;
        hookState.deps = deps;
        if (!deps) {
            runEffect = true;
        } else {
            runEffect = !arrayEquals(oldDeps!, deps);
        }
    }
    if (runEffect) {
        hookState.function = func;
        queueFunction(() => {
            // Cleanup the old effect
            if (hookState.cleanup) {
                hookState.cleanup();
            }
            // Run the new effect
            const cleanup = hookState.function();
            // Save the cleanup function
            if (typeof cleanup == "function") {
                hookState.cleanup = cleanup;
            } else {
                hookState.cleanup = undefined;
            }
        });
    }
}

export const currentContext = {
    instance: null as HookContext | null,
    hookIndex: 0,
    firstRender: false,
    pushHookState(hook: Hook) {
        this.instance!.hooks.push(hook);
    },
    getHookState<T extends Hook['type']>(expectType: T): HookInType<T> {
        const hook = this.instance!.hooks[this.hookIndex++];
        if (hook.type !== expectType) throw new Error(`hooks should not change between calls`);
        return hook as any;
    },
}

export function enterContext(context: HookContext) {
    currentContext.instance = context;
    currentContext.hookIndex = 0;
    currentContext.firstRender = !context.hasRendered;
    context.hasRendered = true;
}

export function exitContext() {
    currentContext.instance = null;
}

export class HookContext {
    hooks: Hook[] = [];
    onStateChanged: (() => void);
    hasRendered = false;
    constructor(onStateChanged: (() => void)) {
        this.onStateChanged = onStateChanged;
    }
    unmount() {
        // Check live hooks
        for (const it of this.hooks) {
            // Run the cleanup function of effect hook
            if (it.type === "effect" && it.cleanup) it.cleanup();
        }
    }
}



type Hook =
    | {
        type: "state",
        value: any,
    }
    | {
        type: "memo",
        value: any,
        deps: any[],
    }
    | {
        type: "effect",
        function: EffectFunction,
        deps: any[] | undefined,
        cleanup: EffectCleanupFunction | undefined,
    };

type HookInType<T extends Hook['type']> = Extract<Hook, { type: T }>;
