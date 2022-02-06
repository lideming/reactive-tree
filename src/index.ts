
export type ComponentFunction = (props?: any) => any;

export type ComponentDescriptor = {}

export function Compoment(func: ComponentFunction, props?: any): ComponentDescriptor {
    return {
        [componentMark]: true,
        func,
        props,
    };
}

export function jsx(component: ComponentFunction, props: any, children: any[]) {
    return Compoment(component, { ...props, children });
}

export function createRoot(component: ComponentDescriptor) {
    if (!(component as any)[componentMark]) throw new Error("it is not a component");
    const { func, props } = component as any;
    const context = new Context();
    const instance = new ComponentInstance(func, props, context);
    instance.doRender(false);
    return {
        get current() {
            return instance.current;
        },
        onRendered(callback: (current: any) => void) {
            callback(this.current);
            this.onUpdated(callback);
        },
        onUpdated(callback: (current: any) => void) {
            context.onRendered.push(() => {
                callback(instance.current);
            });
        },
    }
}

export function useState<T>(initValue: T) {
    const instance = renderContext.instance;
    if (!instance) throw new Error("hooks must be called in a component");
    let hookState: HookInType<"state">;
    if (renderContext.firstRender) {
        hookState = { type: 'state', value: initValue };
        instance.hookStates.push(hookState);
    } else {
        hookState = renderContext.getHookState("state");
    }
    const setter = (newValue: T) => {
        if (instance.unmounted) {
            // console.warn("cannot set state after the component is unmounted");
            return;
        }
        hookState.value = newValue;
        instance.needRender();
    };
    return [hookState.value, setter] as const;
}

export function useMemo<T>(func: () => T, deps: any[]) {
    const instance = renderContext.instance;
    if (!instance) throw new Error("hooks must be called in a component");
    let hookState: HookInType<"memo">;
    if (renderContext.firstRender) {
        hookState = { type: 'memo', value: func(), deps };
        instance.hookStates.push(hookState);
    } else {
        hookState = renderContext.getHookState("memo");
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
    if (!renderContext.instance) throw new Error("hooks must be called in a component");
    let hookState: HookInType<"effect">;
    let runEffect = false;
    if (renderContext.firstRender) {
        hookState = { type: 'effect', function: func, deps: deps, cleanup: undefined };
        renderContext.instance.hookStates.push(hookState);
        runEffect = true;
    } else {
        hookState = renderContext.getHookState("effect");
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

let renderContext = {
    instance: null as ComponentInstance | null,
    hookIndex: 0,
    firstRender: false,
    pushHookState(hook: Hook) {
        this.instance!.hookStates.push(hook);
    },
    getHookState<T extends Hook['type']>(expectType: T): HookInType<T> {
        const hook = this.instance!.hookStates[this.hookIndex++];
        if (hook.type !== expectType) throw new Error(`hooks should not change between calls`);
        return hook as any;
    },
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

type RenderFunction = (props: any) => any;

const componentMark = Symbol('component');

class Context {
    onRendered: (() => void)[] = [];
}

class ComponentInstance {
    props: any;
    hookStates: Hook[] = null!;
    current: any;
    components: ComponentInstance[] = [];
    context: Context = null!;
    onRendered: (() => void) | null = null;
    renderFunc: RenderFunction;
    pendingRender = false;
    unmounted = false;
    constructor(render: RenderFunction, props: any, context: Context) {
        this.renderFunc = render;
        this.props = props;
        this.context = context;
    }

    needRender() {
        if (!this.pendingRender) {
            this.pendingRender = true;
            queueFunction(() => {
                this.pendingRender = false;
                this.doRender(false);
            });
        }
    }

    doRender(triggerByParent: boolean) {
        renderContext.instance = this;
        renderContext.hookIndex = 0;
        renderContext.firstRender = !this.hookStates;
        if (!this.hookStates) this.hookStates = [];

        const newTree = this.renderFunc(this.props);

        renderContext.instance = null;

        let currentReplaced = false;
        const newComponents: ComponentInstance[] = [];
        visitForComponent(newTree, (parentNode, key, value) => {
            let component: ComponentInstance | null = null;
            // Try get the same component from old components
            // Expecting it will be the same order
            const oldComponent = this.components.shift();
            if (oldComponent) {
                if (oldComponent.renderFunc === value.func) {
                    newComponents.push(oldComponent);
                    if (!objectEquals(oldComponent.props, value.props)) {
                        // If props changed, update props and rerender
                        oldComponent.props = value.props;
                        oldComponent.doRender(true);
                    }
                    component = oldComponent;
                } else {
                    // If the component changed, unmount the old component instance and render the new one
                    oldComponent.unmount();
                }
            }

            if (!component) {
                // Render with new component instance
                component = new ComponentInstance(value.func, value.props, this.context);
                newComponents.push(component);
                component.doRender(true);
            }

            // Replace the component node with the rendered result of the component
            component.onRendered = () => {
                if (parentNode)
                    parentNode[key] = component!.current;
                else
                    this.current = component!.current;
            };
            component.onRendered();

            if (!parentNode) currentReplaced = true;
        });

        // Unmount unused components
        for (const component of this.components) {
            component.unmount();
        }

        this.components = newComponents;
        if (!currentReplaced) {
            this.current = newTree;
        }

        this.onRendered?.();

        if (!triggerByParent) {
            this.context.onRendered.forEach(callback => callback());
        }
    }

    unmount() {
        // Check live hooks
        for (const it of this.hookStates) {
            // Run the cleanup function of effect hook
            if (it.type === "effect" && it.cleanup) it.cleanup();
        }

        this.unmounted = true;
    }
}

function queueFunction(func: () => void) {
    queueMicrotask(func);
}

function visitForComponent(node: any, callback: (node: any, key: any, value: any) => void) {
    if (typeof node == "object") {
        if (node[componentMark]) {
            callback(null, null, node);
        } else {
            _visitForComponent(node, callback);
        }
    }
}

function _visitForComponent(node: any, callback: (node: any, key: any, value: any) => void) {
    const prototype = Object.getPrototypeOf(node);
    if (prototype !== Object.prototype && prototype !== Array.prototype && prototype != null) return;
    for (const key in node) {
        if (Object.prototype.hasOwnProperty.call(node, key)) {
            const value = node[key];
            if (value && value[componentMark]) {
                callback(node, key, value);
            } else {
                visitForComponent(value, callback);
            }
        }
    }
}

function arrayEquals(a: any[], b: any) {
    if (a === b) return true;
    if (!a || !b) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}

/** Not deep equals */
function objectEquals(a: any, b: any) {
    return a === b
        || (a && b
            && arrayEquals(Object.keys(a), Object.keys(b))
            && arrayEquals(Object.values(a), Object.values(b)));
}
