import { enterContext, exitContext, HookContext } from "./hooks";
import { objectEquals, queueFunction } from "./util";

export { useState, useMemo, useEffect } from "./hooks"

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
type RenderFunction = (props: any) => any;

const componentMark = Symbol('component');

class Context {
    onRendered: (() => void)[] = [];
}

class ComponentInstance {
    props: any;
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

    onStateChanged = () => {
        if (this.unmounted) {
            // console.warn("cannot set state after the component is unmounted");
            return;
        }
        this.needRender();
    };

    hookStates = new HookContext(this.onStateChanged);

    needRender() {
        if (!this.pendingRender) {
            this.pendingRender = true;
            queueFunction(() => {
                if (!this.pendingRender) return;
                this.doRender(false);
            });
        }
    }

    doRender(triggerByParent: boolean) {
        this.pendingRender = false;

        enterContext(this.hookStates);

        const newTree = this.renderFunc(this.props);

        exitContext();

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
        this.hookStates.unmount();

        this.unmounted = true;
    }
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