import { createRoot, jsx, useEffect, useState } from "./index";
import fetch from "node-fetch";

function Index() {
    return <App />;
}

function App() {
    return {
        currentTime: <CurrentTime />,
        timer: <Timer interval={1000} />,
        myIp: <MyIp />
    };
}

function CurrentTime() {
    const [date, setDate] = useState(new Date());
    useEffect(() => {
        const timer = setInterval(() => {
            setDate(new Date());
        }, 100);
        return () => clearInterval(timer);
    }, []);
    return date;
}

function Timer(props: { interval: number }) {
    const current = useTimer(props.interval);
    return {
        interval: props.interval,
        value: current,
    };
}

function MyIp() {
    const [ip, setIp] = useState("");
    useEffect(() => {
        fetch("https://yuuza.net/api/myip").then(async (resp) => {
            setIp(await resp.text());
        })
    }, []);
    return ip || "(querying)";
}

function useTimer(interval: number) {
    const [counter, setCounter] = useState(0);
    useEffect(() => {
        setTimeout(() => {
            setCounter(counter + 1);
        }, interval);
    }, [counter]);
    return counter;
}

const app = createRoot(<Index />);
app.onRendered((current) => {
    console.clear();
    console.info(current);
});
