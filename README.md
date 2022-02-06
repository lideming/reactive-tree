# Reactive Tree

Render a tree of data with hooks, without React.

```tsx
function App() {
    const [counter, setCounter] = useState(0);

    useEffect(() => {
        setTimeout(() => {
            setCounter(counter + 1);
        }, 1000);
    }, [counter]);

    return {
        counter: counter,
    };
}
```

Check `src/demo.tsx` for demo.

To run the demo: clone the repository, then run `pnpm i && pnpm build && pnpm start`.

## Features

- Hooks: useState, useEffect, useMemo
- Component hierarchy
- Optinally JSX
