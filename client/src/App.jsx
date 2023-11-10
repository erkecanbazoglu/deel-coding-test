import { useState, useEffect } from "react";
import "./App.css";

function App() {
  const [state, setState] = useState(null);

  // Connects to the backend server
  const baseURL = "http://localhost:3001";

  // Getting the path from the URL including the query string
  const apiPath = window.location.href.split(window.location.origin)[1];

  // You can change the profileId to test different scenarios
  const profileId = 3;

  useEffect(() => {
    // Example request:
    handleAPICall(`${baseURL}${apiPath}`, profileId);
  }, []);

  const handleAPICall = (url, profileId) => {
    fetch(url, {
      headers: {
        "Content-Type": "application/json",
        profile_id: profileId,
      },
    })
      .then((response) => response.json())
      .then((data) => {
        console.log("Result: ", data);
        setState(data);
      })
      .catch((error) => {
        console.log("Error: ", error);
        setState("An error occurred, please see the console.");
      });
  };

  return (
    <div className="center">
      <h1>Result:</h1>
      <p className="text">{JSON.stringify(state)}</p>
    </div>
  );
}

export default App;
