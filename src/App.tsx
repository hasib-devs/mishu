import { useState } from "react";
import "./App.css";

function App() {
  const [count, setCount] = useState(0);
  const [name, setName] = useState("unknown");

  return (
    <div>
      <h1>Hello Mishu</h1>
    </div>
  );
}

export default App;
